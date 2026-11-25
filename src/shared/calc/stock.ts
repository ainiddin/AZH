import type { DataSet } from '../types'

export interface StockRow {
  color: string
  purchased: number
  paid: number
  reserved: number
  /** закуплено − оплачено − бронь */
  available: number
}

export function colorsOf(data: Pick<DataSet, 'purchases' | 'sales'>): string[] {
  const set = new Set<string>()
  data.purchases.forEach((p) => p.items.forEach((i) => set.add(i.color)))
  data.sales.forEach((s) => set.add(s.color))
  return [...set]
}

export function stockByColor(data: Pick<DataSet, 'purchases' | 'sales'>): StockRow[] {
  const rows = new Map<string, StockRow>()
  const row = (color: string) => {
    let r = rows.get(color)
    if (!r) rows.set(color, (r = { color, purchased: 0, paid: 0, reserved: 0, available: 0 }))
    return r
  }
  data.purchases.forEach((p) => p.items.forEach((i) => (row(i.color).purchased += i.qty)))
  data.sales.forEach((s) => {
    if (s.status === 'paid') row(s.color).paid += s.qty
    else row(s.color).reserved += s.qty
  })
  for (const r of rows.values()) r.available = r.purchased - r.paid - r.reserved
  return [...rows.values()]
}

/** Сколько штук цвета можно продать, не считая продажу excludeSaleId (при редактировании). */
export function availableFor(
  data: Pick<DataSet, 'purchases' | 'sales'>,
  color: string,
  excludeSaleId?: string
): number {
  const others = { ...data, sales: data.sales.filter((s) => s.id !== excludeSaleId) }
  return stockByColor(others).find((r) => r.color === color)?.available ?? 0
}
