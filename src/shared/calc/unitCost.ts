import type { Purchase } from '../types'

export interface PurchaseBreakdown {
  totalCny: number
  totalKzt: number
  totalQty: number
  /** Себестоимость одной штуки (₸) по каждой строке товара — в порядке items */
  unitKzt: number[]
}

/** Затраты партии распределяются по товарам пропорционально их стоимости в ¥. */
export function purchaseBreakdown(p: Purchase): PurchaseBreakdown {
  const totalCny = p.items.reduce((s, i) => s + i.qty * i.unitCny, 0)
  const totalKzt = p.costs.reduce((s, c) => s + c.kzt, 0)
  const totalQty = p.items.reduce((s, i) => s + i.qty, 0)
  const unitKzt = p.items.map((i) =>
    totalCny > 0 ? (i.unitCny / totalCny) * totalKzt : totalQty > 0 ? totalKzt / totalQty : 0
  )
  return { totalCny, totalKzt, totalQty, unitKzt }
}

export interface ColorCost {
  qty: number
  cost: number
  /** Средняя себестоимость штуки по всем партиям */
  unit: number
}

export function costByColor(purchases: Purchase[]): Record<string, ColorCost> {
  const out: Record<string, ColorCost> = {}
  for (const p of purchases) {
    const { unitKzt } = purchaseBreakdown(p)
    p.items.forEach((item, i) => {
      const c = (out[item.color] ??= { qty: 0, cost: 0, unit: 0 })
      c.qty += item.qty
      c.cost += unitKzt[i] * item.qty
    })
  }
  for (const c of Object.values(out)) c.unit = c.qty > 0 ? c.cost / c.qty : 0
  return out
}

export function totalPurchaseCost(purchases: Purchase[]): number {
  return purchases.reduce((s, p) => s + p.costs.reduce((a, c) => a + c.kzt, 0), 0)
}
