import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { availableFor, colorsOf, saleWarnings } from '@shared/calc'
import { CHANNELS, DELIVERY_LABEL, STATUS_LABEL } from '@shared/constants'
import type { Channel, Sale } from '@shared/types'
import { fmtDate, fmtKzt, newId, todayIso } from '@shared/util'
import { mutate, useApp, useData, useEditable } from '@/store/app'
import { num } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/input'
import { ColorName, Empty, Money, PageTitle, ReadOnlyNote, Warnings } from '@/components/common'

interface Form {
  date: string
  color: string
  qty: string
  price: string
  channel: Channel
  status: Sale['status']
  buyer: string
  delivery: Sale['delivery']
  deliveryCost: string
  note: string
}

export function Sales() {
  const data = useData()!
  const editable = useEditable()
  const me = useApp((s) => s.sync!.identity.holder)
  const ask = useApp((s) => s.ask)
  const colors = useMemo(() => colorsOf(data), [data])

  const blank = (): Form => ({
    date: todayIso(),
    color: colors[0] ?? '',
    qty: '1',
    price: String(data.config.targetPrice),
    channel: 'Instagram',
    status: 'paid',
    buyer: '',
    delivery: 'buyer',
    deliveryCost: '0',
    note: ''
  })
  const [form, setForm] = useState<Form>(blank)
  const [editing, setEditing] = useState<Sale | null>(null)
  const [filter, setFilter] = useState<'all' | Sale['status']>('all')
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const qty = num(form.qty)
  const price = num(form.price)
  const deliveryCost = form.delivery === 'us' ? num(form.deliveryCost) : 0
  const errors: string[] = []
  if (!form.date) errors.push('Укажите дату')
  if (!form.color.trim()) errors.push('Укажите цвет')
  if (!Number.isInteger(qty) || qty <= 0) errors.push('Количество — целое число больше 0')
  if (!(price >= 0)) errors.push('Цена — число')
  if (!(deliveryCost >= 0)) errors.push('Стоимость доставки — число')
  const warnings =
    errors.length === 0 ? saleWarnings(data, { id: editing?.id ?? '__new', color: form.color, qty, price }) : []
  const available = form.color ? availableFor(data, form.color, editing?.id) : 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (errors.length) return
    const rec: Sale = {
      id: editing?.id ?? newId('s'),
      date: form.date,
      color: form.color.trim(),
      qty,
      price,
      channel: form.channel,
      status: form.status,
      buyer: form.buyer.trim(),
      delivery: form.delivery,
      deliveryCost,
      note: form.note.trim(),
      by: editing?.by ?? me,
      createdAt: editing?.createdAt ?? new Date().toISOString()
    }
    const ok = await mutate(
      (d) => {
        if (editing) d.sales = d.sales.map((s) => (s.id === editing.id ? rec : s))
        else d.sales.push(rec)
      },
      editing ? 'Продажа изменена (не забудьте сохранить)' : 'Продажа добавлена (не забудьте сохранить)'
    )
    if (ok) {
      setEditing(null)
      setForm({ ...blank(), date: form.date, channel: form.channel })
    }
  }

  const startEdit = (s: Sale) => {
    setEditing(s)
    setForm({
      date: s.date,
      color: s.color,
      qty: String(s.qty),
      price: String(s.price),
      channel: s.channel,
      status: s.status,
      buyer: s.buyer,
      delivery: s.delivery,
      deliveryCost: String(s.deliveryCost),
      note: s.note
    })
  }

  const remove = async (s: Sale) => {
    const yes = await ask({
      title: 'Удалить продажу?',
      message: `${fmtDate(s.date)} · ${s.color} × ${s.qty} · ${fmtKzt(s.price)}${s.buyer ? ' · ' + s.buyer : ''}`,
      confirmLabel: 'Удалить',
      danger: true
    })
    if (yes) await mutate((d) => (d.sales = d.sales.filter((x) => x.id !== s.id)), 'Продажа удалена')
  }

  const rows = [...data.sales]
    .filter((s) => filter === 'all' || s.status === filter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const totalQty = rows.reduce((s, r) => s + r.qty, 0)
  const totalSum = rows.reduce((s, r) => s + r.qty * r.price, 0)

  return (
    <div>
      <PageTitle>Продажи</PageTitle>
      {!editable && <ReadOnlyNote />}

      {editable && (
        <Card className="mb-5">
          <CardTitle>{editing ? 'Редактирование продажи' : 'Новая продажа'}</CardTitle>
          <form onSubmit={submit} className="grid grid-cols-6 gap-3">
            <Field label="Дата">
              <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            </Field>
            <Field label="Цвет" hint={form.color ? `в наличии: ${Math.max(0, available)} шт` : undefined}>
              <Select value={form.color} onChange={(e) => set('color', e.target.value)}>
                {colors.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Кол-во">
              <Input inputMode="numeric" value={form.qty} onChange={(e) => set('qty', e.target.value)} />
            </Field>
            <Field label="Цена за шт, ₸" hint={qty > 0 && price > 0 ? `сумма ${fmtKzt(qty * price)}` : undefined}>
              <Input inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} />
            </Field>
            <Field label="Канал">
              <Select value={form.channel} onChange={(e) => set('channel', e.target.value as Channel)}>
                {CHANNELS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Статус">
              <Select value={form.status} onChange={(e) => set('status', e.target.value as Sale['status'])}>
                <option value="paid">{STATUS_LABEL.paid}</option>
                <option value="reserved">{STATUS_LABEL.reserved}</option>
              </Select>
            </Field>
            <Field label="Покупатель" className="col-span-2">
              <Input value={form.buyer} onChange={(e) => set('buyer', e.target.value)} placeholder="Имя, @ник или телефон" />
            </Field>
            <Field label="Доставку оплачивает">
              <Select value={form.delivery} onChange={(e) => set('delivery', e.target.value as Sale['delivery'])}>
                <option value="buyer">{DELIVERY_LABEL.buyer}</option>
                <option value="us">Мы (за наш счёт)</option>
              </Select>
            </Field>
            <Field label="Стоимость доставки, ₸">
              <Input
                inputMode="decimal"
                value={form.delivery === 'us' ? form.deliveryCost : '0'}
                disabled={form.delivery !== 'us'}
                onChange={(e) => set('deliveryCost', e.target.value)}
              />
            </Field>
            <Field label="Комментарий" className="col-span-2">
              <Input value={form.note} onChange={(e) => set('note', e.target.value)} />
            </Field>
            <div className="col-span-6 flex flex-col gap-2">
              {errors.length > 0 && form.qty !== '' && <div className="text-[13px] text-neg">{errors.join(' · ')}</div>}
              <Warnings items={warnings} />
              <div className="flex gap-2">
                <Button type="submit" disabled={errors.length > 0}>
                  {editing ? 'Сохранить изменения' : 'Добавить продажу'}
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
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <CardTitle className="mb-0">Все продажи</CardTitle>
          <div className="flex gap-1">
            {(['all', 'paid', 'reserved'] as const).map((k) => (
              <Button key={k} size="sm" variant={filter === k ? 'default' : 'ghost'} onClick={() => setFilter(k)}>
                {k === 'all' ? 'Все' : STATUS_LABEL[k]}
              </Button>
            ))}
          </div>
        </div>
        {rows.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Цвет</th>
                <th className="num">Шт</th>
                <th className="num">Цена</th>
                <th className="num">Сумма</th>
                <th>Канал</th>
                <th>Статус</th>
                <th>Покупатель</th>
                <th>Доставка</th>
                <th>Кто</th>
                {editable && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className={editing?.id === s.id ? 'bg-gold/5' : undefined}>
                  <td className="tabular-nums">{fmtDate(s.date)}</td>
                  <td>
                    <ColorName color={s.color} />
                  </td>
                  <td className="num">{s.qty}</td>
                  <td className={s.price < data.config.minPrice ? 'num text-neg' : 'num'}>
                    <Money value={s.price} />
                  </td>
                  <td className="num font-medium">
                    <Money value={s.qty * s.price} />
                  </td>
                  <td>{s.channel}</td>
                  <td>
                    <Badge tone={s.status === 'paid' ? 'pos' : 'gold'}>{STATUS_LABEL[s.status]}</Badge>
                  </td>
                  <td className="max-w-[160px] truncate" title={s.note || undefined}>
                    {s.buyer || <span className="text-muted">—</span>}
                  </td>
                  <td className="text-muted">{s.delivery === 'us' ? `мы · ${fmtKzt(s.deliveryCost)}` : 'покупатель'}</td>
                  <td className="text-muted">{s.by}</td>
                  {editable && (
                    <td className="whitespace-nowrap text-right">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(s)} aria-label="Изменить">
                        <Pencil />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(s)} aria-label="Удалить">
                        <Trash2 />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              <tr className="bg-soft/50 font-semibold">
                <td colSpan={2}>Итого</td>
                <td className="num">{totalQty}</td>
                <td />
                <td className="num">
                  <Money value={totalSum} />
                </td>
                <td colSpan={editable ? 6 : 5} />
              </tr>
            </tbody>
          </table>
        ) : (
          <Empty>Продаж пока нет</Empty>
        )}
      </Card>
    </div>
  )
}
