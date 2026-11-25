import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { exportReport } from '../src/main/excel/export'
import { writeTemplate } from '../src/main/excel/template'
import { readWorkbook } from '../src/main/excel/read'
import { applyImport, buildImportPlan, summarizePlan } from '@shared/excel/importPlan'
import { seedData } from '@shared/seed'
import type { DataSet } from '@shared/types'

const dir = mkdtempSync(join(tmpdir(), 'azh-test-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

let n = 0
const ctx = { by: 'Тест', nowIso: '2026-11-24T10:00:00.000Z', newId: (p: string) => `${p}-rt${++n}` }

function sample(): DataSet {
  const d = seedData()
  d.sales.push(
    { id: 's-1', date: '2026-11-10', color: 'Чёрный', qty: 2, price: 20000, channel: 'Instagram', status: 'paid', buyer: 'Аружан', delivery: 'us', deliveryCost: 1500, note: 'подарок', by: 'Айниддин', createdAt: '2026-11-10T09:00:00.000Z' },
    { id: 's-2', date: '2026-11-12', color: 'Бежевый', qty: 1, price: 18000, channel: 'Kaspi', status: 'reserved', buyer: '', delivery: 'buyer', deliveryCost: 0, note: '', by: 'Айниддин', createdAt: '2026-11-12T09:00:00.000Z' }
  )
  d.expenses.push({ id: 'e-1', date: '2026-11-11', category: 'Реклама', amount: 5000, note: 'таргет', by: 'Айниддин' })
  return d
}

describe('Excel: экспорт → импорт', () => {
  it('отчёт содержит все листы, форматы, скрытый ID и формулы итогов', async () => {
    const path = join(dir, 'report.xlsx')
    await exportReport(path, sample(), 'Тест')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(path)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Сводка', 'Продажи', 'Склад', 'Закупки', 'Расходы', 'Каналы', 'По месяцам'])
    const sales = wb.getWorksheet('Продажи')!
    expect(sales.getColumn(1).hidden).toBe(true)
    expect(sales.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(sales.autoFilter).toBeTruthy()
    expect(sales.getCell('E2').numFmt).toBe('#,##0 "₸"')
    expect(sales.getCell('F2').value).toMatchObject({ formula: 'D2*E2' })
    expect(sales.getCell('F4').value).toMatchObject({ formula: 'SUBTOTAL(109,F2:F3)' })
    expect(wb.getWorksheet('По месяцам')!.getCell('G2').numFmt).toBe('0.0%')
  })

  it('выгрузка, импортированная обратно без правок, не создаёт дублей', async () => {
    const data = sample()
    const path = join(dir, 'report2.xlsx')
    await exportReport(path, data, 'Тест')
    const plan = buildImportPlan(await readWorkbook(path), data, ctx)
    expect(plan.fileErrors).toEqual([])
    expect(plan.rows.every((r) => r.errors.length === 0)).toBe(true)
    expect(plan.rows.map((r) => r.action)).toEqual(['same', 'same', 'same', 'same'])
    const s = summarizePlan(plan.rows)
    expect(s.sales).toEqual({ create: 0, update: 0 })
    expect(applyImport(data, plan.rows)).toEqual(data)
  })

  it('правка в Excel обновляет запись по ID', async () => {
    const data = sample()
    const path = join(dir, 'report3.xlsx')
    await exportReport(path, data, 'Тест')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(path)
    wb.getWorksheet('Продажи')!.getCell('E2').value = 21000
    wb.getWorksheet('Продажи')!.getCell('H3').value = 'Оплачено'
    await wb.xlsx.writeFile(path)
    const plan = buildImportPlan(await readWorkbook(path), data, ctx)
    const sales = plan.rows.filter((r) => r.kind === 'sale')
    expect(sales.map((r) => r.action)).toEqual(['update', 'update'])
    const next = applyImport(data, plan.rows)
    expect(next.sales.find((s) => s.id === 's-1')!.price).toBe(21000)
    expect(next.sales.find((s) => s.id === 's-2')!.status).toBe('paid')
    expect(next.sales).toHaveLength(2)
  })
})

describe('Excel: шаблон', () => {
  it('листы, выпадающие списки, пример пропускается при импорте', async () => {
    const path = join(dir, 'template.xlsx')
    await writeTemplate(path, ['Тёмно-синий', 'Бежевый', 'Чёрный', 'Коричневый'])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(path)
    const sales = wb.getWorksheet('Продажи')!
    expect(sales.getRow(1).values).toContain('Цвет')
    expect(sales.getCell('C5').dataValidation).toMatchObject({ type: 'list' })
    expect(sales.getCell('G5').dataValidation?.formulae?.[0]).toContain('Списки')
    expect(sales.views[0]).toMatchObject({ state: 'frozen' })

    // пользователь заполнил строку под примером
    sales.getRow(3).values = [null, new Date(Date.UTC(2026, 10, 20)), 'Коричневый', 1, '19 500', null, 'TikTok', 'Оплачено', 'Мадина', 'Покупатель']
    await wb.xlsx.writeFile(path)
    const plan = buildImportPlan(await readWorkbook(path), seedData(), ctx)
    expect(plan.fileErrors).toEqual([])
    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0].record).toMatchObject({ date: '2026-11-20', color: 'Коричневый', price: 19500, channel: 'TikTok', buyer: 'Мадина' })
  })

  it('CSV с точкой с запятой', async () => {
    const { writeFileSync } = await import('fs')
    const path = join(dir, 'exp.csv')
    writeFileSync(path, '﻿Дата;Категория;Сумма, ₸;Комментарий\n01.12.2026;Упаковка;"1 200,50";коробки\n', 'utf8')
    const plan = buildImportPlan(await readWorkbook(path), seedData(), ctx)
    expect(plan.rows[0].record).toMatchObject({ date: '2026-12-01', category: 'Упаковка', amount: 1200.5, note: 'коробки' })
  })
})
