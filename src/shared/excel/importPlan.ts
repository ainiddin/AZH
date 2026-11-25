import { CHANNELS, EXPENSE_CATEGORIES } from '../constants'
import { ExpenseSchema, PurchaseSchema, SaleSchema } from '../schemas'
import type { DataSet, Expense, Purchase, Sale } from '../types'
import { colorsOf, saleWarnings } from '../calc'
import { plural } from '../util'
import {
  EXAMPLE_ID,
  EXPENSE_COLUMNS,
  IMPORT_SHEETS,
  PURCHASE_COLUMNS,
  ROW_TYPE,
  SALES_COLUMNS,
  SHEET,
  type ColumnDef,
  type ImportSheet
} from './columns'
import {
  cellText,
  DELIVERY_OPTIONS,
  isBlank,
  listToOptions,
  mapHeaders,
  matchOption,
  normHeader,
  parseDate,
  parseNumber,
  STATUS_OPTIONS,
  type Cell,
  type Parsed
} from './parse'

export type Workbook = Record<string, Cell[][]>

export interface RowIssue {
  /** номер строки в Excel (с 1) */
  row: number
  column?: string
  message: string
}

export type ImportKind = 'sale' | 'expense' | 'purchase'

export interface ImportRow {
  key: string
  sheet: ImportSheet
  rows: number[]
  kind: ImportKind
  /** same — запись с таким ID уже есть и не изменилась */
  action: 'create' | 'update' | 'same'
  record: Sale | Expense | Purchase | null
  label: string
  errors: RowIssue[]
  warnings: string[]
  duplicate: boolean
  include: boolean
}

export interface ImportPlan {
  rows: ImportRow[]
  /** ошибки файла целиком: нет нужных листов/колонок */
  fileErrors: string[]
  foundSheets: ImportSheet[]
}

export interface ImportContext {
  by: string
  nowIso: string
  newId: (prefix: string) => string
}

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е')

function findSheet(wb: Workbook, name: string, columns: ColumnDef[]): string | null {
  const byName = Object.keys(wb).find((n) => normHeader(n) === normHeader(name))
  if (byName) return byName
  // CSV или переименованный лист — ищем по заголовкам
  const required = columns.filter((c) => c.required).length
  for (const n of Object.keys(wb)) {
    const { map, missing } = mapHeaders(wb[n], columns)
    if (missing.length === 0 && Object.keys(map).length >= required) {
      // заголовки должны однозначно указывать на этот тип листа
      const otherFits = IMPORT_SHEETS.filter((s) => s.name !== name).some((s) => {
        const m = mapHeaders(wb[n], s.columns)
        return m.missing.length === 0 && Object.keys(m.map).length > Object.keys(map).length
      })
      if (!otherFits) return n
    }
  }
  return null
}

interface RawRow {
  row: number
  get: (key: string) => Cell
}

function readRows(rows: Cell[][], columns: ColumnDef[]): { data: RawRow[]; missing: string[] } {
  const { headerRow, map, missing } = mapHeaders(rows, columns)
  const data: RawRow[] = []
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const get = (key: string): Cell => (key in map ? (row[map[key]] ?? null) : null)
    const meaningful = columns.filter((c) => !c.computed && c.key !== 'by').some((c) => !isBlank(get(c.key)))
    if (!meaningful) continue
    if (normHeader(get('id')) === normHeader(EXAMPLE_ID)) continue
    if (normHeader(get('date')).startsWith('итого')) continue
    data.push({ row: r + 1, get })
  }
  return { data, missing }
}

/** Помощник: разобрать поле и записать ошибку с колонкой. */
function field<T>(
  raw: RawRow,
  columns: ColumnDef[],
  key: string,
  issues: RowIssue[],
  parser: (v: Cell) => Parsed<T>,
  required = false
): T | null {
  const col = columns.find((c) => c.key === key)!
  const res = parser(raw.get(key))
  if (!res.ok) {
    issues.push({ row: raw.row, column: col.header, message: res.error })
    return null
  }
  if (res.value === null && required) issues.push({ row: raw.row, column: col.header, message: 'Обязательное поле' })
  return res.value
}

const text = (v: Cell): Parsed<string> => ({ ok: true, value: isBlank(v) ? null : cellText(v) })
const int = (v: Cell): Parsed<number> => {
  const r = parseNumber(v)
  if (r.ok && r.value !== null && !Number.isInteger(r.value)) return { ok: false, error: 'Нужно целое число' }
  return r
}

/** Ошибки zod → строки с колонками. */
function zodIssues(
  error: { issues: { path: PropertyKey[]; message: string }[] },
  columns: ColumnDef[],
  row: number
): RowIssue[] {
  return error.issues.map((i) => {
    const key = String(i.path[i.path.length - 1] ?? '')
    const col = columns.find((c) => c.key === key)
    return { row, column: col?.header, message: i.message }
  })
}

function canonicalColor(colors: string[], raw: string): string {
  return colors.find((c) => norm(c) === norm(raw)) ?? raw.trim()
}

const fmtNum = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })

/**
 * Разобрать книгу Excel в план импорта: что будет создано/обновлено, ошибки, дубли, предупреждения.
 * Ничего не меняет — применяет applyImport.
 */
export function buildImportPlan(wb: Workbook, data: DataSet, ctx: ImportContext): ImportPlan {
  const plan: ImportPlan = { rows: [], fileErrors: [], foundSheets: [] }
  // «рабочая» копия: каждая принятая строка учитывается в проверке остатков следующих
  const working: DataSet = JSON.parse(JSON.stringify(data))
  const colors = () => colorsOf(working)

  const sheets: Partial<Record<ImportSheet, RawRow[]>> = {}
  for (const def of IMPORT_SHEETS) {
    const name = findSheet(wb, def.name, def.columns)
    if (!name) continue
    const { data: rows, missing } = readRows(wb[name], def.columns)
    if (missing.length) {
      plan.fileErrors.push(`Лист «${name}»: нет колонок ${missing.map((m) => `«${m}»`).join(', ')}`)
      continue
    }
    plan.foundSheets.push(def.name)
    sheets[def.name] = rows
  }
  if (!plan.foundSheets.length && !plan.fileErrors.length)
    plan.fileErrors.push('Не найдены листы «Продажи», «Закупки» или «Расходы» с нужными заголовками')

  // 1. Закупки — первыми, чтобы новые партии учитывались в остатках
  const pGroups = new Map<string, RawRow[]>()
  for (const raw of sheets[SHEET.purchases] ?? []) {
    const id = cellText(raw.get('id'))
    const key = id ? `id:${id}` : `new:${parseDate(raw.get('date')).ok ? cellText(raw.get('date')) : ''}|${norm(cellText(raw.get('title')))}`
    pGroups.set(key, [...(pGroups.get(key) ?? []), raw])
  }
  for (const [key, group] of pGroups) {
    const issues: RowIssue[] = []
    const first = group[0]
    const date = field(first, PURCHASE_COLUMNS, 'date', issues, parseDate, true)
    const title = field(first, PURCHASE_COLUMNS, 'title', issues, text, true)
    const items: Purchase['items'] = []
    const costs: Purchase['costs'] = []
    for (const raw of group) {
      const typeRes = matchOption(raw.get('type'), { [ROW_TYPE.item]: 'item', [ROW_TYPE.cost]: 'cost', Товары: 'item', Затраты: 'cost' } as Record<string, 'item' | 'cost'>)
      let type = typeRes.ok ? typeRes.value : null
      if (!typeRes.ok) issues.push({ row: raw.row, column: 'Тип строки', message: `${typeRes.error}: «Товар» или «Затрата»` })
      if (typeRes.ok && !type) type = !isBlank(raw.get('color')) ? 'item' : !isBlank(raw.get('label')) ? 'cost' : null
      if (type === 'item') {
        const color = field(raw, PURCHASE_COLUMNS, 'color', issues, text, true)
        const qty = field(raw, PURCHASE_COLUMNS, 'qty', issues, int, true)
        const unitCny = field(raw, PURCHASE_COLUMNS, 'unitCny', issues, parseNumber, true)
        if (color !== null && qty !== null && unitCny !== null)
          items.push({ color: canonicalColor(colors(), color), qty, unitCny })
      } else if (type === 'cost') {
        const label = field(raw, PURCHASE_COLUMNS, 'label', issues, text, true)
        const kzt = field(raw, PURCHASE_COLUMNS, 'kzt', issues, parseNumber, true)
        if (label !== null && kzt !== null) costs.push({ label, kzt })
      } else if (typeRes.ok) {
        issues.push({ row: raw.row, column: 'Тип строки', message: 'Укажите «Товар» или «Затрата»' })
      }
    }
    const id = key.startsWith('id:') ? key.slice(3) : null
    const existing = id ? working.purchases.find((p) => p.id === id) : undefined
    const record: Purchase = { id: id ?? ctx.newId('p'), date: date ?? '', title: title ?? '', items, costs }
    if (!issues.length) {
      const v = PurchaseSchema.safeParse(record)
      if (!v.success) issues.push(...zodIssues(v.error, PURCHASE_COLUMNS, first.row))
    }
    const warnings: string[] = []
    if (id && !existing) warnings.push('ID не найден — будет создана новая партия')
    const duplicate =
      !existing && !!working.purchases.find((p) => p.date === record.date && norm(p.title) === norm(record.title))
    const action = existing ? (JSON.stringify(existing) === JSON.stringify(record) ? 'same' : 'update') : 'create'
    const row = pushRow(plan, {
      sheet: SHEET.purchases,
      kind: 'purchase',
      rows: group.map((g) => g.row),
      action,
      record: issues.length ? null : record,
      label: `${record.title || 'Партия'}: ${items.reduce((s, i) => s + i.qty, 0)} шт, ${costs.length} ${plural(costs.length, 'затрата', 'затраты', 'затрат')}`,
      errors: issues,
      warnings,
      duplicate
    })
    if (row.include) upsert(working.purchases, record)
  }

  // 2. Продажи
  const statusOpts = STATUS_OPTIONS as Record<string, Sale['status']>
  const deliveryOpts = DELIVERY_OPTIONS as Record<string, Sale['delivery']>
  const channelOpts = { ...listToOptions(CHANNELS), Инстаграм: 'Instagram', Тикток: 'TikTok', Ватсап: 'WhatsApp', Телеграм: 'Telegram', Каспи: 'Kaspi' } as Record<string, Sale['channel']>
  for (const raw of sheets[SHEET.sales] ?? []) {
    const issues: RowIssue[] = []
    const C = SALES_COLUMNS
    const id = cellText(raw.get('id')) || null
    const existing = id ? working.sales.find((s) => s.id === id) : undefined
    const colorRaw = field(raw, C, 'color', issues, text, true)
    const sale: Sale = {
      id: id ?? ctx.newId('s'),
      date: field(raw, C, 'date', issues, parseDate, true) ?? '',
      color: colorRaw ? canonicalColor(colors(), colorRaw) : '',
      qty: field(raw, C, 'qty', issues, int, true) ?? 0,
      price: field(raw, C, 'price', issues, parseNumber, true) ?? 0,
      channel: field(raw, C, 'channel', issues, (v) => matchOption(v, channelOpts), true) ?? 'Другое',
      status: field(raw, C, 'status', issues, (v) => matchOption(v, statusOpts), true) ?? 'paid',
      buyer: field(raw, C, 'buyer', issues, text) ?? '',
      delivery: field(raw, C, 'delivery', issues, (v) => matchOption(v, deliveryOpts)) ?? 'buyer',
      deliveryCost: field(raw, C, 'deliveryCost', issues, parseNumber) ?? 0,
      note: field(raw, C, 'note', issues, text) ?? '',
      by: field(raw, C, 'by', issues, text) ?? existing?.by ?? ctx.by,
      createdAt: existing?.createdAt ?? ctx.nowIso
    }
    if (!issues.length) {
      const v = SaleSchema.safeParse(sale)
      if (!v.success) issues.push(...zodIssues(v.error, C, raw.row))
    }
    const warnings: string[] = []
    if (!issues.length) {
      warnings.push(...saleWarnings(working, sale))
      if (!colors().includes(sale.color)) warnings.push(`Цвет «${sale.color}» не встречается в закупках`)
    }
    if (id && !existing) warnings.push('ID не найден — будет создана новая продажа')
    const duplicate =
      !existing &&
      !!working.sales.find(
        (s) => s.date === sale.date && s.color === sale.color && s.price === sale.price && norm(s.buyer) === norm(sale.buyer)
      )
    const row = pushRow(plan, {
      sheet: SHEET.sales,
      kind: 'sale',
      rows: [raw.row],
      action: existing ? (sameExcept(existing, sale, []) ? 'same' : 'update') : 'create',
      record: issues.length ? null : sale,
      label: `${sale.date ? sale.date.split('-').reverse().join('.') : '—'} · ${sale.color || '—'} × ${sale.qty} · ${fmtNum(sale.price)} ₸${sale.buyer ? ' · ' + sale.buyer : ''}`,
      errors: issues,
      warnings,
      duplicate
    })
    if (row.include) upsert(working.sales, sale)
  }

  // 3. Расходы
  const catOpts = listToOptions(EXPENSE_CATEGORIES) as Record<string, Expense['category']>
  for (const raw of sheets[SHEET.expenses] ?? []) {
    const issues: RowIssue[] = []
    const C = EXPENSE_COLUMNS
    const id = cellText(raw.get('id')) || null
    const existing = id ? working.expenses.find((e) => e.id === id) : undefined
    const exp: Expense = {
      id: id ?? ctx.newId('e'),
      date: field(raw, C, 'date', issues, parseDate, true) ?? '',
      category: field(raw, C, 'category', issues, (v) => matchOption(v, catOpts), true) ?? 'Прочее',
      amount: field(raw, C, 'amount', issues, parseNumber, true) ?? 0,
      note: field(raw, C, 'note', issues, text) ?? '',
      by: field(raw, C, 'by', issues, text) ?? existing?.by ?? ctx.by
    }
    if (!issues.length) {
      const v = ExpenseSchema.safeParse(exp)
      if (!v.success) issues.push(...zodIssues(v.error, C, raw.row))
    }
    const warnings: string[] = []
    if (id && !existing) warnings.push('ID не найден — будет создан новый расход')
    const duplicate =
      !existing &&
      !!working.expenses.find((e) => e.date === exp.date && e.category === exp.category && e.amount === exp.amount)
    const row = pushRow(plan, {
      sheet: SHEET.expenses,
      kind: 'expense',
      rows: [raw.row],
      action: existing ? (sameExcept(existing, exp, []) ? 'same' : 'update') : 'create',
      record: issues.length ? null : exp,
      label: `${exp.date ? exp.date.split('-').reverse().join('.') : '—'} · ${exp.category} · ${fmtNum(exp.amount)} ₸${exp.note ? ' · ' + exp.note : ''}`,
      errors: issues,
      warnings,
      duplicate
    })
    if (row.include) upsert(working.expenses, exp)
  }

  return plan
}

function sameExcept<T extends object>(a: T, b: T, skip: string[]): boolean {
  const strip = (x: T) => JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k]) => !skip.includes(k))))
  return strip(a) === strip(b)
}

function pushRow(plan: ImportPlan, r: Omit<ImportRow, 'key' | 'include'>): ImportRow {
  const row: ImportRow = {
    ...r,
    key: `${r.sheet}:${r.rows[0]}`,
    include: !r.errors.length && !r.duplicate && r.action !== 'same'
  }
  plan.rows.push(row)
  return row
}

function upsert<T extends { id: string }>(list: T[], rec: T) {
  const i = list.findIndex((x) => x.id === rec.id)
  if (i >= 0) list[i] = rec
  else list.push(rec)
}

/** Применить выбранные строки плана к данным (новая копия). */
export function applyImport(data: DataSet, rows: ImportRow[]): DataSet {
  const next: DataSet = JSON.parse(JSON.stringify(data))
  for (const r of rows) {
    if (!r.include || !r.record || r.errors.length) continue
    if (r.kind === 'sale') upsert(next.sales, r.record as Sale)
    else if (r.kind === 'expense') upsert(next.expenses, r.record as Expense)
    else upsert(next.purchases, r.record as Purchase)
  }
  return next
}

export interface PlanSummary {
  sales: { create: number; update: number }
  expenses: { create: number; update: number }
  purchases: { create: number; update: number }
  errors: number
  duplicates: number
  same: number
}

export function summarizePlan(rows: ImportRow[]): PlanSummary {
  const s: PlanSummary = {
    sales: { create: 0, update: 0 },
    expenses: { create: 0, update: 0 },
    purchases: { create: 0, update: 0 },
    errors: 0,
    duplicates: 0,
    same: 0
  }
  for (const r of rows) {
    if (r.errors.length) s.errors++
    if (r.duplicate) s.duplicates++
    if (r.action === 'same') s.same++
    if (!r.include || r.action === 'same') continue
    const bucket = r.kind === 'sale' ? s.sales : r.kind === 'expense' ? s.expenses : s.purchases
    if (r.action === 'create') bucket.create++
    else bucket.update++
  }
  return s
}

/** «будет добавлено 3 продажи, 1 расход; обновлено 2 продажи» */
export function describeSummary(s: PlanSummary): string {
  const w = {
    sales: ['продажа', 'продажи', 'продаж'],
    expenses: ['расход', 'расхода', 'расходов'],
    purchases: ['партия', 'партии', 'партий']
  } as const
  const part = (kind: 'create' | 'update') =>
    (['sales', 'expenses', 'purchases'] as const)
      .filter((k) => s[k][kind] > 0)
      .map((k) => {
        const [one, few, many] = w[k]
        return `${s[k][kind]} ${plural(s[k][kind], one, few, many)}`
      })
      .join(', ')
  const out: string[] = []
  const c = part('create')
  const u = part('update')
  if (c) out.push(`будет добавлено ${c}`)
  if (u) out.push(`обновлено ${u}`)
  return out.join('; ') || 'нечего импортировать'
}
