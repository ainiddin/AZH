import { AlertTriangle, History, LockKeyhole } from 'lucide-react'
import { run, startWork, useApp } from '@/store/app'
import { dateTime } from '@/lib/utils'
import { Button } from './ui/button'

function Banner({ icon, children, actions, tone = 'warn' }: { icon: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode; tone?: 'warn' | 'err' }) {
  return (
    <div
      className={
        tone === 'err'
          ? 'mb-4 flex items-center gap-3 rounded-xl border border-neg/30 bg-neg/5 px-4 py-3 text-[13px] text-neg'
          : 'mb-4 flex items-center gap-3 rounded-xl border border-[#f0dcb0] bg-[#fff7e6] px-4 py-3 text-[13px] text-warn'
      }
    >
      <span className="[&_svg]:size-5">{icon}</span>
      <div className="flex-1">{children}</div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}

export function Banners() {
  const sync = useApp((s) => s.sync)
  const ask = useApp((s) => s.ask)
  if (!sync) return null

  const discard = async () => {
    const ok = await ask({
      title: 'Удалить черновик?',
      message: `Несохранённые изменения (${sync.recovery?.summary || 'без изменений'}) будут удалены безвозвратно.`,
      confirmLabel: 'Удалить черновик',
      danger: true
    })
    if (ok) await run(window.api.sync.discardRecovery(), 'Черновик удалён')
  }

  return (
    <>
      {sync.recovery && sync.mode === 'active' && !sync.lockLost && (
        <Banner
          icon={<History />}
          actions={
            <Button size="sm" variant="gold" onClick={() => run(window.api.sync.push(false), 'Черновик сохранён')}>
              Сохранить (push)
            </Button>
          }
        >
          <b>Восстановлен несохранённый черновик</b> от {dateTime(sync.recovery.savedAt)}: {sync.recovery.summary || 'без изменений'}. Замок
          всё ещё ваш — сохраните изменения.
        </Banner>
      )}
      {sync.recovery && sync.mode === 'inactive' && (
        <Banner
          icon={<History />}
          actions={
            <>
              <Button size="sm" variant="gold" onClick={startWork} disabled={!sync.online}>
                Продолжить работу
              </Button>
              <Button size="sm" variant="outline" onClick={discard}>
                Удалить черновик
              </Button>
            </>
          }
        >
          <b>Найден несохранённый черновик</b> от {dateTime(sync.recovery.savedAt)}: {sync.recovery.summary || 'без изменений'}.
          Чтобы сохранить его, нужно снова получить замок.
        </Banner>
      )}
      {sync.lockLost && (
        <Banner
          tone="err"
          icon={<LockKeyhole />}
          actions={
            <>
              <Button size="sm" variant="outline" onClick={startWork}>
                Попробовать вернуть замок
              </Button>
              <Button size="sm" variant="danger" onClick={() => run(window.api.sync.cancel())}>
                Выйти без сохранения
              </Button>
            </>
          }
        >
          <b>Замок перехвачен{sync.lock?.holder ? ` (${sync.lock.holder})` : ''}.</b> Редактирование и сохранение недоступны — на сервере ничего не
          перезаписано. Черновик хранится на этом компьютере.
        </Banner>
      )}
      {sync.error && !sync.online && (
        <Banner icon={<AlertTriangle />}>Нет связи с GitHub — показаны последние сохранённые данные. Повтор через минуту.</Banner>
      )}
    </>
  )
}
