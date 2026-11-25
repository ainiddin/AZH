import { FileDown, FileUp, LogOut, RefreshCw, Save, Undo2, WifiOff } from 'lucide-react'
import { run, startWork, useApp, useData, type Page } from '@/store/app'
import { cn, timeHHMM } from '@/lib/utils'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'

const TABS: [Page, string][] = [
  ['overview', 'Обзор'],
  ['sales', 'Продажи'],
  ['stock', 'Склад'],
  ['purchases', 'Закупки'],
  ['expenses', 'Расходы'],
  ['history', 'История'],
  ['settings', 'Настройки']
]

export function Header() {
  const sync = useApp((s) => s.sync)
  const page = useApp((s) => s.page)
  const setPage = useApp((s) => s.setPage)
  const setImportOpen = useApp((s) => s.setImportOpen)
  const ask = useApp((s) => s.ask)
  const data = useData()
  if (!sync) return null

  const active = sync.mode === 'active'
  const editable = active && !sync.lockLost
  const me = sync.identity.holder
  const lock = sync.lock
  const lockText = !lock?.holder
    ? 'Замок свободен'
    : lock.holder === me && lock.device === sync.identity.device
      ? `Замок у вас с ${timeHHMM(lock.since)}`
      : new Date(lock.expiresAt ?? 0).getTime() < Date.now()
        ? `Замок ${lock.holder} просрочен`
        : `Работает ${lock.holder} с ${timeHHMM(lock.since)}`

  const push = (release: boolean) =>
    run(window.api.sync.push(release)).then((msg) => {
      if (msg === undefined) return
      useApp.getState().toast('ok', msg ? `Сохранено: ${msg}` : release ? 'Вы вышли из активного режима' : 'Нечего сохранять')
    })

  const cancel = async () => {
    const ok = await ask({
      title: 'Выйти без сохранения?',
      message: sync.dirty
        ? `Несохранённые изменения (${sync.changesText}) будут удалены, замок освободится.`
        : 'Замок освободится, другие смогут работать.',
      confirmLabel: 'Выйти без сохранения',
      danger: sync.dirty
    })
    if (ok) await run(window.api.sync.cancel(), 'Вы вышли из активного режима')
  }

  const revert = async () => {
    const ok = await ask({
      title: 'Отменить изменения?',
      message: `Будут отменены: ${sync.changesText}. Замок останется у вас.`,
      confirmLabel: 'Отменить изменения',
      danger: true
    })
    if (ok) await run(window.api.sync.revert(), 'Изменения отменены')
  }

  return (
    <header className="bg-[#111] text-white">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-6 pb-3 pt-4">
        <div>
          <div className="font-serif text-[28px] font-semibold leading-none tracking-[0.28em]">AZH</div>
          <div className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#bdb5a6]">Jacquemus · учёт шарфов</div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <span className={cn('size-2.5 rounded-full', editable ? 'bg-[#3fbf72] shadow-[0_0_0_3px_rgba(63,191,114,.2)]' : 'bg-[#8a857b]')} />
          <div className="leading-tight">
            <div className="text-[13px] font-medium">{editable ? 'Активный режим' : sync.lockLost ? 'Замок потерян' : 'Просмотр'}</div>
            <div className="text-[11px] text-[#bdb5a6]">{lockText}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[12px] text-[#bdb5a6]">
          {!sync.online && (
            <span className="inline-flex items-center gap-1 text-[#e8b4a8]">
              <WifiOff className="size-3.5" /> Нет связи
            </span>
          )}
          <span>Последняя синхронизация {timeHHMM(sync.lastSync)}</span>
          <Tooltip content="Обновить данные с сервера (pull)">
            <button
              className="rounded p-1 text-[#bdb5a6] hover:text-white disabled:opacity-40"
              onClick={() => run(window.api.sync.pull())}
              disabled={sync.busy}
              aria-label="Обновить"
            >
              <RefreshCw className={cn('size-3.5', sync.busy && 'animate-spin')} />
            </button>
          </Tooltip>
        </div>

        <div className="flex-1" />

        {active ? (
          <div className="flex flex-wrap items-center gap-2">
            {sync.dirty && (
              <span className="mr-1 max-w-[260px] truncate text-[12px] text-gold" title={sync.changesText}>
                Не сохранено: {sync.changesText}
              </span>
            )}
            {sync.dirty && (
              <Tooltip content="Отменить несохранённые изменения">
                <Button variant="dark" size="icon" onClick={revert} disabled={sync.busy} aria-label="Отменить изменения">
                  <Undo2 />
                </Button>
              </Tooltip>
            )}
            <Button variant="gold" size="sm" onClick={() => push(false)} disabled={sync.busy || !sync.dirty || sync.lockLost}>
              <Save /> Сохранить (push)
            </Button>
            <Button variant="dark" size="sm" onClick={() => push(true)} disabled={sync.busy || sync.lockLost}>
              Сохранить и выйти
            </Button>
            <Tooltip content="Выйти без сохранения">
              <Button variant="dark" size="icon" onClick={cancel} disabled={sync.busy} aria-label="Выйти без сохранения">
                <LogOut />
              </Button>
            </Tooltip>
          </div>
        ) : (
          <Tooltip content={!sync.online ? 'Без интернета в активный режим войти нельзя' : undefined}>
            <Button variant="gold" size="sm" onClick={startWork} disabled={sync.busy || !sync.online || sync.needsInit}>
              Начать работу
            </Button>
          </Tooltip>
        )}
      </div>

      <nav className="flex items-center gap-1 px-6">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPage(key)}
            className={cn(
              'whitespace-nowrap border-b-2 px-3.5 py-3 text-[14px] transition-colors',
              page === key ? 'border-gold text-white' : 'border-transparent text-[#9d978b] hover:text-white'
            )}
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex gap-2 pb-1">
          <Button variant="dark" size="sm" disabled={!data} onClick={() => data && run(window.api.excel.exportReport(data))}>
            <FileDown /> Отчёт Excel
          </Button>
          <Tooltip content={!editable ? 'Импорт доступен только в активном режиме — сначала нажмите «Начать работу»' : undefined}>
            <Button variant="dark" size="sm" disabled={!editable} onClick={() => setImportOpen(true)}>
              <FileUp /> Ввести данные из Excel
            </Button>
          </Tooltip>
        </div>
      </nav>
    </header>
  )
}
