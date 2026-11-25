import { describe, expect, it } from 'vitest'
import { excelSerialToIso, isoToExcelSerial, mapHeaders, normHeader, parseDate, parseNumber } from '@shared/excel/parse'
import { SALES_COLUMNS } from '@shared/excel/columns'
import { applyImport, buildImportPlan, describeSummary, summarizePlan, type Workbook } from '@shared/excel/importPlan'
import { seedData } from '@shared/seed'
import type { DataSet, Sale } from '@shared/types'

let n = 0
const ctx = { by: 'Тест', nowIso: '2026-11-24T10:00:00.000Z', newId: (p: string) => `${p}-new${++n}` }

const SALES_HEAD = ['ID', 'Дата', 'Цвет', 'Кол-во', 'Цена, ₸', 'Сумма, ₸', 'Канал', 'Статус', 'Покупатель', 'Доставка', 'Стоимость доставки, ₸', 'Комментарий', 'Кто ввёл']

function existingSale(p: Partial<Sale> = {}): Sale {
  return {
    id: 's-1',
    date: '2026-11-10',
    color: 'Чёрный',
    qty: 1,
    price: 20000,
    channel: 'Instagram',
    status: 'paid',
    buyer: 'Аружан',
    delivery: 'buyer',
    deliveryCost: 0,
    note: '',
    by: 'Айниддин',
    createdAt: '2026-11-10T09:00:00.000Z',
    ...p
  }
}

describe('парсинг дат', () => {
  it('serial Excel', () => {
    expect(excelSerialToIso(46350)).toBe('2026-11-24')
    expect(parseDate(46350)).toEqual({ ok: true, value: '2026-11-24' })
    expect(isoToExcelSerial('2026-11-24')).toBe(46350)
    expect(parseDate(46350.75)).toEqual({ ok: true, value: '2026-11-24' })
  })
  it('строки ДД.ММ.ГГГГ, ДД.ММ.ГГ, ISO', () => {
    expect(parseDate('24.11.2026')).toEqual({ ok: true, value: '2026-11-24' })
    expect(parseDate(' 5.1.26 ')).toEqual({ ok: true, value: '2026-01-05' })
    expect(parseDate('24/11/2026')).toEqual({ ok: true, value: '2026-11-24' })
    expect(parseDate('2026-11-24')).toEqual({ ok: true, value: '2026-11-24' })
    expect(parseDate('2026-11-24T00:00:00.000Z')).toEqual({ ok: true, value: '2026-11-24' })
  })
  it('ошибки и пустые', () => {
    expect(parseDate('31.02.2026').ok).toBe(false)
    expect(parseDate('вчера').ok).toBe(false)
    expect(parseDate('')).toEqual({ ok: true, value: null })
    expect(parseDate(null)).toEqual({ ok: true, value: null })
  })
})

describe('парсинг чисел', () => {
  it.each([
    ['73 975,08', 73975.08],
    ['73 975,08', 73975.08],
    ['73975.08', 73975.08],
    ['1 500 ₸', 1500],
    ['100 ¥', 100],
    ['1,234.50', 1234.5],
    ['1.234,50', 1234.5],
    ['20 000 тг', 20000],
    [17000, 17000]
  ])('%s → %d', (input, expected) => {
    expect(parseNumber(input)).toEqual({ ok: true, value: expected })
  })
  it('ошибки', () => {
    expect(parseNumber('двадцать').ok).toBe(false)
    expect(parseNumber('12abc').ok).toBe(false)
    expect(parseNumber('  ')).toEqual({ ok: true, value: null })
  })
})

describe('заголовки', () => {
  it('регистр, пробелы, ё и знаки не важны', () => {
    expect(normHeader('  Цена, ₸ ')).toBe(normHeader('цена'))
    expect(normHeader('Кто ВВЁЛ')).toBe(normHeader('кто ввел'))
  })
  it('порядок колонок не важен, ищет строку заголовков, алиасы', () => {
    const rows = [['Отчёт'], ['статус', ' ЦВЕТ ', 'количество', 'цена ₸', 'дата', 'канал']]
    const { headerRow, map, missing } = mapHeaders(rows, SALES_COLUMNS)
    expect(headerRow).toBe(1)
    expect(map).toMatchObject({ status: 0, color: 1, qty: 2, price: 3, date: 4, channel: 5 })
    expect(missing).toEqual([])
  })
  it('сообщает о недостающих колонках', () => {
    const plan = buildImportPlan({ Продажи: [['Дата', 'Цвет']] }, seedData(), ctx)
    expect(plan.fileErrors[0]).toContain('«Кол-во»')
  })
})

describe('план импорта', () => {
  it('создаёт продажи, переводит значения, предупреждает о цене и остатке', () => {
    const wb: Workbook = {
      Продажи: [
        SALES_HEAD,
        ['ПРИМЕР', '01.01.2026', 'Бежевый', 1, 20000, null, 'Instagram', 'Оплачено', '', '', null, '', ''],
        [null, '24.11.2026', 'чёрный', '2', '16 500', null, 'kaspi', 'бронь', 'Дана', 'Мы', '1 000', 'тест', null],
        [null, 46350, 'Чёрный', 2, 20000, null, 'Instagram', 'Оплачено', 'Ерлан', null, null, null, null],
        [null, 'Итого', null, 4, null, 52000, null, null, null, null, null, null, null]
      ]
    }
    const plan = buildImportPlan(wb, seedData(), ctx)
    expect(plan.fileErrors).toEqual([])
    expect(plan.rows).toHaveLength(2)
    const [a, b] = plan.rows
    expect(a.errors).toEqual([])
    expect(a.record).toMatchObject({
      date: '2026-11-24',
      color: 'Чёрный',
      qty: 2,
      price: 16500,
      channel: 'Kaspi',
      status: 'reserved',
      delivery: 'us',
      deliveryCost: 1000,
      by: 'Тест'
    })
    expect(a.warnings.join()).toContain('ниже минимальной')
    // вторая строка: 2 + 2 > 3 чёрных — предупреждение, но не блокировка
    expect(b.warnings.join()).toContain('в наличии 1')
    expect(b.include).toBe(true)
    expect(b.record).toMatchObject({ delivery: 'buyer', deliveryCost: 0 })
  })

  it('ошибки с листом, строкой и колонкой; такие строки не импортируются', () => {
    const wb: Workbook = {
      'продажи ': [
        SALES_HEAD,
        [null, '32.13.2026', 'Чёрный', 1.5, 'дорого', null, 'Avito', 'Оплачено', '', '', '', '', '']
      ]
    }
    const plan = buildImportPlan(wb, seedData(), ctx)
    const r = plan.rows[0]
    expect(r.sheet).toBe('Продажи')
    expect(r.include).toBe(false)
    const cols = r.errors.map((e) => e.column)
    expect(cols).toEqual(['Дата', 'Кол-во', 'Цена, ₸', 'Канал'])
    expect(r.errors.every((e) => e.row === 2)).toBe(true)
  })

  it('дубли: продажа (дата+цвет+цена+покупатель) и расход (дата+категория+сумма) не импортируются по умолчанию', () => {
    const data: DataSet = { ...seedData(), sales: [existingSale()] }
    data.expenses.push({ id: 'e-1', date: '2026-11-11', category: 'Реклама', amount: 5000, note: '', by: 'А' })
    const wb: Workbook = {
      Продажи: [SALES_HEAD, [null, '10.11.2026', 'Чёрный', 1, 20000, null, 'TikTok', 'Оплачено', ' аружан ', '', '', '', '']],
      Расходы: [
        ['Дата', 'Категория', 'Сумма, ₸', 'Комментарий'],
        ['11.11.2026', 'реклама', '5 000', 'другая заметка'],
        ['12.11.2026', 'Реклама', 5000, '']
      ]
    }
    const plan = buildImportPlan(wb, data, ctx)
    const [sale, dupExp, newExp] = plan.rows
    expect(sale.duplicate).toBe(true)
    expect(sale.include).toBe(false)
    expect(dupExp.duplicate).toBe(true)
    expect(newExp.duplicate).toBe(false)
    expect(newExp.include).toBe(true)
  })

  it('дубли внутри одного файла', () => {
    const row = [null, '12.11.2026', 'Бежевый', 1, 20000, null, 'TikTok', 'Оплачено', 'Ж', '', '', '', '']
    const plan = buildImportPlan({ Продажи: [SALES_HEAD, row, [...row]] }, seedData(), ctx)
    expect(plan.rows.map((r) => r.duplicate)).toEqual([false, true])
  })

  it('строки с ID обновляют запись, без изменений — пропускаются, без ID — создают', () => {
    const data: DataSet = { ...seedData(), sales: [existingSale(), existingSale({ id: 's-2', buyer: 'Б' })] }
    const wb: Workbook = {
      Продажи: [
        SALES_HEAD,
        ['s-1', '10.11.2026', 'Чёрный', 1, 21000, 21000, 'Instagram', 'Оплачено', 'Аружан', 'Покупатель', 0, '', 'Айниддин'],
        ['s-2', '10.11.2026', 'Чёрный', 1, 20000, 20000, 'Instagram', 'Оплачено', 'Б', 'Покупатель', 0, '', 'Айниддин'],
        [null, '13.11.2026', 'Коричневый', 1, 20000, null, 'OLX', 'Оплачено', 'Новый', '', '', '', '']
      ]
    }
    const plan = buildImportPlan(wb, data, ctx)
    expect(plan.rows.map((r) => r.action)).toEqual(['update', 'same', 'create'])
    expect(plan.rows.map((r) => r.include)).toEqual([true, false, true])
    const s = summarizePlan(plan.rows)
    expect(describeSummary(s)).toBe('будет добавлено 1 продажа; обновлено 1 продажа')

    const next = applyImport(data, plan.rows)
    expect(next.sales).toHaveLength(3)
    expect(next.sales.find((x) => x.id === 's-1')).toMatchObject({ price: 21000, createdAt: '2026-11-10T09:00:00.000Z' })
    // повторный импорт того же файла ничего не добавляет
    const again = buildImportPlan(wb, next, ctx)
    expect(again.rows.map((r) => r.action)).toEqual(['same', 'same', 'create'])
    expect(again.rows[2].duplicate).toBe(true)
    expect(summarizePlan(again.rows).sales).toEqual({ create: 0, update: 0 })
  })

  it('закупки: строки группируются в партию, обновление по ID', () => {
    const head = ['ID', 'Дата', 'Партия', 'Тип строки', 'Цвет', 'Кол-во', 'Цена, ¥', 'Статья затрат', 'Сумма, ₸']
    const wb: Workbook = {
      Закупки: [
        head,
        [null, '01.12.2026', 'Партия №2', 'Товар', 'бежевый', 4, '110', null, null],
        [null, '01.12.2026', 'Партия №2', 'Товар', 'Красный', 2, 120, null, null],
        [null, '01.12.2026', 'Партия №2', 'Затрата', null, null, null, 'Товар + доставка', '50 000'],
        [null, '01.12.2026', 'Партия №2', '', null, null, null, 'Карго', 4000],
        ['p-1', '01.11.2026', 'Партия №1', 'Товар', 'Чёрный', 3, 100, null, null],
        ['p-1', '01.11.2026', 'Партия №1', 'Затрата', null, null, null, 'Всё', 30000]
      ],
      Продажи: [SALES_HEAD, [null, '02.12.2026', 'Красный', 2, 25000, null, 'Instagram', 'Оплачено', '', '', '', '', '']]
    }
    const plan = buildImportPlan(wb, seedData(), ctx)
    const [p2, p1, sale] = plan.rows
    expect(p2.action).toBe('create')
    expect(p2.rows).toEqual([2, 3, 4, 5])
    expect(p2.record).toMatchObject({
      title: 'Партия №2',
      items: [
        { color: 'Бежевый', qty: 4, unitCny: 110 },
        { color: 'Красный', qty: 2, unitCny: 120 }
      ],
      costs: [
        { label: 'Товар + доставка', kzt: 50000 },
        { label: 'Карго', kzt: 4000 }
      ]
    })
    expect(p1.action).toBe('update')
    // новая партия уже учитывается в остатке — красный есть
    expect(sale.warnings).toEqual([])
    const next = applyImport(seedData(), plan.rows)
    expect(next.purchases).toHaveLength(2)
    expect(next.purchases[0].items).toEqual([{ color: 'Чёрный', qty: 3, unitCny: 100 }])
  })

  it('CSV без имени листа определяется по заголовкам', () => {
    const plan = buildImportPlan(
      { Sheet1: [['Дата', 'Категория', 'Сумма'], ['01.12.2026', 'Упаковка', '1 200,50']] },
      seedData(),
      ctx
    )
    expect(plan.foundSheets).toEqual(['Расходы'])
    expect(plan.rows[0].record).toMatchObject({ category: 'Упаковка', amount: 1200.5 })
  })
})
