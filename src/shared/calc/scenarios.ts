import type { DataSet } from '../types'
import { finance } from './finance'

export interface Breakeven {
  price: number
  /** сколько штук нужно продать всего, чтобы окупить вложения */
  totalUnits: number
  /** сколько ещё осталось продать (брони считаются проданными) */
  remainingUnits: number
  /** хватает ли свободного остатка */
  reachable: boolean
}

export function breakeven(data: DataSet, price: number): Breakeven {
  const f = finance(data)
  if (price <= 0) return { price, totalUnits: Infinity, remainingUnits: Infinity, reachable: false }
  const totalUnits = Math.ceil(f.invested / price)
  const remainingUnits = Math.max(0, Math.ceil((f.invested - f.revenue - f.reservedRevenue) / price))
  return { price, totalUnits, remainingUnits, reachable: remainingUnits <= f.freeQty }
}

export interface Scenario {
  key: 'target' | 'avg' | 'min'
  label: string
  price: number
  revenue: number
  profit: number
  roi: number
  margin: number
}

/** Свободный остаток продан по цене X, брони — по своим ценам. */
export function scenarios(data: DataSet): Scenario[] {
  const f = finance(data)
  const avg = f.avgPrice > 0 ? f.avgPrice : data.config.targetPrice
  const mk = (key: Scenario['key'], label: string, price: number): Scenario => {
    const revenue = f.revenue + f.reservedRevenue + f.freeQty * price
    const profit = revenue - f.invested
    return {
      key,
      label,
      price,
      revenue,
      profit,
      roi: f.invested > 0 ? profit / f.invested : 0,
      margin: revenue > 0 ? profit / revenue : 0
    }
  }
  return [
    mk('target', 'По целевой цене', data.config.targetPrice),
    mk('avg', 'По средней цене', avg),
    mk('min', 'По минимальной цене', data.config.minPrice)
  ]
}
