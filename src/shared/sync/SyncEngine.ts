import { DATA_FILES, HEARTBEAT_MS, LOCK_FILE, POLL_MS } from '../constants'
import { DataSetSchema, LockSchema } from '../schemas'
import type { DataSet, Lock } from '../types'
import { fmtDate } from '../util'
import {
  commitMessage,
  describeChanges,
  diffData,
  hasChanges,
  LOCK_COMMIT_PREFIX,
  type ChangeSummary
} from './commitMessage'
import { FREE_LOCK, lockState, makeLock, serializeLock, type Identity } from './lock'
import { ConflictError, OfflineError, RefMovedError, type CommitInfo, type RemoteStore } from './RemoteStore'

type DataKey = keyof typeof DATA_FILES
const KEYS = Object.keys(DATA_FILES) as DataKey[]
const TRACKED = [...Object.values(DATA_FILES), LOCK_FILE]

export interface Snapshot {
  head: string | null
  /** путь → sha blob-а (только файлы данных и lock.json) */
  shas: Record<string, string>
  data: DataSet | null
  lock: Lock | null
}

export interface Draft {
  holder: string
  device: string
  /** sha файлов данных, от которых начат черновик */
  baseShas: Record<string, string>
  base: DataSet
  data: DataSet
  /** пометка для сообщения коммита, например «импорт из Excel (файл.xlsx)» */
  note: string | null
  savedAt: string
}

export interface CacheFile {
  snapshot: Snapshot
  lastSync: string | null
}

/** Локальное хранилище: кэш последнего pull и черновик (переживает падение). */
export interface Persistence {
  loadCache(): Promise<CacheFile | null>
  saveCache(c: CacheFile): Promise<void>
  loadDraft(): Promise<Draft | null>
  saveDraft(d: Draft): Promise<void>
  clearDraft(): Promise<void>
}

export class MemoryPersistence implements Persistence {
  cache: CacheFile | null = null
  draft: Draft | null = null
  async loadCache() {
    return clone(this.cache)
  }
  async saveCache(c: CacheFile) {
    this.cache = clone(c)
  }
  async loadDraft() {
    return clone(this.draft)
  }
  async saveDraft(d: Draft) {
    this.draft = clone(d)
  }
  async clearDraft() {
    this.draft = null
  }
}

export type SyncErrorCode =
  | 'offline'
  | 'busy'
  | 'expired'
  | 'lock-lost'
  | 'remote-changed'
  | 'ref-moved'
  | 'invalid'
  | 'not-active'
  | 'empty-repo'

export class SyncError extends Error {
  constructor(
    public code: SyncErrorCode,
    message: string,
    public info: { holder?: string | null; since?: string | null; expiresAt?: string | null } = {}
  ) {
    super(message)
    this.name = 'SyncError'
  }
}

export interface EngineState {
  identity: Identity
  mode: 'inactive' | 'active'
  remote: DataSet | null
  draft: DataSet | null
  lock: Lock | null
  lockLost: boolean
  lastSync: string | null
  online: boolean
  busy: boolean
  needsInit: boolean
  changes: ChangeSummary | null
  changesText: string
  dirty: boolean
  /** найден черновик с прошлого запуска */
  recovery: { summary: string; savedAt: string } | null
  error: string | null
}

export interface EngineOptions {
  now?: () => number
  /** запускать таймеры опроса и heartbeat (в тестах — false, вызываем вручную) */
  timers?: boolean
}

function clone<T>(v: T): T {
  return v == null ? v : JSON.parse(JSON.stringify(v))
}

export function serializeJson(v: unknown): string {
  return JSON.stringify(v, null, 2) + '\n'
}

function pickTracked(tree: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of TRACKED) if (tree[p]) out[p] = tree[p]
  return out
}

function hhmm(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${fmtDate(iso)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Синхронизация «как git»: pull, вход в активный режим через замок, push одним коммитом.
 * Все обращения к удалённому хранилищу идут последовательно (мьютекс), чтобы
 * heartbeat не мог сдвинуть ветку посреди push.
 */
export class SyncEngine {
  private snapshot: Snapshot = { head: null, shas: {}, data: null, lock: null }
  private draft: Draft | null = null
  private mode: 'inactive' | 'active' = 'inactive'
  private lockLost = false
  private lastSync: string | null = null
  private online = false
  private busyCount = 0
  private needsInit = false
  private recoveryPending = false
  private error: string | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private listeners = new Set<(s: EngineState) => void>()
  private hbTimer: ReturnType<typeof setInterval> | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private now: () => number
  private timers: boolean

  constructor(
    private store: RemoteStore,
    private local: Persistence,
    private me: Identity,
    opts: EngineOptions = {}
  ) {
    this.now = opts.now ?? Date.now
    this.timers = opts.timers ?? true
  }

  // ───────────────────────── состояние ─────────────────────────

  onChange(fn: (s: EngineState) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getState(): EngineState {
    const changes = this.draft ? diffData(this.draft.base, this.draft.data) : null
    return {
      identity: this.me,
      mode: this.mode,
      remote: this.snapshot.data,
      draft: this.draft?.data ?? null,
      lock: this.snapshot.lock,
      lockLost: this.lockLost,
      lastSync: this.lastSync,
      online: this.online,
      busy: this.busyCount > 0,
      needsInit: this.needsInit,
      changes,
      changesText: changes ? describeChanges(changes) : '',
      dirty: changes ? hasChanges(changes) : false,
      recovery:
        this.recoveryPending && this.draft
          ? { summary: describeChanges(diffData(this.draft.base, this.draft.data)), savedAt: this.draft.savedAt }
          : null,
      error: this.error
    }
  }

  private emit() {
    const s = this.getState()
    for (const fn of this.listeners) fn(s)
  }

  /** Последовательное выполнение удалённых операций. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(async () => {
      this.busyCount++
      this.emit()
      try {
        return await fn()
      } catch (e) {
        if (e instanceof OfflineError) this.online = false
        this.error = e instanceof Error ? e.message : String(e)
        throw e
      } finally {
        this.busyCount--
        this.emit()
      }
    })
    this.queue = p.catch(() => undefined)
    return p
  }

  private iso(): string {
    return new Date(this.now()).toISOString()
  }

  // ───────────────────────── запуск ─────────────────────────

  async init(): Promise<void> {
    const cache = await this.local.loadCache()
    if (cache) {
      this.snapshot = cache.snapshot
      this.lastSync = cache.lastSync
    }
    this.draft = await this.local.loadDraft()
    this.recoveryPending = !!this.draft
    this.emit()
    try {
      await this.pull()
      // упали в активном режиме, а замок всё ещё наш — продолжаем работу с черновиком
      if (this.draft && lockState(this.snapshot.lock, this.me, this.now()) === 'mine') {
        this.mode = 'active'
        this.lockLost = false
        this.startHeartbeat()
      }
    } catch {
      /* офлайн — показываем кэш */
    }
    if (this.timers) this.pollTimer = setInterval(() => this.pull().catch(() => undefined), POLL_MS)
    this.emit()
  }

  dispose() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.stopHeartbeat()
    this.listeners.clear()
  }

  // ───────────────────────── pull ─────────────────────────

  pull(): Promise<void> {
    return this.run(() => this.doPull())
  }

  private async doPull(): Promise<void> {
    const head = await this.store.getHead()
    this.online = true
    if (!head) {
      this.needsInit = true
      this.snapshot = { head: null, shas: {}, data: null, lock: null }
    } else if (head !== this.snapshot.head) {
      const tree = await this.store.getTree(head)
      this.needsInit = KEYS.some((k) => !tree[DATA_FILES[k]])
      const next: Record<string, unknown> = { ...(this.snapshot.data ?? {}) }
      if (!this.needsInit) {
        for (const k of KEYS) {
          const path = DATA_FILES[k]
          if (tree[path] !== this.snapshot.shas[path] || !(k in next))
            next[k] = JSON.parse(await this.store.readBlob(tree[path]))
        }
      }
      let lock = this.snapshot.lock
      if (!tree[LOCK_FILE]) lock = FREE_LOCK
      else if (tree[LOCK_FILE] !== this.snapshot.shas[LOCK_FILE] || !lock)
        lock = LockSchema.parse(JSON.parse(await this.store.readBlob(tree[LOCK_FILE])))
      const parsed = this.needsInit ? null : DataSetSchema.safeParse(next)
      if (parsed && !parsed.success)
        throw new SyncError('invalid', 'Данные в репозитории повреждены: ' + parsed.error.issues[0]?.message)
      this.snapshot = { head, shas: pickTracked(tree), data: parsed?.data ?? null, lock }
    }
    this.lastSync = this.iso()
    this.error = null
    if (this.mode === 'active' && lockState(this.snapshot.lock, this.me, this.now()) !== 'mine') {
      this.lockLost = true
      this.stopHeartbeat()
    }
    await this.local.saveCache({ snapshot: this.snapshot, lastSync: this.lastSync })
  }

  /** Пустой репозиторий: создать lock.json и файлы данных (засеять начальными данными). */
  initRepo(seed: DataSet): Promise<void> {
    return this.run(async () => {
      let head = await this.store.getHead()
      if (!head) {
        await this.store.putFile(LOCK_FILE, serializeLock(FREE_LOCK), null, `${LOCK_COMMIT_PREFIX}создан замок`, this.me.holder)
        head = (await this.store.getHead())!
      }
      const tree = await this.store.getTree(head)
      const files: Record<string, string> = {}
      for (const k of KEYS) if (!tree[DATA_FILES[k]]) files[DATA_FILES[k]] = serializeJson(seed[k])
      if (!tree[LOCK_FILE]) files[LOCK_FILE] = serializeLock(FREE_LOCK)
      if (Object.keys(files).length)
        await this.store.commitFiles(head, files, `${this.me.holder}: создана структура данных`, this.me.holder)
      await this.doPull()
    })
  }

  // ───────────────────────── замок ─────────────────────────

  /** «Начать работу». force — забрать просроченный чужой замок (после предупреждения). */
  startWork(opts: { force?: boolean } = {}): Promise<void> {
    return this.run(async () => {
      if (this.mode === 'active' && !this.lockLost) return
      await this.doPull()
      if (this.needsInit) throw new SyncError('empty-repo', 'Репозиторий данных пуст — пройдите настройку')

      if (this.draft) {
        const moved = KEYS.some((k) => this.snapshot.shas[DATA_FILES[k]] !== this.draft!.baseShas[DATA_FILES[k]])
        if (moved)
          throw new SyncError(
            'remote-changed',
            'После вашего черновика данные на сервере изменил другой пользователь. Черновик сохранить нельзя — удалите его.'
          )
      }

      const lock = this.snapshot.lock
      const st = lockState(lock, this.me, this.now())
      const info = { holder: lock?.holder, since: lock?.since, expiresAt: lock?.expiresAt }
      if (st === 'busy')
        throw new SyncError('busy', `Сейчас работает ${lock!.holder} с ${hhmm(lock!.since)}`, info)
      if (st === 'expired' && !opts.force)
        throw new SyncError(
          'expired',
          `Замок ${lock!.holder} просрочен (до ${hhmm(lock!.expiresAt)}). Возможно, у него не сохранены изменения. Забрать замок?`,
          info
        )

      const newLock = makeLock(this.me, this.now(), st === 'mine' ? lock!.since : null)
      let sha: string
      try {
        sha = await this.store.putFile(
          LOCK_FILE,
          serializeLock(newLock),
          this.snapshot.shas[LOCK_FILE] ?? null,
          `${LOCK_COMMIT_PREFIX}${this.me.holder} начал работу`,
          this.me.holder
        )
      } catch (e) {
        if (!(e instanceof ConflictError)) throw e
        // замок перехватили между чтением и записью
        await this.doPull()
        const cur = this.snapshot.lock
        throw new SyncError('busy', `Сейчас работает ${cur?.holder ?? 'другой пользователь'} с ${hhmm(cur?.since)}`, {
          holder: cur?.holder,
          since: cur?.since
        })
      }
      this.snapshot.lock = newLock
      this.snapshot.shas[LOCK_FILE] = sha
      this.mode = 'active'
      this.lockLost = false
      if (!this.draft) {
        this.draft = this.newDraft()
        await this.local.saveDraft(this.draft)
      }
      this.startHeartbeat()
    })
  }

  private newDraft(): Draft {
    const baseShas: Record<string, string> = {}
    for (const k of KEYS) baseShas[DATA_FILES[k]] = this.snapshot.shas[DATA_FILES[k]]
    return {
      holder: this.me.holder,
      device: this.me.device,
      baseShas,
      base: clone(this.snapshot.data!),
      data: clone(this.snapshot.data!),
      note: null,
      savedAt: this.iso()
    }
  }

  /** Продление замка (раз в 2 мин). */
  heartbeat(): Promise<void> {
    return this.run(async () => {
      if (this.mode !== 'active' || this.lockLost) return
      const head = (await this.store.getHead())!
      this.online = true
      const tree = await this.store.getTree(head)
      const lock = tree[LOCK_FILE] ? LockSchema.parse(JSON.parse(await this.store.readBlob(tree[LOCK_FILE]))) : FREE_LOCK
      if (lockState(lock, this.me, this.now()) !== 'mine') return this.loseLock(lock)
      const renewed = makeLock(this.me, this.now(), lock.since)
      try {
        const sha = await this.store.putFile(
          LOCK_FILE,
          serializeLock(renewed),
          tree[LOCK_FILE],
          `${LOCK_COMMIT_PREFIX}${this.me.holder} продлил замок`,
          this.me.holder
        )
        this.snapshot.lock = renewed
        this.snapshot.shas[LOCK_FILE] = sha
      } catch (e) {
        if (e instanceof ConflictError) return this.loseLock(null)
        throw e
      }
    })
  }

  private loseLock(lock: Lock | null) {
    this.lockLost = true
    if (lock) this.snapshot.lock = lock
    this.stopHeartbeat()
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    if (this.timers) this.hbTimer = setInterval(() => this.heartbeat().catch(() => undefined), HEARTBEAT_MS)
  }

  private stopHeartbeat() {
    if (this.hbTimer) clearInterval(this.hbTimer)
    this.hbTimer = null
  }

  // ───────────────────────── черновик ─────────────────────────

  async updateDraft(data: DataSet, note?: string): Promise<void> {
    if (this.mode !== 'active' || !this.draft)
      throw new SyncError('not-active', 'Редактирование доступно только в активном режиме')
    if (this.lockLost) throw new SyncError('lock-lost', 'Замок потерян — редактирование недоступно')
    this.draft.data = clone(data)
    if (note) this.draft.note = this.draft.note ? `${this.draft.note}; ${note}` : note
    this.draft.savedAt = this.iso()
    await this.local.saveDraft(this.draft)
    this.emit()
  }

  /** Отменить несохранённые изменения, остаться в активном режиме. */
  async revertDraft(): Promise<void> {
    if (!this.draft) return
    this.draft.data = clone(this.draft.base)
    this.draft.note = null
    await this.local.saveDraft(this.draft)
    this.emit()
  }

  /** Удалить черновик, найденный при запуске (в неактивном режиме). */
  async discardRecovery(): Promise<void> {
    if (this.mode === 'active') return this.cancelWork()
    this.draft = null
    this.recoveryPending = false
    await this.local.clearDraft()
    this.emit()
  }

  // ───────────────────────── push ─────────────────────────

  /**
   * «Сохранить (push)» / «Сохранить и выйти» (release=true — замок освобождается в том же коммите).
   * Возвращает сообщение коммита или null, если сохранять нечего.
   */
  push(opts: { release?: boolean } = {}): Promise<string | null> {
    return this.run(async () => {
      const release = !!opts.release
      if (this.mode !== 'active' || !this.draft)
        throw new SyncError('not-active', 'Сохранять можно только в активном режиме')
      const draft = this.draft
      const valid = DataSetSchema.safeParse(draft.data)
      if (!valid.success)
        throw new SyncError('invalid', 'Ошибка в данных: ' + valid.error.issues[0]?.message)

      const head = await this.store.getHead()
      if (!head) throw new SyncError('empty-repo', 'Репозиторий данных пуст')
      this.online = true
      const tree = await this.store.getTree(head)
      const lock = tree[LOCK_FILE] ? LockSchema.parse(JSON.parse(await this.store.readBlob(tree[LOCK_FILE]))) : FREE_LOCK
      if (lockState(lock, this.me, this.now()) !== 'mine') {
        this.loseLock(lock)
        throw new SyncError(
          'lock-lost',
          `Замок перехвачен${lock.holder ? ` (${lock.holder})` : ''}. Сохранение отменено, на сервере ничего не изменено.`,
          { holder: lock.holder, since: lock.since }
        )
      }
      for (const k of KEYS)
        if (tree[DATA_FILES[k]] !== draft.baseShas[DATA_FILES[k]])
          throw new SyncError('remote-changed', 'Данные на сервере изменились. Сохранение отменено, ничего не перезаписано.')

      const summary = diffData(draft.base, draft.data)
      const dirty = hasChanges(summary)
      if (!dirty && !release) return null

      const files: Record<string, string> = {}
      for (const k of KEYS)
        if (JSON.stringify(draft.base[k]) !== JSON.stringify(draft.data[k]))
          files[DATA_FILES[k]] = serializeJson(draft.data[k])
      const nextLock = release ? FREE_LOCK : makeLock(this.me, this.now(), lock.since)
      files[LOCK_FILE] = serializeLock(nextLock)
      const message = dirty
        ? commitMessage(this.me.holder, summary, draft.note) + (release ? ' · завершил работу' : '')
        : `${LOCK_COMMIT_PREFIX}${this.me.holder} завершил работу`

      let result: { commit: string; shas: Record<string, string> }
      try {
        result = await this.store.commitFiles(head, files, message, this.me.holder)
      } catch (e) {
        if (e instanceof RefMovedError)
          throw new SyncError('ref-moved', 'Пока шло сохранение, ветка на сервере изменилась. Ничего не перезаписано — попробуйте ещё раз.')
        throw e
      }

      this.snapshot = {
        head: result.commit,
        shas: { ...pickTracked(tree), ...result.shas },
        data: clone(draft.data),
        lock: nextLock
      }
      this.lastSync = this.iso()
      this.recoveryPending = false
      this.error = null
      await this.local.saveCache({ snapshot: this.snapshot, lastSync: this.lastSync })

      if (release) {
        this.draft = null
        this.mode = 'inactive'
        this.stopHeartbeat()
        await this.local.clearDraft()
      } else {
        this.draft = this.newDraft()
        await this.local.saveDraft(this.draft)
      }
      return message
    })
  }

  /** Выйти без сохранения: отпустить замок и выбросить черновик. */
  cancelWork(): Promise<void> {
    return this.run(async () => {
      try {
        const head = await this.store.getHead()
        if (head) {
          const tree = await this.store.getTree(head)
          const lock = tree[LOCK_FILE]
            ? LockSchema.parse(JSON.parse(await this.store.readBlob(tree[LOCK_FILE])))
            : FREE_LOCK
          if (lockState(lock, this.me, this.now()) === 'mine')
            await this.store
              .putFile(LOCK_FILE, serializeLock(FREE_LOCK), tree[LOCK_FILE], `${LOCK_COMMIT_PREFIX}${this.me.holder} вышел без сохранения`, this.me.holder)
              .catch((e) => {
                if (!(e instanceof ConflictError)) throw e
              })
        }
      } catch (e) {
        // без сети замок просто истечёт сам
        if (!(e instanceof OfflineError)) throw e
      }
      this.draft = null
      this.recoveryPending = false
      this.mode = 'inactive'
      this.lockLost = false
      this.stopHeartbeat()
      await this.local.clearDraft()
      await this.doPull().catch(() => undefined)
    })
  }

  history(limit = 100): Promise<CommitInfo[]> {
    return this.store.listCommits(limit)
  }
}
