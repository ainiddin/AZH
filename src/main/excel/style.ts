import type ExcelJS from 'exceljs'
import type { ColumnDef } from '@shared/excel/columns'
import { FMT_CNY, FMT_DATE, FMT_KZT } from '@shared/excel/columns'

export const GOLD = 'FFB08D57'
export const INK = 'FF141414'
export const SOFT = 'FFEFEBE2'

export function numFmtFor(c: ColumnDef): string | undefined {
  if (c.kind === 'money') return FMT_KZT
  if (c.kind === 'cny') return FMT_CNY
  if (c.kind === 'date') return FMT_DATE
  if (c.kind === 'int') return '0'
  return undefined
}

/** Шапка: чёрный фон, белый жирный текст, золотая линия; закреплена. */
export function styleHeader(ws: ExcelJS.Worksheet, columns: number) {
  const row = ws.getRow(1)
  row.height = 22
  for (let c = 1; c <= columns; c++) {
    const cell = row.getCell(c)
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
    cell.alignment = { vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'medium', color: { argb: GOLD } } }
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

export function styleTotal(row: ExcelJS.Row, columns: number) {
  for (let c = 1; c <= columns; c++) {
    const cell = row.getCell(c)
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } }
    cell.border = { top: { style: 'thin', color: { argb: GOLD } } }
  }
}

/** Колонки листа по описанию: заголовки, ширины, форматы, скрытый ID. */
export function setupColumns(ws: ExcelJS.Worksheet, defs: ColumnDef[]) {
  ws.columns = defs.map((d) => ({ header: d.header, key: d.key, width: d.width, style: { numFmt: numFmtFor(d) } }))
  defs.forEach((d, i) => {
    if (d.kind === 'id') ws.getColumn(i + 1).hidden = true
  })
  styleHeader(ws, defs.length)
}

export function colLetter(defs: ColumnDef[], key: string): string {
  const i = defs.findIndex((d) => d.key === key)
  return columnName(i + 1)
}

export function columnName(n: number): string {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** ISO-дата → Date в UTC (ExcelJS пишет без сдвига часового пояса). */
export function excelDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
