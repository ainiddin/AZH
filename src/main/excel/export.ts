import ExcelJS from 'exceljs'
import type { DataSet } from '@shared/types'
import { DELIVERY_LABEL, STATUS_LABEL } from '@shared/constants'
import {
  breakeven,
  byChannel,
  byMonth,
  costByColor,
  finance,
  purchaseBreakdown,
  scenarios,
  stockByColor
} from '@shared/calc'
import {
  EXPENSE_COLUMNS,
  FMT_KZT,
  FMT_PCT,
  PURCHASE_COLUMNS,
  ROW_TYPE,
  SALES_COLUMNS,
  SHEET,
  type ColumnDef
} from '@shared/excel/columns'
import { fmtDate } from '@shared/util'
import { colLetter, excelDate, GOLD, setupColumns, styleTotal } from './style'

type Row = Record<string, unknown>

/** Таблица с шапкой, автофильтром и строкой «Итого» на SUBTOTAL (учитывает фильтр). */
function table(ws: ExcelJS.Worksheet, defs: ColumnDef[], rows: Row[], totals: string[], perRow?: (r: number) => Row) {
  setupColumns(ws, defs)
  rows.forEach((row, i) => ws.addRow({ ...row, ...(perRow?.(i + 2) ?? {}) }))
  const last = rows.length + 1
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(last, 1), column: defs.length } }
  const label = defs.find((d) => d.kind !== 'id')!.key
  const total: Row = { [label]: 'Итого' }
  for (const key of totals) {
    const L = colLetter(defs, key)
    total[key] = rows.length ? { formula: `SUBTOTAL(109,${L}2:${L}${last})` } : 0
  }
  const tr = ws.addRow(total)
  styleTotal(tr, defs.length)
  // в «Итого» колонка даты — текст
  tr.getCell(defs.findIndex((d) => d.key === label) + 1).numFmt = '@'
  return { first: 2, last, totalRow: tr.number }
}

function salesSheet(wb: ExcelJS.Workbook, data: DataSet) {
  const ws = wb.addWorksheet(SHEET.sales)
  const D = colLetter(SALES_COLUMNS, 'qty')
  const E = colLetter(SALES_COLUMNS, 'price')
  const sales = [...data.sales].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  table(
    ws,
    SALES_COLUMNS,
    sales.map((s) => ({
      ...s,
      date: excelDate(s.date),
      status: STATUS_LABEL[s.status],
      delivery: DELIVERY_LABEL[s.delivery]
    })),
    ['qty', 'sum', 'deliveryCost'],
    (r) => ({ sum: { formula: `${D}${r}*${E}${r}`, result: sales[r - 2].qty * sales[r - 2].price } })
  )
}

function purchasesSheet(wb: ExcelJS.Workbook, data: DataSet) {
  const ws = wb.addWorksheet(SHEET.purchases)
  const rows: Row[] = []
  for (const p of data.purchases) {
    const { unitKzt } = purchaseBreakdown(p)
    const base = { id: p.id, date: excelDate(p.date), title: p.title }
    p.items.forEach((i, k) =>
      rows.push({ ...base, type: ROW_TYPE.item, color: i.color, qty: i.qty, unitCny: i.unitCny, unitCost: unitKzt[k] })
    )
    p.costs.forEach((c) => rows.push({ ...base, type: ROW_TYPE.cost, label: c.label, kzt: c.kzt }))
  }
  table(ws, PURCHASE_COLUMNS, rows, ['qty', 'kzt'])
}

function expensesSheet(wb: ExcelJS.Workbook, data: DataSet) {
  const ws = wb.addWorksheet(SHEET.expenses)
  const rows = [...data.expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ ...e, date: excelDate(e.date) }))
  table(ws, EXPENSE_COLUMNS, rows, ['amount'])
}

function stockSheet(wb: ExcelJS.Workbook, data: DataSet) {
  const ws = wb.addWorksheet(SHEET.stock)
  const defs: ColumnDef[] = [
    { key: 'color', header: 'Цвет', kind: 'text', width: 18 },
    { key: 'purchased', header: 'Закуплено', kind: 'int', width: 11 },
    { key: 'paid', header: 'Оплачено', kind: 'int', width: 11 },
    { key: 'reserved', header: 'Бронь', kind: 'int', width: 9 },
    { key: 'available', header: 'Остаток', kind: 'int', width: 10 },
    { key: 'unit', header: 'Себестоимость шт, ₸', kind: 'money', width: 18 },
    { key: 'value', header: 'Стоимость остатка, ₸', kind: 'money', width: 19 }
  ]
  const unit = costByColor(data.purchases)
  const stock = stockByColor(data)
  table(
    ws,
    defs,
    stock.map((s) => ({ ...s, unit: unit[s.color]?.unit ?? 0 })),
    ['purchased', 'paid', 'reserved', 'available', 'value'],
    (r) => ({
      value: { formula: `E${r}*F${r}`, result: stock[r - 2].available * (unit[stock[r - 2].color]?.unit ?? 0) }
    })
  )
}

function channelsSheet(wb: ExcelJS.Workbook, data: DataSet) {
  const ws = wb.addWorksheet(SHEET.channels)
  const defs: ColumnDef[] = [
    { key: 'channel', header: 'Канал', kind: 'text', width: 16 },
    { key: 'count', header: 'Продаж', kind: 'int', width: 10 },
    { key: 'qty', header: 'Штук', kind: 'int', width: 9 },
    { key: 'revenue', header: 'Выручка, ₸', kind: 'money', width: 15 },
    { key: 'share', header: 'Доля выручки', kind: 'text', width: 14 }
  ]
  const rows = byChannel(data)
  const { totalRow } = table(ws, defs, rows.map((c) => ({ ...c })), ['count', 'qty', 'revenue'], (r) => ({
    share: { formula: `IF($D$${rows.length + 2}=0,0,D${r}/$D$${rows.length + 2})` }
  }))
  ws.getColumn(5).numFmt = FMT_PCT
  ws.getRow(totalRow).getCell(5).value = rows.length ? 1 : 0
  ws.getRow(totalRow).getCell(5).numFmt = FMT_PCT
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

function monthsSheet(wb: ExcelJS.Workbook, data: DataSet) {
  const ws = wb.addWorksheet(SHEET.months)
  const defs: ColumnDef[] = [
    { key: 'month', header: 'Месяц', kind: 'text', width: 16 },
    { key: 'qty', header: 'Продано шт', kind: 'int', width: 11 },
    { key: 'revenue', header: 'Выручка, ₸', kind: 'money', width: 15 },
    { key: 'cogs', header: 'Себестоимость, ₸', kind: 'money', width: 16 },
    { key: 'expenses', header: 'Расходы и доставка, ₸', kind: 'money', width: 19 },
    { key: 'profit', header: 'Прибыль, ₸', kind: 'money', width: 15 },
    { key: 'margin', header: 'Маржа', kind: 'text', width: 10 }
  ]
  const rows = byMonth(data)
  const { totalRow } = table(
    ws,
    defs,
    rows.map((m) => {
      const [y, mo] = m.month.split('-').map(Number)
      return { ...m, month: `${MONTHS[mo - 1]} ${y}` }
    }),
    ['qty', 'revenue', 'cogs', 'expenses', 'profit'],
    (r) => ({
      profit: { formula: `C${r}-D${r}-E${r}`, result: rows[r - 2].profit },
      margin: { formula: `IF(C${r}=0,0,F${r}/C${r})` }
    })
  )
  ws.getColumn(7).numFmt = FMT_PCT
  const t = ws.getRow(totalRow)
  t.getCell(7).value = { formula: `IF(C${totalRow}=0,0,F${totalRow}/C${totalRow})` }
  t.getCell(7).numFmt = FMT_PCT
}

function summarySheet(wb: ExcelJS.Workbook, data: DataSet, author: string) {
  const ws = wb.addWorksheet(SHEET.summary)
  const f = finance(data)
  ws.columns = [
    { key: 'a', width: 38 },
    { key: 'b', width: 18 },
    { key: 'c', width: 18 },
    { key: 'd', width: 18 },
    { key: 'e', width: 12 },
    { key: 'f', width: 12 }
  ]
  const title = ws.addRow([`AZH · Jacquemus — отчёт на ${fmtDate(new Date().toISOString())}`])
  title.font = { bold: true, size: 16, color: { argb: 'FF141414' } }
  ws.addRow([`Сформировал: ${author}`]).font = { italic: true, color: { argb: 'FF7A766E' } }
  ws.addRow([])

  const head = ws.addRow(['Показатель', 'Значение'])
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF141414' } }
    c.border = { bottom: { style: 'medium', color: { argb: GOLD } } }
  })
  ws.views = [{ state: 'frozen', ySplit: head.number }]

  const be20 = breakeven(data, data.config.targetPrice)
  const be17 = breakeven(data, data.config.minPrice)
  const kpis: [string, number, string][] = [
    ['Выручка (оплачено)', f.revenue, FMT_KZT],
    ['Продано, шт', f.paidQty, '0'],
    ['Средняя цена', f.avgPrice, FMT_KZT],
    ['Себестоимость проданного', f.cogs, FMT_KZT],
    ['Операционные расходы', f.opex, FMT_KZT],
    ['Доставка за наш счёт', f.ourDelivery, FMT_KZT],
    ['Чистая прибыль', f.netProfit, FMT_KZT],
    ['Закупки (все партии)', f.purchaseCost, FMT_KZT],
    ['Вложено всего', f.invested, FMT_KZT],
    ['Деньги на руках (выручка − вложения)', f.cashOnHand, FMT_KZT],
    ['Окупаемость', f.payback, FMT_PCT],
    ['В брони, шт', f.reservedQty, '0'],
    ['В брони, сумма', f.reservedRevenue, FMT_KZT],
    ['Свободный остаток, шт', f.freeQty, '0'],
    [`Безубыточность при ${data.config.targetPrice.toLocaleString('ru-RU')} ₸: ещё продать, шт`, be20.remainingUnits, '0'],
    [`Безубыточность при ${data.config.minPrice.toLocaleString('ru-RU')} ₸: ещё продать, шт`, be17.remainingUnits, '0']
  ]
  for (const [label, value, fmt] of kpis) {
    const r = ws.addRow([label, Number.isFinite(value) ? value : null])
    r.getCell(2).numFmt = fmt
    r.getCell(1).border = { bottom: { style: 'hair', color: { argb: 'FFE6E1D6' } } }
    r.getCell(2).border = { bottom: { style: 'hair', color: { argb: 'FFE6E1D6' } } }
  }

  ws.addRow([])
  const sh = ws.addRow(['Сценарий: остаток продан…', 'Цена', 'Выручка', 'Прибыль', 'ROI', 'Маржа'])
  sh.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF141414' } }
  })
  for (const s of scenarios(data)) {
    const r = ws.addRow([s.label, s.price, s.revenue, s.profit, s.roi, s.margin])
    ;[2, 3, 4].forEach((i) => (r.getCell(i).numFmt = FMT_KZT))
    ;[5, 6].forEach((i) => (r.getCell(i).numFmt = FMT_PCT))
  }
}

export async function buildReport(data: DataSet, author: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = `AZH · ${author}`
  wb.created = new Date()
  summarySheet(wb, data, author)
  salesSheet(wb, data)
  stockSheet(wb, data)
  purchasesSheet(wb, data)
  expensesSheet(wb, data)
  channelsSheet(wb, data)
  monthsSheet(wb, data)
  return wb
}

export async function exportReport(path: string, data: DataSet, author: string): Promise<void> {
  const wb = await buildReport(data, author)
  await wb.xlsx.writeFile(path)
}
