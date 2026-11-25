import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { colorsOf, purchaseBreakdown } from '@shared/calc'
import { DEFAULT_COLORS } from '@shared/constants'
import { PurchaseSchema } from '@shared/schemas'
import type { Purchase } from '@shared/types'
import { fmtDate, fmtKzt, newId, todayIso } from '@shared/util'
import { mutate, useApp, useData, useEditable } from '@/store/app'
import { num } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { ColorName, Empty, Money, PageTitle, ReadOnlyNote } from '@/components/common'

interface ItemRow {
  color: string
  qty: string
  unitCny: string
}
interface CostRow {
  label: string
  kzt: string
}
interface Form {
  id: string | null
  date: string
  title: string
  items: ItemRow[]
  costs: CostRow[]
}

export function Purchases() {
  const data = useData()!
  const editable = useEditable()
  const ask = useApp((s) => s.ask)
  const [form, setForm] = useState<Form | null>(null)
  const colors = useMemo(() => [...new Set([...colorsOf(data), ...DEFAULT_COLORS])], [data])

  const openNew = () =>
    setForm({
      id: null,
      date: todayIso(),
      title: `Партия №${data.purchases.length + 1}`,
      items: [{ color: colors[0] ?? '', qty: '1', unitCny: '100' }],
      costs: [{ label: 'Товар + доставка до карго', kzt: '' }]
    })

  const openEdit = (p: Purchase) =>
    setForm({
      id: p.id,
      date: p.date,
      title: p.title,
      items: p.items.map((i) => ({ color: i.color, qty: String(i.qty), unitCny: String(i.unitCny) })),
      costs: p.costs.map((c) => ({ label: c.label, kzt: String(c.kzt) }))
    })

  const remove = async (p: Purchase) => {
    const sold = data.sales.some((s) => p.items.some((i) => i.color === s.color))
    const yes = await ask({
      title: `Удалить «${p.title}»?`,
      message: sold
        ? 'По цветам этой партии есть продажи — после удаления остатки и себестоимость пересчитаются.'
        : 'Партия будет удалена.',
      confirmLabel: 'Удалить',
      danger: true
    })
    if (yes) await mutate((d) => (d.purchases = d.purchases.filter((x) => x.id !== p.id)), 'Партия удалена')
  }

  return (
    <div>
      <PageTitle
        actions={
          editable && (
            <Button onClick={openNew}>
              <Plus /> Новая партия
            </Button>
          )
        }
      >
        Закупки
      </PageTitle>
      {!editable && <ReadOnlyNote />}

      <div className="flex flex-col gap-4">
        {data.purchases.length === 0 && (
          <Card>
            <Empty>Партий пока нет</Empty>
          </Card>
        )}
        {[...data.purchases]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((p) => {
            const b = purchaseBreakdown(p)
            return (
              <Card key={p.id}>
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[24px] leading-tight">{p.title}</h2>
                    <div className="text-[13px] text-muted">
                      {fmtDate(p.date)} · {b.totalQty} шт · {b.totalCny.toLocaleString('ru-RU')} ¥ · итого{' '}
                      <b className="text-ink">{fmtKzt(b.totalKzt, 2)}</b>
                      {b.totalQty > 0 && <> · в среднем {fmtKzt(b.totalKzt / b.totalQty, 2)}/шт</>}
                    </div>
                  </div>
                  {editable && (
                    <div className="flex">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)} aria-label="Изменить">
                        <Pencil />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(p)} aria-label="Удалить">
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <CardTitle>Товары</CardTitle>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Цвет</th>
                          <th className="num">Шт</th>
                          <th className="num">Цена ¥</th>
                          <th className="num">Себестоимость шт</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.items.map((i, k) => (
                          <tr key={k}>
                            <td>
                              <ColorName color={i.color} />
                            </td>
                            <td className="num">{i.qty}</td>
                            <td className="num">{i.unitCny.toLocaleString('ru-RU')} ¥</td>
                            <td className="num">{fmtKzt(b.unitKzt[k], 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <CardTitle>Затраты</CardTitle>
                    <table className="tbl">
                      <tbody>
                        {p.costs.map((c, k) => (
                          <tr key={k}>
                            <td>{c.label}</td>
                            <td className="num">{fmtKzt(c.kzt, 2)}</td>
                          </tr>
                        ))}
                        <tr className="font-semibold">
                          <td>Итого</td>
                          <td className="num">{fmtKzt(b.totalKzt, 2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            )
          })}
      </div>

      {form && <PurchaseEditor form={form} setForm={setForm} colors={colors} />}
    </div>
  )
}

function PurchaseEditor({ form, setForm, colors }: { form: Form; setForm: (f: Form | null) => void; colors: string[] }) {
  const upd = (patch: Partial<Form>) => setForm({ ...form, ...patch })
  const setItem = (i: number, patch: Partial<ItemRow>) => upd({ items: form.items.map((x, k) => (k === i ? { ...x, ...patch } : x)) })
  const setCost = (i: number, patch: Partial<CostRow>) => upd({ costs: form.costs.map((x, k) => (k === i ? { ...x, ...patch } : x)) })

  const record: Purchase = {
    id: form.id ?? newId('p'),
    date: form.date,
    title: form.title.trim(),
    items: form.items.map((i) => ({ color: i.color.trim(), qty: num(i.qty), unitCny: num(i.unitCny) })),
    costs: form.costs.filter((c) => c.label.trim() || c.kzt).map((c) => ({ label: c.label.trim(), kzt: num(c.kzt) }))
  }
  const v = PurchaseSchema.safeParse(record)
  const error = v.success ? null : v.error.issues[0]?.message
  const b = v.success ? purchaseBreakdown(record) : null

  const save = async () => {
    if (!v.success) return
    const ok = await mutate(
      (d) => {
        if (form.id) d.purchases = d.purchases.map((p) => (p.id === form.id ? record : p))
        else d.purchases.push(record)
      },
      form.id ? 'Партия изменена (не забудьте сохранить)' : 'Партия добавлена (не забудьте сохранить)'
    )
    if (ok) setForm(null)
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && setForm(null)}
      title={form.id ? 'Изменить партию' : 'Новая партия'}
      description="Затраты распределяются по товарам пропорционально цене в юанях."
      className="w-[min(760px,94vw)]"
      footer={
        <>
          {error && <span className="mr-auto self-center text-[13px] text-neg">{error}</span>}
          <Button variant="outline" onClick={() => setForm(null)}>
            Отмена
          </Button>
          <Button onClick={save} disabled={!v.success}>
            Сохранить партию
          </Button>
        </>
      }
    >
      <datalist id="colors">
        {colors.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Дата">
          <Input type="date" value={form.date} onChange={(e) => upd({ date: e.target.value })} />
        </Field>
        <Field label="Название" className="col-span-2">
          <Input value={form.title} onChange={(e) => upd({ title: e.target.value })} />
        </Field>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <h3 className="section-title mb-0">Товары</h3>
        <Button size="sm" variant="ghost" onClick={() => upd({ items: [...form.items, { color: '', qty: '1', unitCny: '100' }] })}>
          <Plus /> строка
        </Button>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {form.items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_90px_110px_130px_32px] items-center gap-2">
            <Input list="colors" placeholder="Цвет" value={it.color} onChange={(e) => setItem(i, { color: e.target.value })} />
            <Input inputMode="numeric" placeholder="Шт" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} />
            <Input inputMode="decimal" placeholder="Цена ¥" value={it.unitCny} onChange={(e) => setItem(i, { unitCny: e.target.value })} />
            <div className="text-right text-[12px] text-muted">{b ? `${fmtKzt(b.unitKzt[i] ?? 0)}/шт` : ''}</div>
            <Button size="icon" variant="ghost" disabled={form.items.length === 1} onClick={() => upd({ items: form.items.filter((_, k) => k !== i) })} aria-label="Удалить строку">
              <X />
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <h3 className="section-title mb-0">Затраты, ₸</h3>
        <Button size="sm" variant="ghost" onClick={() => upd({ costs: [...form.costs, { label: '', kzt: '' }] })}>
          <Plus /> строка
        </Button>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {form.costs.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_160px_32px] items-center gap-2">
            <Input placeholder="Статья (например, Карго в Казахстан)" value={c.label} onChange={(e) => setCost(i, { label: e.target.value })} />
            <Input inputMode="decimal" placeholder="Сумма ₸" value={c.kzt} onChange={(e) => setCost(i, { kzt: e.target.value })} />
            <Button size="icon" variant="ghost" onClick={() => upd({ costs: form.costs.filter((_, k) => k !== i) })} aria-label="Удалить строку">
              <X />
            </Button>
          </div>
        ))}
      </div>

      {b && (
        <div className="mt-5 rounded-lg bg-soft/70 px-4 py-3 text-[13px]">
          {b.totalQty} шт · {b.totalCny.toLocaleString('ru-RU')} ¥ · итого <b><Money value={b.totalKzt} /></b>
          {b.totalQty > 0 && <> · в среднем {fmtKzt(b.totalKzt / b.totalQty, 2)} за шт</>}
        </div>
      )}
    </Dialog>
  )
}
