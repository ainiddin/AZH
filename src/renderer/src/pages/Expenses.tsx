import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { EXPENSE_CATEGORIES } from '@shared/constants'
import type { Expense, ExpenseCategory } from '@shared/types'
import { fmtDate, fmtKzt, newId, todayIso } from '@shared/util'
import { mutate, useApp, useData, useEditable } from '@/store/app'
import { num } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/input'
import { Empty, Money, PageTitle, ReadOnlyNote } from '@/components/common'

interface Form {
  date: string
  category: ExpenseCategory
  amount: string
  note: string
}

export function Expenses() {
  const data = useData()!
  const editable = useEditable()
  const me = useApp((s) => s.sync!.identity.holder)
  const ask = useApp((s) => s.ask)
  const blank = (): Form => ({ date: todayIso(), category: 'Реклама', amount: '', note: '' })
  const [form, setForm] = useState<Form>(blank)
  const [editing, setEditing] = useState<Expense | null>(null)
  const amount = num(form.amount)
  const valid = !!form.date && amount >= 0 && form.amount.trim() !== ''

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    const rec: Expense = {
      id: editing?.id ?? newId('e'),
      date: form.date,
      category: form.category,
      amount,
      note: form.note.trim(),
      by: editing?.by ?? me
    }
    const ok = await mutate(
      (d) => {
        if (editing) d.expenses = d.expenses.map((x) => (x.id === editing.id ? rec : x))
        else d.expenses.push(rec)
      },
      editing ? 'Расход изменён (не забудьте сохранить)' : 'Расход добавлен (не забудьте сохранить)'
    )
    if (ok) {
      setEditing(null)
      setForm({ ...blank(), date: form.date })
    }
  }

  const remove = async (x: Expense) => {
    const yes = await ask({
      title: 'Удалить расход?',
      message: `${fmtDate(x.date)} · ${x.category} · ${fmtKzt(x.amount)}${x.note ? ' · ' + x.note : ''}`,
      confirmLabel: 'Удалить',
      danger: true
    })
    if (yes) await mutate((d) => (d.expenses = d.expenses.filter((e) => e.id !== x.id)), 'Расход удалён')
  }

  const rows = [...data.expenses].sort((a, b) => b.date.localeCompare(a.date))
  const byCat = EXPENSE_CATEGORIES.map((c) => ({ c, sum: data.expenses.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0) })).filter(
    (x) => x.sum > 0
  )
  const total = rows.reduce((s, e) => s + e.amount, 0)

  return (
    <div>
      <PageTitle>Расходы</PageTitle>
      {!editable && <ReadOnlyNote />}

      {editable && (
        <Card className="mb-5">
          <CardTitle>{editing ? 'Редактирование расхода' : 'Новый расход'}</CardTitle>
          <form onSubmit={submit} className="grid grid-cols-[150px_180px_160px_1fr_auto] items-end gap-3">
            <Field label="Дата">
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Категория">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Сумма, ₸">
              <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Комментарий">
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={!valid}>
                {editing ? 'Сохранить' : 'Добавить'}
              </Button>
              {editing && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(null)
                    setForm(blank())
                  }}
                >
                  Отмена
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}

      {byCat.length > 0 && (
        <div className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
          {byCat.map(({ c, sum }) => (
            <Card key={c} className="py-3">
              <div className="text-[11px] uppercase tracking-[0.06em] text-muted">{c}</div>
              <div className="mt-1 font-serif text-[22px] font-semibold">{fmtKzt(sum)}</div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        {rows.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Категория</th>
                <th className="num">Сумма</th>
                <th>Комментарий</th>
                <th>Кто</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className={editing?.id === x.id ? 'bg-gold/5' : undefined}>
                  <td className="tabular-nums">{fmtDate(x.date)}</td>
                  <td>{x.category}</td>
                  <td className="num font-medium">
                    <Money value={x.amount} />
                  </td>
                  <td className="text-muted">{x.note}</td>
                  <td className="text-muted">{x.by}</td>
                  {editable && (
                    <td className="whitespace-nowrap text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Изменить"
                        onClick={() => {
                          setEditing(x)
                          setForm({ date: x.date, category: x.category, amount: String(x.amount), note: x.note })
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(x)} aria-label="Удалить">
                        <Trash2 />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              <tr className="bg-soft/50 font-semibold">
                <td colSpan={2}>Итого</td>
                <td className="num">
                  <Money value={total} />
                </td>
                <td colSpan={editable ? 3 : 2} />
              </tr>
            </tbody>
          </table>
        ) : (
          <Empty>Расходов пока нет</Empty>
        )}
      </Card>
    </div>
  )
}
