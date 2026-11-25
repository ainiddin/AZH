/** Единое описание колонок: экспорт, шаблон и импорт используют одни и те же заголовки. */

export type ListName = 'colors' | 'channels' | 'status' | 'delivery' | 'categories' | 'rowType'

export interface ColumnDef {
  key: string
  header: string
  aliases?: string[]
  width: number
  kind: 'id' | 'date' | 'text' | 'int' | 'money' | 'cny'
  list?: ListName
  required?: boolean
  /** только в экспорте (вычисляемое), при импорте игнорируется */
  computed?: boolean
}

export const SHEET = {
  summary: 'Сводка',
  sales: 'Продажи',
  stock: 'Склад',
  purchases: 'Закупки',
  expenses: 'Расходы',
  channels: 'Каналы',
  months: 'По месяцам',
  lists: 'Списки'
} as const

export type ImportSheet = typeof SHEET.sales | typeof SHEET.purchases | typeof SHEET.expenses

export const SALES_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID', kind: 'id', width: 14 },
  { key: 'date', header: 'Дата', kind: 'date', width: 12, required: true },
  { key: 'color', header: 'Цвет', kind: 'text', list: 'colors', width: 16, required: true },
  { key: 'qty', header: 'Кол-во', aliases: ['количество', 'шт'], kind: 'int', width: 9, required: true },
  { key: 'price', header: 'Цена, ₸', aliases: ['цена за шт'], kind: 'money', width: 13, required: true },
  { key: 'sum', header: 'Сумма, ₸', kind: 'money', width: 14, computed: true },
  { key: 'channel', header: 'Канал', kind: 'text', list: 'channels', width: 13, required: true },
  { key: 'status', header: 'Статус', kind: 'text', list: 'status', width: 12, required: true },
  { key: 'buyer', header: 'Покупатель', aliases: ['клиент'], kind: 'text', width: 20 },
  { key: 'delivery', header: 'Доставка', aliases: ['кто платит доставку'], kind: 'text', list: 'delivery', width: 13 },
  { key: 'deliveryCost', header: 'Стоимость доставки, ₸', aliases: ['доставка ₸', 'стоимость доставки'], kind: 'money', width: 14 },
  { key: 'note', header: 'Комментарий', aliases: ['примечание'], kind: 'text', width: 28 },
  { key: 'by', header: 'Кто ввёл', aliases: ['кто'], kind: 'text', width: 14 }
]

export const PURCHASE_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID', kind: 'id', width: 14 },
  { key: 'date', header: 'Дата', kind: 'date', width: 12, required: true },
  { key: 'title', header: 'Партия', aliases: ['название партии'], kind: 'text', width: 18, required: true },
  { key: 'type', header: 'Тип строки', aliases: ['тип'], kind: 'text', list: 'rowType', width: 11, required: true },
  { key: 'color', header: 'Цвет', kind: 'text', list: 'colors', width: 16 },
  { key: 'qty', header: 'Кол-во', aliases: ['количество', 'шт'], kind: 'int', width: 9 },
  { key: 'unitCny', header: 'Цена, ¥', aliases: ['цена юань', 'цена cny'], kind: 'cny', width: 10 },
  { key: 'label', header: 'Статья затрат', aliases: ['статья', 'затрата'], kind: 'text', width: 36 },
  { key: 'kzt', header: 'Сумма, ₸', aliases: ['сумма тенге'], kind: 'money', width: 14 },
  { key: 'unitCost', header: 'Себестоимость шт, ₸', kind: 'money', width: 16, computed: true }
]

export const EXPENSE_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID', kind: 'id', width: 14 },
  { key: 'date', header: 'Дата', kind: 'date', width: 12, required: true },
  { key: 'category', header: 'Категория', kind: 'text', list: 'categories', width: 16, required: true },
  { key: 'amount', header: 'Сумма, ₸', kind: 'money', width: 14, required: true },
  { key: 'note', header: 'Комментарий', aliases: ['примечание'], kind: 'text', width: 30 },
  { key: 'by', header: 'Кто ввёл', aliases: ['кто'], kind: 'text', width: 14 }
]

export const IMPORT_SHEETS: { name: ImportSheet; columns: ColumnDef[] }[] = [
  { name: SHEET.purchases, columns: PURCHASE_COLUMNS },
  { name: SHEET.sales, columns: SALES_COLUMNS },
  { name: SHEET.expenses, columns: EXPENSE_COLUMNS }
]

export const ROW_TYPE = { item: 'Товар', cost: 'Затрата' } as const

/** ID строки-примера в шаблоне — такие строки импорт пропускает */
export const EXAMPLE_ID = 'ПРИМЕР'

export const FMT_KZT = '#,##0 "₸"'
export const FMT_CNY = '#,##0.00 "¥"'
export const FMT_PCT = '0.0%'
export const FMT_DATE = 'dd.mm.yyyy'
