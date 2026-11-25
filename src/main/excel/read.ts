import { promises as fs } from 'fs'
import { extname } from 'path'
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import type { Cell } from '@shared/excel/parse'
import type { Workbook } from '@shared/excel/importPlan'

const pad = (n: number) => String(n).padStart(2, '0')
const isoUtc = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

/** Значение ячейки ExcelJS → простое значение (дата → 'ГГГГ-ММ-ДД'). */
function normalize(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return isoUtc(v)
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('formula' in v || 'sharedFormula' in v) return normalize((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue)
    if ('text' in v) return String((v as ExcelJS.CellHyperlinkValue).text)
    if ('error' in v) return null
  }
  return String(v)
}

async function readXlsx(path: string): Promise<Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const out: Workbook = {}
  wb.eachSheet((ws) => {
    if (ws.state !== 'visible') return
    const rows: Cell[][] = []
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const vals = (row.values as ExcelJS.CellValue[]).slice(1).map(normalize)
      rows[n - 1] = vals
    })
    for (let i = 0; i < rows.length; i++) rows[i] ??= []
    out[ws.name] = rows
  })
  return out
}

/** .xls и .csv — через SheetJS. CSV читаем как текст (UTF-8, разделитель ; или ,). */
async function readWithSheetJs(path: string, isCsv: boolean): Promise<Workbook> {
  const buf = await fs.readFile(path)
  let wb: XLSX.WorkBook
  if (isCsv) {
    const text = buf.toString('utf8').replace(/^﻿/, '')
    const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
    const FS = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
    wb = XLSX.read(text, { type: 'string', raw: true, FS })
  } else {
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  }
  const out: Workbook = {}
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true })
    out[name] = rows.map((r) =>
      r.map((v): Cell => (v instanceof Date ? isoUtc(new Date(v.getTime() - v.getTimezoneOffset() * 60000)) : (v as Cell)))
    )
  }
  return out
}

export async function readWorkbook(path: string): Promise<Workbook> {
  const ext = extname(path).toLowerCase()
  if (ext === '.xlsx' || ext === '.xlsm') return readXlsx(path)
  if (ext === '.xls' || ext === '.csv') return readWithSheetJs(path, ext === '.csv')
  throw new Error(`Формат ${ext} не поддерживается — нужен .xlsx, .xls или .csv`)
}
