import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryStore } from '@shared/sync/MemoryStore'
import { MemoryPersistence, SyncEngine, SyncError } from '@shared/sync/SyncEngine'
import { commitMessage, diffData } from '@shared/sync/commitMessage'
import { seedData } from '@shared/seed'
import { DATA_FILES, LOCK_FILE, LOCK_TTL_MS } from '@shared/constants'
import type { DataSet, Expense, Sale } from '@shared/types'

let clock = Date.parse('2026-11-24T10:00:00Z')
const now = () => clock

function sale(id: string, p: Partial<Sale> = {}): Sale {
  return {
    id,
    date: '2026-11-24',
    color: 'Чёрный',
    qty: 1,
    price: 20000,
    channel: 'Instagram',
    status: 'paid',
    buyer: '',
    delivery: 'buyer',
    deliveryCost: 0,
    note: '',
    by: 'A',
    createdAt: '2026-11-24T10:00:00Z',
    ...p
  }
}
const expense = (id: string): Expense => ({ id, date: '2026-11-24', category: 'Реклама', amount: 1000, note: '', by: 'A' })

function client(store: MemoryStore, holder: string, device = holder + '-pc', local = new MemoryPersistence()) {
  return { engine: new SyncEngine(store, local, { holder, device }, { now, timers: false }), local }
}

async function expectSyncError(p: Promise<unknown>, code: string): Promise<SyncError> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(SyncError)
    expect((e as SyncError).code).toBe(code)
    return e as SyncError
  }
  throw new Error(`ожидалась ошибка ${code}`)
}

const edit = (data: DataSet, f: (d: DataSet) => void): DataSet => {
  const d = JSON.parse(JSON.stringify(data)) as DataSet
  f(d)
  return d
}

let store: MemoryStore

beforeEach(async () => {
  clock = Date.parse('2026-11-24T10:00:00Z')
  store = new MemoryStore()
  const { engine } = client(store, 'Админ')
  await engine.init()
  expect(engine.getState().needsInit).toBe(true)
  await engine.initRepo(seedData())
})

describe('инициализация и pull', () => {
  it('пустой репо засевается начальными данными', async () => {
    const { engine } = client(store, 'A')
    await engine.init()
    const s = engine.getState()
    expect(s.needsInit).toBe(false)
    expect(s.mode).toBe('inactive')
    expect(s.remote!.purchases[0].title).toBe('Партия №1')
    expect(s.lock!.holder).toBeNull()
    expect(JSON.parse(store.peek(DATA_FILES.config)!)).toEqual({ targetPrice: 20000, minPrice: 17000 })
  })

  it('без интернета в активный режим не входим', async () => {
    const { engine } = client(store, 'A')
    await engine.init()
    store.offline = true
    await expect(engine.startWork()).rejects.toThrow('Нет связи')
    expect(engine.getState().mode).toBe('inactive')
    expect(engine.getState().online).toBe(false)
  })

  it('в неактивном режиме редактировать нельзя', async () => {
    const { engine } = client(store, 'A')
    await engine.init()
    await expectSyncError(engine.updateDraft(seedData()), 'not-active')
  })
})

describe('замок: два клиента', () => {
  it('одновременный вход — замок получает ровно один', async () => {
    const a = client(store, 'A').engine
    const b = client(store, 'B').engine
    await Promise.all([a.init(), b.init()])
    const results = await Promise.allSettled([a.startWork(), b.startWork()])
    const ok = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    expect(ok).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect((failed[0].reason as SyncError).code).toBe('busy')
    expect((failed[0].reason as SyncError).message).toMatch(/Сейчас работает (A|B) с/)
    const modes = [a.getState().mode, b.getState().mode].sort()
    expect(modes).toEqual(['active', 'inactive'])
  })

  it('занятый замок: второй видит, кто работает, и остаётся в просмотре', async () => {
    const a = client(store, 'A').engine
    const b = client(store, 'B').engine
    await a.init()
    await b.init()
    await a.startWork()
    const err = await expectSyncError(b.startWork(), 'busy')
    expect(err.info.holder).toBe('A')
    expect(err.message).toContain('Сейчас работает A')
    expect(b.getState().mode).toBe('inactive')
    await b.pull()
    expect(b.getState().lock!.holder).toBe('A')
  })

  it('push и «сохранить и выйти»: второй видит данные и может войти', async () => {
    const a = client(store, 'A').engine
    const b = client(store, 'B').engine
    await a.init()
    await b.init()
    await a.startWork()
    const d = a.getState().draft!
    await a.updateDraft(edit(d, (x) => x.sales.push(sale('s1'), sale('s2'))))
    expect(a.getState().changesText).toBe('+2 продажи')

    const msg = await a.push()
    expect(msg).toBe('A: +2 продажи')
    expect(a.getState().mode).toBe('active')
    expect(a.getState().dirty).toBe(false)

    await a.updateDraft(edit(a.getState().draft!, (x) => x.expenses.push(expense('e1'))))
    const msg2 = await a.push({ release: true })
    expect(msg2).toBe('A: +1 расход · завершил работу')
    expect(a.getState().mode).toBe('inactive')
    expect(JSON.parse(store.peek(LOCK_FILE)!).holder).toBeNull()

    await b.pull()
    expect(b.getState().remote!.sales.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(b.getState().remote!.expenses).toHaveLength(1)
    await b.startWork()
    expect(b.getState().mode).toBe('active')
  })

  it('push — один атомарный коммит с данными и замком', async () => {
    const a = client(store, 'A').engine
    await a.init()
    await a.startWork()
    const before = (await store.listCommits(100)).length
    await a.updateDraft(edit(a.getState().draft!, (x) => {
      x.sales.push(sale('s1'))
      x.expenses.push(expense('e1'))
    }))
    await a.push({ release: true })
    const commits = await store.listCommits(100)
    expect(commits.length).toBe(before + 1)
    expect(commits[0].message).toBe('A: +1 продажа, +1 расход · завершил работу')
    expect(commits[0].author).toBe('A')
  })

  it('heartbeat продлевает замок, просроченный замок забирают только с подтверждением', async () => {
    const a = client(store, 'A').engine
    const b = client(store, 'B').engine
    await a.init()
    await b.init()
    await a.startWork()

    clock += 8 * 60 * 1000
    await a.heartbeat()
    clock += 8 * 60 * 1000 // 16 мин от входа, но 8 мин от продления
    await expectSyncError(b.startWork(), 'busy')

    clock += LOCK_TTL_MS // A «упал», замок истёк
    const err = await expectSyncError(b.startWork(), 'expired')
    expect(err.message).toContain('просрочен')
    expect(b.getState().mode).toBe('inactive')

    await b.startWork({ force: true })
    expect(b.getState().mode).toBe('active')

    // A пытается сохранить — замок потерян, сервер не тронут
    await a.updateDraft(edit(a.getState().draft!, (x) => x.sales.push(sale('lost'))))
    const head = await store.getHead()
    await expectSyncError(a.push(), 'lock-lost')
    expect(await store.getHead()).toBe(head)
    expect(a.getState().lockLost).toBe(true)
    await expectSyncError(a.updateDraft(seedData()), 'lock-lost')
  })

  it('heartbeat замечает, что замок перехвачен', async () => {
    const a = client(store, 'A').engine
    const b = client(store, 'B').engine
    await a.init()
    await b.init()
    await a.startWork()
    clock += LOCK_TTL_MS + 1
    await b.startWork({ force: true })
    await a.heartbeat()
    expect(a.getState().lockLost).toBe(true)
    expect(a.getState().lock!.holder).toBe('B')
  })

  it('гонка: замок перехватили прямо перед записью — 409, остаёмся в просмотре', async () => {
    const a = client(store, 'A').engine
    const b = client(store, 'B').engine
    await a.init()
    await b.init()
    // b прочитал свободный замок; a успевает занять его раньше, чем b пишет
    await b.pull()
    const origPut = store.putFile.bind(store)
    let injected = false
    store.putFile = async (...args) => {
      if (!injected && args[4] === 'B') {
        injected = true
        store.putFile = origPut
        await a.startWork()
      }
      return origPut(...args)
    }
    const err = await expectSyncError(b.startWork(), 'busy')
    expect(err.info.holder).toBe('A')
    expect(b.getState().mode).toBe('inactive')
    expect(a.getState().mode).toBe('active')
  })

  it('если ветка сдвинулась во время push — ошибка и ничего не перезаписано', async () => {
    const a = client(store, 'A').engine
    await a.init()
    await a.startWork()
    await a.updateDraft(edit(a.getState().draft!, (x) => x.sales.push(sale('s1'))))
    store.beforeUpdateRef = async () => {
      store.beforeUpdateRef = null
      const head = (await store.getHead())!
      await store.commitFiles(head, { 'other.txt': 'x' }, 'чужой коммит', 'X')
    }
    await expectSyncError(a.push(), 'ref-moved')
    expect(JSON.parse(store.peek(DATA_FILES.sales)!)).toEqual([])
    expect(a.getState().dirty).toBe(true) // черновик цел
    // повторная попытка проходит
    expect(await a.push()).toBe('A: +1 продажа')
  })

  it('данные на сервере изменились мимо замка — push отклонён', async () => {
    const a = client(store, 'A').engine
    await a.init()
    await a.startWork()
    await a.updateDraft(edit(a.getState().draft!, (x) => x.sales.push(sale('s1'))))
    const head = (await store.getHead())!
    await store.commitFiles(head, { [DATA_FILES.expenses]: JSON.stringify([expense('x')]) }, 'вручную', 'X')
    await expectSyncError(a.push(), 'remote-changed')
    expect(JSON.parse(store.peek(DATA_FILES.sales)!)).toEqual([])
  })
})

describe('восстановление после падения', () => {
  it('замок ещё наш — черновик восстанавливается, активный режим, можно push', async () => {
    const local = new MemoryPersistence()
    const a1 = client(store, 'A', 'pc1', local).engine
    await a1.init()
    await a1.startWork()
    await a1.updateDraft(edit(a1.getState().draft!, (x) => x.sales.push(sale('s1'))))
    a1.dispose() // «упало»

    clock += 60 * 1000
    const a2 = client(store, 'A', 'pc1', local).engine
    await a2.init()
    const s = a2.getState()
    expect(s.mode).toBe('active')
    expect(s.recovery).toEqual({ summary: '+1 продажа', savedAt: expect.any(String) })
    expect(await a2.push({ release: true })).toBe('A: +1 продажа · завершил работу')
    expect(a2.getState().recovery).toBeNull()
  })

  it('замок истёк, но свободен — можно продолжить черновик', async () => {
    const local = new MemoryPersistence()
    const a1 = client(store, 'A', 'pc1', local).engine
    await a1.init()
    await a1.startWork()
    await a1.updateDraft(edit(a1.getState().draft!, (x) => x.expenses.push(expense('e1'))))
    a1.dispose()

    clock += LOCK_TTL_MS * 3
    const a2 = client(store, 'A', 'pc1', local).engine
    await a2.init()
    expect(a2.getState().mode).toBe('active') // замок формально наш (имя + устройство)
    expect(await a2.push()).toBe('A: +1 расход')
  })

  it('замок забрал другой и сохранил данные — черновик сохранить нельзя', async () => {
    const local = new MemoryPersistence()
    const a1 = client(store, 'A', 'pc1', local).engine
    await a1.init()
    await a1.startWork()
    await a1.updateDraft(edit(a1.getState().draft!, (x) => x.sales.push(sale('a'))))
    a1.dispose()

    clock += LOCK_TTL_MS + 1
    const b = client(store, 'B').engine
    await b.init()
    await b.startWork({ force: true })
    await b.updateDraft(edit(b.getState().draft!, (x) => x.sales.push(sale('b'))))
    await b.push({ release: true })

    const a2 = client(store, 'A', 'pc1', local).engine
    await a2.init()
    expect(a2.getState().mode).toBe('inactive')
    expect(a2.getState().recovery?.summary).toBe('+1 продажа')
    await expectSyncError(a2.startWork(), 'remote-changed')
    await a2.discardRecovery()
    expect(a2.getState().recovery).toBeNull()
    await a2.startWork()
    expect(a2.getState().draft!.sales.map((s) => s.id)).toEqual(['b'])
  })

  it('«выйти без сохранения» освобождает замок', async () => {
    const a = client(store, 'A').engine
    await a.init()
    await a.startWork()
    await a.updateDraft(edit(a.getState().draft!, (x) => x.sales.push(sale('s1'))))
    await a.cancelWork()
    expect(a.getState().mode).toBe('inactive')
    expect(a.getState().draft).toBeNull()
    expect(JSON.parse(store.peek(LOCK_FILE)!).holder).toBeNull()
    expect(JSON.parse(store.peek(DATA_FILES.sales)!)).toEqual([])
  })
})

describe('сообщение коммита', () => {
  it('склонения и изменения', () => {
    const base = seedData()
    base.sales = [sale('x'), sale('y')]
    const next = edit(base, (d) => {
      d.sales = d.sales.filter((s) => s.id !== 'y')
      d.sales[0].price = 21000
      d.sales.push(sale('a'), sale('b'), sale('c'), sale('d'), sale('e'))
      d.purchases.push({ ...d.purchases[0], id: 'p2' })
      d.config.minPrice = 16000
    })
    expect(commitMessage('Айниддин', diffData(base, next))).toBe(
      'Айниддин: +5 продаж, изм. 1 продажа, −1 продажа, +1 партия, настройки'
    )
    expect(commitMessage('A', diffData(base, next), 'импорт из Excel (f.xlsx)')).toMatch(
      /^A: импорт из Excel \(f\.xlsx\): \+5 продаж/
    )
  })
})
