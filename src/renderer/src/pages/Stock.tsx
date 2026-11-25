import { useMemo } from 'react'
import { costByColor, stockByColor } from '@shared/calc'
import { fmtKzt } from '@shared/util'
import { useData } from '@/store/app'
import { Card } from '@/components/ui/card'
import { ColorDot, Money, PageTitle } from '@/components/common'
import { cn } from '@/lib/utils'

export function Stock() {
  const data = useData()!
  const stock = useMemo(() => stockByColor(data), [data])
  const unit = useMemo(() => costByColor(data.purchases), [data])
  const t = stock.reduce(
    (a, s) => ({
      purchased: a.purchased + s.purchased,
      paid: a.paid + s.paid,
      reserved: a.reserved + s.reserved,
      available: a.available + s.available,
      value: a.value + Math.max(0, s.available) * (unit[s.color]?.unit ?? 0)
    }),
    { purchased: 0, paid: 0, reserved: 0, available: 0, value: 0 }
  )

  return (
    <div>
      <PageTitle>Склад</PageTitle>
      <div className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
        {stock.map((s) => (
          <Card key={s.color} className="flex flex-col gap-3">
            <div className="flex items-center gap-2 font-medium">
              <ColorDot color={s.color} className="size-4" />
              {s.color}
            </div>
            <div className={cn('font-serif text-[40px] font-semibold leading-none', s.available < 0 && 'text-neg')}>
              {s.available}
              <span className="ml-1 font-sans text-[13px] font-normal text-muted">шт в наличии</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-soft">
              <div className="bg-[#cfc7b8]" style={{ width: `${(s.paid / Math.max(1, s.purchased)) * 100}%` }} />
              <div className="bg-gold/60" style={{ width: `${(s.reserved / Math.max(1, s.purchased)) * 100}%` }} />
            </div>
            <div className="grid grid-cols-3 text-[12px] text-muted">
              <div>
                Закуплено<div className="text-ink">{s.purchased}</div>
              </div>
              <div>
                Продано<div className="text-ink">{s.paid}</div>
              </div>
              <div>
                Бронь<div className="text-ink">{s.reserved}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <table className="tbl">
          <thead>
            <tr>
              <th>Цвет</th>
              <th className="num">Закуплено</th>
              <th className="num">Оплачено</th>
              <th className="num">Бронь</th>
              <th className="num">Остаток</th>
              <th className="num">Себестоимость шт</th>
              <th className="num">Стоимость остатка</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((s) => (
              <tr key={s.color}>
                <td>
                  <span className="inline-flex items-center gap-2">
                    <ColorDot color={s.color} />
                    {s.color}
                  </span>
                </td>
                <td className="num">{s.purchased}</td>
                <td className="num">{s.paid}</td>
                <td className="num">{s.reserved}</td>
                <td className={cn('num font-semibold', s.available < 0 && 'text-neg')}>{s.available}</td>
                <td className="num">{fmtKzt(unit[s.color]?.unit ?? 0, 2)}</td>
                <td className="num">
                  <Money value={Math.max(0, s.available) * (unit[s.color]?.unit ?? 0)} />
                </td>
              </tr>
            ))}
            <tr className="bg-soft/50 font-semibold">
              <td>Итого</td>
              <td className="num">{t.purchased}</td>
              <td className="num">{t.paid}</td>
              <td className="num">{t.reserved}</td>
              <td className="num">{t.available}</td>
              <td />
              <td className="num">
                <Money value={t.value} />
              </td>
            </tr>
          </tbody>
        </table>
        {stock.some((s) => s.available < 0) && (
          <div className="mt-3 text-[13px] text-neg">Отрицательный остаток: продано больше, чем закуплено — проверьте продажи или закупки.</div>
        )}
      </Card>
    </div>
  )
}
