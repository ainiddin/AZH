import { useMemo, useState } from 'react'
import { AlertTriangle, Copy, Download, FileSpreadsheet, Loader2, XCircle } from 'lucide-react'
import { colorsOf } from '@shared/calc'
import { DEFAULT_COLORS } from '@shared/constants'
import { applyImport, buildImportPlan, describeSummary, summarizePlan, type ImportPlan, type ImportRow } from '@shared/excel/importPlan'
import { newId } from '@shared/util'
import { mutate, run, useApp, useData, useEditable } from '@/store/app'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'

const ACTION: Record<ImportRow['action'], string> = { create: 'Новая', update: 'Обновление', same: 'Без изменений' }

export function ImportDialog() {
  const open = useApp((s) => s.importOpen)
  const setOpen = useApp((s) => s.setImportOpen)
  const me = useApp((s) => s.sync?.identity.holder ?? '')
  const toast = useApp((s) => s.toast)
  const editable = useEditable()
  const data = useData()
  const [file, setFile] = useState<string | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [pushNow, setPushNow] = useState(true)

  const close = () => {
    setOpen(false)
    setPlan(null)
    setFile(null)
  }

  const pick = async () => {
    if (!data) return
    setBusy(true)
    const wb = await run(window.api.excel.open())
    setBusy(false)
    if (!wb) return
    setFile(wb.fileName)
    setPlan(buildImportPlan(wb.sheets, data, { by: me, nowIso: new Date().toISOString(), newId }))
  }

  const toggle = (key: string) =>
    plan && setPlan({ ...plan, rows: plan.rows.map((r) => (r.key === key ? { ...r, include: !r.include } : r)) })

  const summary = useMemo(() => (plan ? summarizePlan(plan.rows) : null), [plan])
  const count = plan?.rows.filter((r) => r.include && r.action !== 'same').length ?? 0

  const confirm = async () => {
    if (!plan || !data || !count) return
    setBusy(true)
    const next = applyImport(data, plan.rows)
    const ok = await mutate(
      (d) => {
        d.purchases = next.purchases
        d.sales = next.sales
        d.expenses = next.expenses
      },
      undefined,
      `импорт из Excel (${file})`
    )
    if (ok && pushNow) {
      const msg = await run(window.api.sync.push(false))
      if (msg) toast('ok', `Сохранено: ${msg}`)
    } else if (ok) toast('ok', 'Данные добавлены в черновик — нажмите «Сохранить (push)»')
    setBusy(false)
    if (ok) close()
  }

  const colors = data ? [...new Set([...colorsOf(data), ...DEFAULT_COLORS])] : DEFAULT_COLORS

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && close()}
      title="Ввести данные из Excel"
      description={plan ? `Файл: ${file}` : 'Продажи, закупки и расходы из .xlsx, .xls или .csv'}
      className={plan ? 'w-[min(1040px,95vw)]' : undefined}
      footer={
        plan ? (
          <>
            <label className="mr-auto flex items-center gap-2 self-center text-[13px]">
              <input type="checkbox" checked={pushNow} onChange={(e) => setPushNow(e.target.checked)} className="accent-[#b08d57]" />
              Сразу сохранить на сервер (push)
            </label>
            <Button variant="outline" onClick={() => setPlan(null)} disabled={busy}>
              Другой файл
            </Button>
            <Button variant="gold" onClick={confirm} disabled={busy || !count || !editable}>
              {busy && <Loader2 className="animate-spin" />} Импортировать {count ? `(${count})` : ''}
            </Button>
          </>
        ) : undefined
      }
    >
      {!plan ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={pick}
              disabled={busy || !editable}
              className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gold/50 bg-gold/5 px-4 py-8 text-center transition hover:bg-gold/10 disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-8 animate-spin text-gold" /> : <FileSpreadsheet className="size-8 text-gold" />}
              <span className="font-medium">Выбрать файл…</span>
              <span className="text-[12px] text-muted">.xlsx · .xls · .csv</span>
            </button>
            <button
              onClick={() => run(window.api.excel.saveTemplate(colors))}
              className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-4 py-8 text-center transition hover:border-ink/30"
            >
              <Download className="size-8 text-muted" />
              <span className="font-medium">Скачать шаблон</span>
              <span className="text-[12px] text-muted">с выпадающими списками</span>
            </button>
          </div>
          <ul className="list-disc pl-5 text-[13px] leading-relaxed text-muted">
            <li>Листы ищутся по названию: «Продажи», «Закупки», «Расходы»; колонки — по заголовкам, порядок не важен.</li>
            <li>Можно загрузить и выгрузку «Отчёт Excel»: строки с ID обновят записи, без ID — добавятся новые.</li>
            <li>Перед записью покажем предпросмотр с ошибками и возможными дублями.</li>
          </ul>
        </div>
      ) : (
        <Preview plan={plan} summary={summary!} toggle={toggle} />
      )}
    </Dialog>
  )
}

function Preview({
  plan,
  summary,
  toggle
}: {
  plan: ImportPlan
  summary: ReturnType<typeof summarizePlan>
  toggle: (key: string) => void
}) {
  const sheets = [...new Set(plan.rows.map((r) => r.sheet))]
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-soft/70 px-4 py-3">
        <div className="font-medium first-letter:uppercase">{describeSummary(summary)}</div>
        <div className="mt-1 flex flex-wrap gap-2 text-[12px]">
          {summary.errors > 0 && <Badge tone="neg">строк с ошибками: {summary.errors}</Badge>}
          {summary.duplicates > 0 && <Badge tone="warn">возможных дублей: {summary.duplicates}</Badge>}
          {summary.same > 0 && <Badge>без изменений: {summary.same}</Badge>}
        </div>
      </div>

      {plan.fileErrors.map((e) => (
        <div key={e} className="flex items-center gap-2 rounded-lg border border-neg/30 bg-neg/5 px-3 py-2 text-[13px] text-neg">
          <XCircle className="size-4" /> {e}
        </div>
      ))}

      {sheets.map((sheet) => (
        <div key={sheet}>
          <h3 className="section-title">{sheet}</h3>
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-8" />
                <th className="w-[70px]">Строка</th>
                <th className="w-[120px]">Действие</th>
                <th>Запись</th>
                <th>Проблемы</th>
              </tr>
            </thead>
            <tbody>
              {plan.rows
                .filter((r) => r.sheet === sheet)
                .map((r) => {
                  const bad = r.errors.length > 0
                  return (
                    <tr key={r.key} className={cn(bad && 'bg-neg/[0.04]', !r.include && !bad && 'text-muted')}>
                      <td>
                        <input
                          type="checkbox"
                          className="accent-[#b08d57]"
                          checked={r.include}
                          disabled={bad || r.action === 'same'}
                          onChange={() => toggle(r.key)}
                          aria-label="Импортировать строку"
                        />
                      </td>
                      <td className="tabular-nums">{r.rows.length > 1 ? `${r.rows[0]}–${r.rows[r.rows.length - 1]}` : r.rows[0]}</td>
                      <td>
                        {bad ? (
                          <Badge tone="neg">Ошибка</Badge>
                        ) : r.duplicate ? (
                          <Badge tone="warn">
                            <Copy className="size-3" /> Возможный дубль
                          </Badge>
                        ) : (
                          <Badge tone={r.action === 'create' ? 'pos' : r.action === 'update' ? 'gold' : 'neutral'}>{ACTION[r.action]}</Badge>
                        )}
                      </td>
                      <td>{r.label}</td>
                      <td className="text-[12px]">
                        {r.errors.map((e, i) => (
                          <div key={i} className="text-neg">
                            {sheet}, строка {e.row}
                            {e.column ? `, «${e.column}»` : ''}: {e.message}
                          </div>
                        ))}
                        {r.warnings.map((w) => (
                          <div key={w} className="flex items-center gap-1 text-warn">
                            <AlertTriangle className="size-3" /> {w}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      ))}
      {plan.rows.length === 0 && !plan.fileErrors.length && <div className="text-[13px] text-muted">В файле нет строк с данными.</div>}
    </div>
  )
}
