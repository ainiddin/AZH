import {
  ConflictError,
  OfflineError,
  RefMovedError,
  type CommitInfo,
  type RemoteStore
} from './RemoteStore'

interface MemCommit {
  sha: string
  parent: string | null
  files: Record<string, string> // путь → sha blob-а
  message: string
  author: string
  date: string
}

/** Детерминированный «sha» содержимого (FNV-1a, 2×32 бита) — как blob sha в git. */
function hash(s: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

/**
 * Репозиторий в памяти с той же семантикой, что GitHub:
 * CAS по sha файла для putFile и fast-forward-only для commitFiles.
 * Каждая операция атомарна, но между await-ами клиенты чередуются — как в сети.
 */
export class MemoryStore implements RemoteStore {
  private blobs = new Map<string, string>()
  private commits = new Map<string, MemCommit>()
  private head: string | null = null
  private seq = 0
  offline = false
  /** Хук для тестов: вызывается перед перемещением ветки в commitFiles */
  beforeUpdateRef: (() => Promise<void> | void) | null = null

  private async tick(): Promise<void> {
    if (this.offline) throw new OfflineError()
    await Promise.resolve()
  }

  private addBlob(content: string): string {
    const sha = hash(content)
    this.blobs.set(sha, content)
    return sha
  }

  private addCommit(parent: string | null, files: Record<string, string>, message: string, author: string) {
    const sha = `c${++this.seq}-${hash(message + this.seq)}`
    this.commits.set(sha, { sha, parent, files, message, author, date: new Date().toISOString() })
    this.head = sha
    return sha
  }

  async getHead() {
    await this.tick()
    return this.head
  }

  async getTree(commitSha: string) {
    await this.tick()
    const c = this.commits.get(commitSha)
    if (!c) throw new Error(`Нет коммита ${commitSha}`)
    return { ...c.files }
  }

  async readBlob(sha: string) {
    await this.tick()
    const b = this.blobs.get(sha)
    if (b === undefined) throw new Error(`Нет blob ${sha}`)
    return b
  }

  async putFile(path: string, content: string, prevSha: string | null, message: string, author: string) {
    await this.tick()
    const files = this.head ? { ...this.commits.get(this.head)!.files } : {}
    if ((files[path] ?? null) !== prevSha) throw new ConflictError()
    files[path] = this.addBlob(content)
    this.addCommit(this.head, files, message, author)
    return files[path]
  }

  async commitFiles(baseCommit: string, files: Record<string, string>, message: string, author: string) {
    await this.tick()
    const base = this.commits.get(baseCommit)
    if (!base) throw new Error(`Нет коммита ${baseCommit}`)
    const shas: Record<string, string> = {}
    for (const [p, content] of Object.entries(files)) shas[p] = this.addBlob(content)
    await this.beforeUpdateRef?.()
    await this.tick()
    if (this.head !== baseCommit) throw new RefMovedError()
    const commit = this.addCommit(baseCommit, { ...base.files, ...shas }, message, author)
    return { commit, shas }
  }

  async listCommits(limit: number): Promise<CommitInfo[]> {
    await this.tick()
    const out: CommitInfo[] = []
    let cur = this.head
    while (cur && out.length < limit) {
      const c = this.commits.get(cur)!
      out.push({ sha: c.sha, message: c.message, author: c.author, date: c.date })
      cur = c.parent
    }
    return out
  }

  /** Для тестов: прочитать файл в HEAD */
  peek(path: string): string | undefined {
    if (!this.head) return undefined
    const sha = this.commits.get(this.head)!.files[path]
    return sha ? this.blobs.get(sha) : undefined
  }
}
