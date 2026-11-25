import type { ColumnDef } from './columns'

/** Значение ячейки после чтения файла (даты main-процесс уже превратил в 'ГГГГ-ММ-ДД'). */
export type Cell = string | number | boolean | null

export type Parsed<T> = { ok: true; value: T | null } | { ok: false; error: string }

const ok = <T>(value: T | null): Parsed<T> => ({ ok: true, value })
const fail = <T>(error: string): Parsed<T> => ({ ok: false, error })

/** «Цена, ₸» → «цена»; регистр, пробелы, ё и знаки препинания игнорируются. */
export function normHeader(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function isBlank(v: Cell | undefined): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

export function cellText(v: Cell | undefined): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

const pad = (n: number) => String(n).padStart(2, '0')

function isoFromParts(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/** Серийный номер даты Excel (1 = 01.01.1900, система 1900) → ISO. */
export function excelSerialToIso(serial: number): string {
  const ms = Math.round((Math.floor(serial) - 25569) * 86400000)
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function isoToExcelSerial(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000 + 25569
}

/** Даты: серийный номер Excel, «ДД.ММ.ГГГГ», «ДД.ММ.ГГ», «ГГГГ-ММ-ДД». */
export function parseDate(v: Cell | undefined): Parsed<string> {
  if (isBlank(v)) return ok(null)
  if (typeof v === 'number') {
    if (v < 1 || v > 2958465) return fail('Неверная дата')
    return ok(excelSerialToIso(v))
  }
  const s = cellText(v)
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:\s.*)?$/)
  if (m) {
    const iso = isoFromParts(+m[3], +m[2], +m[1])
    return iso ? ok(iso) : fail(`Неверная дата «${s}»`)
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/)
  if (m) {
    const iso = isoFromParts(+m[1], +m[2], +m[3])
    return iso ? ok(iso) : fail(`Неверная дата «${s}»`)
  }
  if (/^\d{4,5}(\.\d+)?$/.test(s)) return ok(excelSerialToIso(Number(s)))
  return fail(`Неверная дата «${s}», нужен формат ДД.ММ.ГГГГ`)
}

/** Числа: «73 975,08», «73975.08», «1 500 ₸», «100 ¥», «1,234.5». */
export function parseNumber(v: Cell | undefined): Parsed<number> {
  if (isBlank(v)) return ok(null)
  if (typeof v === 'number') return Number.isFinite(v) ? ok(v) : fail('Нужно число')
  if (typeof v === 'boolean') return fail('Нужно число')
  let s = String(v)
    .trim()
    .replace(/[\s  ]/g, '')
    .replace(/[₸¥$€]|тг|тенге|юан[а-я]*|cny|kzt/gi, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    // десятичный разделитель — тот, что правее
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    s = s.replace(',', '.')
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return fail(`Не число: «${String(v).trim()}»`)
  return ok(Number(s))
}

/** Сопоставление «как ввели» → канонические значения (без учёта регистра). */
export function matchOption<T extends string>(
  v: Cell | undefined,
  options: Record<string, T>
): Parsed<T> {
  if (isBlank(v)) return ok(null)
  const key = normHeader(v)
  for (const [label, value] of Object.entries(options)) if (normHeader(label) === key) return ok(value)
  return fail(`Неизвестное значение «${cellText(v)}»`)
}

export const STATUS_OPTIONS = {
  Оплачено: 'paid',
  Оплачен: 'paid',
  Оплата: 'paid',
  Paid: 'paid',
  Бронь: 'reserved',
  Резерв: 'reserved',
  Забронировано: 'reserved',
  Reserved: 'reserved'
} as const

export const DELIVERY_OPTIONS = {
  Покупатель: 'buyer',
  'За счёт покупателя': 'buyer',
  Buyer: 'buyer',
  Мы: 'us',
  'За наш счёт': 'us',
  Наша: 'us',
  Us: 'us'
} as const

export function listToOptions<T extends string>(list: readonly T[]): Record<string, T> {
  return Object.fromEntries(list.map((x) => [x, x])) as Record<string, T>
}

/**
 * Найти строку заголовков (среди первых 5) и сопоставить колонки по названиям.
 * Порядок колонок не важен. Возвращает key → индекс колонки.
 */
export function mapHeaders(
  rows: Cell[][],
  columns: ColumnDef[]
): { headerRow: number; map: Record<string, number>; missing: string[] } {
  let best = { headerRow: 0, map: {} as Record<string, number>, score: -1 }
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const map: Record<string, number> = {}
    const row = rows[r] ?? []
    row.forEach((cell, i) => {
      const h = normHeader(cell)
      if (!h) return
      const col = columns.find(
        (c) => normHeader(c.header) === h || (c.aliases ?? []).some((a) => normHeader(a) === h)
      )
      if (col && !(col.key in map)) map[col.key] = i
    })
    const score = Object.keys(map).length
    if (score > best.score) best = { headerRow: r, map, score }
  }
  const missing = columns.filter((c) => c.required && !(c.key in best.map)).map((c) => c.header)
  return { headerRow: best.headerRow, map: best.map, missing }
}
