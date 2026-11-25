import type { DataSet, Sale } from '../types'
import { fmtKzt } from '../util'
import { availableFor } from './stock'

/** Предупреждения (не блокировка) для продажи — в форме и при импорте. */
export function saleWarnings(
  data: Pick<DataSet, 'purchases' | 'sales' | 'config'>,
  sale: Pick<Sale, 'id' | 'color' | 'qty' | 'price'>
): string[] {
  const out: string[] = []
  if (sale.price < data.config.minPrice)
    out.push(`Цена ниже минимальной (${fmtKzt(data.config.minPrice)})`)
  const avail = availableFor(data, sale.color, sale.id)
  if (sale.qty > avail) out.push(`Продаётся больше, чем есть: в наличии ${Math.max(0, avail)} шт`)
  return out
}
