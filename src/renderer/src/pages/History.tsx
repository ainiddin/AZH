import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { LOCK_COMMIT_PREFIX } from '@shared/sync/commitMessage'
import type { CommitInfo } from '@shared/sync/RemoteStore'
import { useApp } from '@/store/app'
import { dateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, PageTitle } from '@/components/common'

/** История — список коммитов: кто, когда, что изменил. */
export function History() {
  const head = useApp((s) => s.sync?.lastSync)
  const [commits, setCommits] = useState<CommitInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showLocks, setShowLocks] = useState(false)

  const load = useCallback(async () => {
    const r = await window.api.sync.history()
    if (r.ok) {
      setCommits(r.value)
      setError(null)
    } else setError(r.error.message)
  }, [])

  useEffect(() => {
    load()
  }, [load, head])

  const list = (commits ?? []).filter((c) => showLocks || !c.message.startsWith(LOCK_COMMIT_PREFIX))

  return (
    <div>
      <PageTitle
        actions={
          <>
            <Button variant={showLocks ? 'default' : 'outline'} size="sm" onClick={() => setShowLocks(!showLocks)}>
              {showLocks ? 'Скрыть служебные' : 'Показать служебные (замок)'}
            </Button>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw /> Обновить
            </Button>
          </>
        }
      >
        История
      </PageTitle>
      <Card>
        {error && <div className="text-[13px] text-neg">{error}</div>}
        {!commits && !error && (
          <div className="flex items-center gap-2 py-6 text-muted">
            <Loader2 className="size-4 animate-spin" /> Загрузка…
          </div>
        )}
        {commits && list.length === 0 && <Empty>Изменений пока нет</Empty>}
        {list.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-[160px]">Когда</th>
                <th className="w-[140px]">Кто</th>
                <th>Что изменено</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const lock = c.message.startsWith(LOCK_COMMIT_PREFIX)
                const text = lock ? c.message.slice(LOCK_COMMIT_PREFIX.length) : c.message.replace(new RegExp(`^${escape(c.author)}:\\s*`), '')
                return (
                  <tr key={c.sha} className={lock ? 'text-muted' : undefined}>
                    <td className="tabular-nums">{dateTime(c.date)}</td>
                    <td className="font-medium">{c.author}</td>
                    <td>
                      {text}
                      <span className="ml-2 font-mono text-[11px] text-muted/70">{c.sha.slice(0, 7)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
