import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { breakeven, byChannel, costByColor, finance, scenarios, stockByColor } from '@shared/calc'
import { COLOR_SWATCH } from '@shared/constants'
import { fmtKzt, fmtPct } from '@shared/util'
import { useData } from '@/store/app'
import { Card, CardTitle } from '@/components/ui/card'
import { ColorName, Empty, Kpi, Money } from '@/components/common'
import { cn } from '@/lib/utils'

const axis = { fontSize: 12, fill: '#7a766e' }
const short = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 1000)} тыс` : String(n))

export function Overview() {
  const data = useData()!
  const f = useMemo(() => finance(data), [data])
  const sc = useMemo(() => scenarios(data), [data])
  const channels = useMemo(() => byChannel(data), [data])
  const stock = useMemo(() => stockByColor(data), [data])
  const unit = useMemo(() => costByColor(data.purchases), [data])
  const beT = breakeven(data, data.config.targetPrice)
  const beM = breakeven(data, data.config.minPrice)
  const progress = Math.min(1, f.payback)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3.5">
        <Kpi label="Выручка" value={fmtKzt(f.revenue)} sub={`${f.paidQty} шт · средняя ${fmtKzt(f.avgPrice)}`} />
        <Kpi
          label="Чистая прибыль"
          value={fmtKzt(f.netProfit)}
          tone={f.netProfit > 0 ? 'pos' : f.netProfit < 0 ? 'neg' : null}
          sub={`себестоимость проданного ${fmtKzt(f.cogs)}`}
        />
        <Kpi
          label="Деньги на руках"
          value={fmtKzt(f.cashOnHand)}
          tone={f.cashOnHand >= 0 ? 'pos' : 'neg'}
          sub="выручка − все вложения"
        />
        <Kpi label="Вложено" value={fmtKzt(f.invested)} sub={`закупки ${fmtKzt(f.purchaseCost)} · расходы ${fmtKzt(f.opex + f.ourDelivery)}`} />
        <Kpi label="Остаток" value={`${f.freeQty} шт`} sub={`из ${f.purchasedQty} · в брони ${f.reservedQty} шт (${fmtKzt(f.reservedRevenue)})`} />
      </div>

      <Card>
        <div className="flex items-baseline justify-between">
          <CardTitle>Окупаемость</CardTitle>
          <div className="font-serif text-[22px] font-semibold">{fmtPct(f.payback)}</div>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-soft">
          <div className={cn('h-full rounded-full transition-all', progress >= 1 ? 'bg-pos' : 'bg-gold')} style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 text-[13px] text-muted">
          <div>
            Безубыточность при {fmtKzt(data.config.targetPrice)}: всего {beT.totalUnits} шт,{' '}
            {beT.remainingUnits === 0 ? <b className="text-pos">уже достигнута</b> : <b className="text-ink">ещё {beT.remainingUnits} шт</b>}
            {!beT.reachable && <span className="text-neg"> — не хватает остатка</span>}
          </div>
          <div>
            При минимальной {fmtKzt(data.config.minPrice)}: всего {beM.totalUnits} шт,{' '}
            {beM.remainingUnits === 0 ? <b className="text-pos">уже достигнута</b> : <b className="text-ink">ещё {beM.remainingUnits} шт</b>}
            {!beM.reachable && <span className="text-neg"> — не хватает остатка</span>}
          </div>
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-[22px]">Сценарии: остаток {f.freeQty} шт продан…</h2>
        <div className="grid grid-cols-3 gap-3.5">
          {sc.map((s) => (
            <Card key={s.key} className={cn(s.key === 'target' && 'border-gold/60')}>
              <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{s.label}</div>
              <div className="mt-1 text-[13px] text-muted">{fmtKzt(s.price)} за шт</div>
              <div className={cn('mt-2 font-serif text-[26px] font-semibold', s.profit >= 0 ? 'text-pos' : 'text-neg')}>{fmtKzt(s.profit)}</div>
              <div className="mt-1 grid grid-cols-3 gap-2 text-[12px] text-muted">
                <div>
                  Выручка
                  <div className="text-ink">{fmtKzt(s.revenue)}</div>
                </div>
                <div>
                  ROI
                  <div className="text-ink">{fmtPct(s.roi)}</div>
                </div>
                <div>
                  Маржа
                  <div className="text-ink">{fmtPct(s.margin)}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <Card>
          <CardTitle>По каналам</CardTitle>
          {channels.length ? (
            <>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channels} margin={{ left: -10, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="#e6e1d6" />
                    <XAxis dataKey="channel" tick={axis} axisLine={false} tickLine={false} />
                    <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={short} />
                    <Tooltip
                      formatter={(v) => [fmtKzt(Number(v)), 'Выручка']}
                      cursor={{ fill: '#efebe2' }}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e6e1d6', fontSize: 12 }}
                    />
                    <Bar dataKey="revenue" fill="#b08d57" radius={[6, 6, 0, 0]} maxBarSize={42} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="tbl mt-2">
                <thead>
                  <tr>
                    <th>Канал</th>
                    <th className="num">Продаж</th>
                    <th className="num">Шт</th>
                    <th className="num">Выручка</th>
                    <th className="num">Доля</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((c) => (
                    <tr key={c.channel}>
                      <td>{c.channel}</td>
                      <td className="num">{c.count}</td>
                      <td className="num">{c.qty}</td>
                      <td className="num">
                        <Money value={c.revenue} />
                      </td>
                      <td className="num text-muted">{fmtPct(f.revenue ? c.revenue / f.revenue : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <Empty>Оплаченных продаж пока нет</Empty>
          )}
        </Card>

        <Card>
          <CardTitle>Остаток по цветам</CardTitle>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stock} margin={{ left: -24, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} stroke="#e6e1d6" />
                <XAxis dataKey="color" tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  formatter={(v, n) => [`${v} шт`, n === 'available' ? 'Остаток' : n === 'paid' ? 'Продано' : 'Бронь']}
                  cursor={{ fill: '#efebe2' }}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e6e1d6', fontSize: 12 }}
                />
                <Bar dataKey="available" stackId="a" maxBarSize={42}>
                  {stock.map((s) => (
                    <Cell key={s.color} fill={COLOR_SWATCH[s.color] ?? '#9a968e'} />
                  ))}
                </Bar>
                <Bar dataKey="reserved" stackId="a" fill="#d8c8ab" fillOpacity={0.5} maxBarSize={42} />
                <Bar dataKey="paid" stackId="a" fill="#e6e1d6" radius={[6, 6, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="tbl mt-2">
            <thead>
              <tr>
                <th>Цвет</th>
                <th className="num">Закуплено</th>
                <th className="num">Продано</th>
                <th className="num">Бронь</th>
                <th className="num">Остаток</th>
                <th className="num">Себест. шт</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.color}>
                  <td>
                    <ColorName color={s.color} />
                  </td>
                  <td className="num">{s.purchased}</td>
                  <td className="num">{s.paid}</td>
                  <td className="num">{s.reserved}</td>
                  <td className={cn('num font-semibold', s.available < 0 && 'text-neg')}>{s.available}</td>
                  <td className="num text-muted">{fmtKzt(unit[s.color]?.unit ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
