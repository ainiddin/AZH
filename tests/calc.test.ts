import { describe, expect, it } from 'vitest'
import { seedData } from '@shared/seed'
import {
  availableFor,
  breakeven,
  byChannel,
  byMonth,
  costByColor,
  finance,
  purchaseBreakdown,
  saleWarnings,
  scenarios,
  stockByColor
} from '@shared/calc'
import type { DataSet, Sale } from '@shared/types'

function sale(p: Partial<Sale>): Sale {
  return {
    id: Math.random().toString(36).slice(2),
    date: '2026-11-10',
    color: 'Чёрный',
    qty: 1,
    price: 20000,
    channel: 'Instagram',
    status: 'paid',
    buyer: '',
    delivery: 'buyer',
    deliveryCost: 0,
    note: '',
    by: 'Тест',
    createdAt: '2026-11-10T10:00:00Z',
    ...p
  }
}

function withSales(...sales: Sale[]): DataSet {
  return { ...seedData(), sales }
}

describe('себестоимость', () => {
  it('Партия №1: 89 348,08 ₸ итого, 8 934,81 ₸/шт', () => {
    const b = purchaseBreakdown(seedData().purchases[0])
    expect(b.totalKzt).toBeCloseTo(89348.08, 2)
    expect(b.totalQty).toBe(10)
    expect(b.totalCny).toBe(1000)
    for (const u of b.unitKzt) expect(Math.round(u * 100) / 100).toBe(8934.81)
  })

  it('распределяет затраты пропорционально цене в ¥', () => {
    const b = purchaseBreakdown({
      id: 'x',
      date: '2026-01-01',
      title: 't',
      items: [
        { color: 'A', qty: 1, unitCny: 300 },
        { color: 'B', qty: 1, unitCny: 100 }
      ],
      costs: [{ label: 'всё', kzt: 40000 }]
    })
    expect(b.unitKzt).toEqual([30000, 10000])
  })

  it('средняя по цвету через несколько партий', () => {
    const d = seedData()
    d.purchases.push({
      id: 'p2',
      date: '2026-12-01',
      title: 'Партия №2',
      items: [{ color: 'Чёрный', qty: 1, unitCny: 100 }],
      costs: [{ label: 'всё', kzt: 12000 }]
    })
    const c = costByColor(d.purchases)['Чёрный']
    expect(c.qty).toBe(4)
    expect(c.unit).toBeCloseTo((8934.808 * 3 + 12000) / 4, 2)
  })
})

describe('склад', () => {
  it('остаток = закуплено − оплачено − бронь', () => {
    const d = withSales(sale({ qty: 1 }), sale({ qty: 1, status: 'reserved' }))
    const black = stockByColor(d).find((r) => r.color === 'Чёрный')!
    expect(black).toMatchObject({ purchased: 3, paid: 1, reserved: 1, available: 1 })
  })

  it('при редактировании не учитывает саму продажу', () => {
    const s = sale({ qty: 3 })
    const d = withSales(s)
    expect(availableFor(d, 'Чёрный')).toBe(0)
    expect(availableFor(d, 'Чёрный', s.id)).toBe(3)
  })
})

describe('финансы', () => {
  it('выручка, прибыль, деньги на руках, окупаемость', () => {
    const d = withSales(
      sale({ qty: 2, price: 20000, delivery: 'us', deliveryCost: 1500 }),
      sale({ color: 'Бежевый', qty: 1, price: 18000, status: 'reserved' })
    )
    d.expenses.push({ id: 'e1', date: '2026-11-11', category: 'Реклама', amount: 5000, note: '', by: 'Т' })
    const f = finance(d)
    expect(f.revenue).toBe(40000)
    expect(f.paidQty).toBe(2)
    expect(f.cogs).toBeCloseTo(2 * 8934.808, 2)
    expect(f.opex).toBe(5000)
    expect(f.ourDelivery).toBe(1500)
    expect(f.netProfit).toBeCloseTo(40000 - 17869.616 - 5000 - 1500, 2)
    expect(f.invested).toBeCloseTo(89348.08 + 6500, 2)
    expect(f.cashOnHand).toBeCloseTo(40000 - 95848.08, 2)
    expect(f.payback).toBeCloseTo(40000 / 95848.08, 5)
    expect(f.reservedRevenue).toBe(18000)
    expect(f.freeQty).toBe(7)
  })

  it('точка безубыточности', () => {
    const d = seedData()
    expect(breakeven(d, 20000)).toMatchObject({ totalUnits: 5, remainingUnits: 5, reachable: true })
    expect(breakeven(d, 17000).totalUnits).toBe(6)
    const sold = withSales(sale({ qty: 3, price: 20000 }))
    expect(breakeven(sold, 20000).remainingUnits).toBe(2)
  })

  it('сценарии продажи остатка', () => {
    const d = withSales(sale({ qty: 2, price: 22000 }))
    const [target, avg, min] = scenarios(d)
    expect(target.revenue).toBe(44000 + 8 * 20000)
    expect(avg.price).toBe(22000)
    expect(min.revenue).toBe(44000 + 8 * 17000)
    expect(target.profit).toBeCloseTo(204000 - 89348.08, 2)
    expect(target.roi).toBeCloseTo(target.profit / 89348.08, 5)
    expect(target.margin).toBeCloseTo(target.profit / 204000, 5)
  })

  it('по каналам и месяцам', () => {
    const d = withSales(
      sale({ channel: 'Instagram', price: 20000 }),
      sale({ channel: 'Kaspi', price: 21000, date: '2026-12-02' }),
      sale({ channel: 'Kaspi', price: 21000, status: 'reserved' })
    )
    expect(byChannel(d).map((r) => [r.channel, r.revenue])).toEqual([
      ['Kaspi', 21000],
      ['Instagram', 20000]
    ])
    expect(byMonth(d).map((r) => r.month)).toEqual(['2026-11', '2026-12'])
  })
})

describe('предупреждения', () => {
  it('цена ниже минимальной и продажа больше остатка', () => {
    const d = seedData()
    expect(saleWarnings(d, { id: 'n', color: 'Чёрный', qty: 1, price: 20000 })).toEqual([])
    const w = saleWarnings(d, { id: 'n', color: 'Чёрный', qty: 4, price: 16000 })
    expect(w).toHaveLength(2)
    expect(w[0]).toContain('ниже минимальной')
    expect(w[1]).toContain('в наличии 3')
  })
})
