import type { DataSet } from '../types'
import { costByColor, totalPurchaseCost } from './unitCost'
import { stockByColor } from './stock'

export interface Finance {
  revenue: number
  paidQty: number
  avgPrice: number
  cogs: number
  opex: number
  ourDelivery: number
  grossProfit: number
  netProfit: number
  purchaseCost: number
  /** все вложения: закупки + опер. расходы + наша доставка */
  invested: number
  /** выручка − все вложения */
  cashOnHand: number
  /** выручка / вложения */
  payback: number
  reservedQty: number
  reservedRevenue: number
  purchasedQty: number
  freeQty: number
}

export function finance(data: DataSet): Finance {
  const unit = costByColor(data.purchases)
  const paid = data.sales.filter((s) => s.status === 'paid')
  const reserved = data.sales.filter((s) => s.status === 'reserved')
  const revenue = paid.reduce((s, x) => s + x.qty * x.price, 0)
  const paidQty = paid.reduce((s, x) => s + x.qty, 0)
  const cogs = paid.reduce((s, x) => s + x.qty * (unit[x.color]?.unit ?? 0), 0)
  const opex = data.expenses.reduce((s, e) => s + e.amount, 0)
  const ourDelivery = paid
    .filter((s) => s.delivery === 'us')
    .reduce((s, x) => s + x.deliveryCost, 0)
  const purchaseCost = totalPurchaseCost(data.purchases)
  const invested = purchaseCost + opex + ourDelivery
  const stock = stockByColor(data)
  return {
    revenue,
    paidQty,
    avgPrice: paidQty > 0 ? revenue / paidQty : 0,
    cogs,
    opex,
    ourDelivery,
    grossProfit: revenue - cogs,
    netProfit: revenue - cogs - opex - ourDelivery,
    purchaseCost,
    invested,
    cashOnHand: revenue - invested,
    payback: invested > 0 ? revenue / invested : 0,
    reservedQty: reserved.reduce((s, x) => s + x.qty, 0),
    reservedRevenue: reserved.reduce((s, x) => s + x.qty * x.price, 0),
    purchasedQty: stock.reduce((s, r) => s + r.purchased, 0),
    freeQty: stock.reduce((s, r) => s + Math.max(0, r.available), 0)
  }
}

export interface ChannelRow {
  channel: string
  qty: number
  revenue: number
  count: number
}

export function byChannel(data: DataSet): ChannelRow[] {
  const m = new Map<string, ChannelRow>()
  for (const s of data.sales.filter((x) => x.status === 'paid')) {
    const r = m.get(s.channel) ?? { channel: s.channel, qty: 0, revenue: 0, count: 0 }
    r.qty += s.qty
    r.revenue += s.qty * s.price
    r.count += 1
    m.set(s.channel, r)
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue)
}

export interface MonthRow {
  month: string
  qty: number
  revenue: number
  cogs: number
  expenses: number
  profit: number
}

export function byMonth(data: DataSet): MonthRow[] {
  const unit = costByColor(data.purchases)
  const m = new Map<string, MonthRow>()
  const row = (month: string) => {
    let r = m.get(month)
    if (!r) m.set(month, (r = { month, qty: 0, revenue: 0, cogs: 0, expenses: 0, profit: 0 }))
    return r
  }
  for (const s of data.sales.filter((x) => x.status === 'paid')) {
    const r = row(s.date.slice(0, 7))
    r.qty += s.qty
    r.revenue += s.qty * s.price
    r.cogs += s.qty * (unit[s.color]?.unit ?? 0)
    if (s.delivery === 'us') r.expenses += s.deliveryCost
  }
  for (const e of data.expenses) row(e.date.slice(0, 7)).expenses += e.amount
  for (const r of m.values()) r.profit = r.revenue - r.cogs - r.expenses
  return [...m.values()].sort((a, b) => a.month.localeCompare(b.month))
}
