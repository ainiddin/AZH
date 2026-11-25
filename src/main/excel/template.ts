import ExcelJS from 'exceljs'
import { CHANNELS, DELIVERY_LABEL, EXPENSE_CATEGORIES, STATUS_LABEL } from '@shared/constants'
import {
  EXAMPLE_ID,
  IMPORT_SHEETS,
  ROW_TYPE,
  SHEET,
  type ColumnDef,
  type ListName
} from '@shared/excel/columns'
import { columnName, excelDate, setupColumns } from './style'

const TEMPLATE_ROWS = 500

const EXAMPLES: Record<string, Record<string, unknown>[]> = {
  [SHEET.sales]: [
    {
      date: '2026-11-24',
      color: 'Чёрный',
      qty: 1,
      price: 20000,
      channel: 'Instagram',
      status: STATUS_LABEL.paid,
      buyer: 'Имя покупателя',
      delivery: DELIVERY_LABEL.buyer,
      deliveryCost: 0,
      note: 'пример — строку можно удалить'
    }
  ],
  [SHEET.purchases]: [
    { date: '2026-12-01', title: 'Партия №2', type: ROW_TYPE.item, color: 'Бежевый', qty: 5, unitCny: 100 },
    { date: '2026-12-01', title: 'Партия №2', type: ROW_TYPE.cost, label: 'Карго в Казахстан', kzt: 5000 }
  ],
  [SHEET.expenses]: [{ date: '2026-11-24', category: 'Реклама', amount: 5000, note: 'пример — строку можно удалить' }]
}

/**
 * Шаблон для ввода: те же листы и заголовки, что в экспорте, выпадающие списки,
 * серая строка-пример (ID = ПРИМЕР — при импорте пропускается), закреплённая шапка.
 */
export async function writeTemplate(path: string, colors: string[]): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'AZH'

  const info = wb.addWorksheet('Как заполнять')
  info.getColumn(1).width = 100
  ;[
    'Шаблон для ввода данных в AZH',
    '',
    '• Заполняйте листы «Продажи», «Закупки», «Расходы». Пустые листы можно не трогать.',
    '• Серые строки — примеры, они не импортируются. Их можно удалить.',
    '• Даты: ДД.ММ.ГГГГ. Числа можно писать с пробелами и запятой: 73 975,08.',
    '• Цвет, Канал, Статус, Доставка, Категория — выбирайте из выпадающего списка.',
    '• Закупки: одна партия = несколько строк с одинаковыми Датой и Партией.',
    '  Тип строки «Товар» — заполните Цвет, Кол-во, Цена ¥; «Затрата» — Статья затрат и Сумма ₸.',
    '• Новые записи — без ID. Если вы правите файл, выгруженный кнопкой «Отчёт Excel»,',
    '  скрытая колонка ID сохранится и записи обновятся без дублей.',
    '• Импорт: в приложении «Начать работу» → «Ввести данные из Excel».'
  ].forEach((t, i) => {
    const r = info.addRow([t])
    if (i === 0) r.font = { bold: true, size: 14 }
  })

  // скрытый лист со списками для выпадающих меню
  const lists = wb.addWorksheet(SHEET.lists, { state: 'veryHidden' })
  const listValues: Record<ListName, string[]> = {
    colors,
    channels: [...CHANNELS],
    status: Object.values(STATUS_LABEL),
    delivery: Object.values(DELIVERY_LABEL),
    categories: [...EXPENSE_CATEGORIES],
    rowType: Object.values(ROW_TYPE)
  }
  const listRef: Partial<Record<ListName, string>> = {}
  ;(Object.keys(listValues) as ListName[]).forEach((name, i) => {
    const col = i + 1
    const values = listValues[name]
    lists.getCell(1, col).value = name
    values.forEach((v, k) => (lists.getCell(k + 2, col).value = v))
    const L = columnName(col)
    listRef[name] = `'${SHEET.lists}'!$${L}$2:$${L}$${Math.max(2, values.length + 1)}`
  })

  for (const { name, columns } of IMPORT_SHEETS) {
    const ws = wb.addWorksheet(name)
    setupColumns(ws, columns)
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }

    for (const ex of EXAMPLES[name]) {
      const row = ws.addRow({ ...ex, id: EXAMPLE_ID, date: excelDate(ex.date as string) })
      row.font = { italic: true, color: { argb: 'FF9A968E' } }
    }
    columns.forEach((c: ColumnDef, i) => {
      if (!c.list) return
      for (let r = 2; r <= TEMPLATE_ROWS; r++) {
        ws.getCell(r, i + 1).dataValidation = {
          type: 'list',
          // цвет можно вписать новый — остальные значения только из списка
          allowBlank: true,
          showErrorMessage: c.list !== 'colors',
          errorTitle: 'Значение не из списка',
          error: 'Выберите значение из выпадающего списка',
          formulae: [listRef[c.list]!]
        }
      }
    })
  }
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 1, visibility: 'visible' }]
  await wb.xlsx.writeFile(path)
}
