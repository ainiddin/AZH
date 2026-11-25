export const CHANNELS = [
  'Instagram',
  'TikTok',
  'WhatsApp',
  'Telegram',
  'Threads',
  'OLX',
  'Kaspi',
  'Знакомые',
  'Другое'
] as const

export const EXPENSE_CATEGORIES = [
  'Реклама',
  'Упаковка',
  'Доставка',
  'Комиссия',
  'Фото/контент',
  'Прочее'
] as const

export const DEFAULT_COLORS = ['Тёмно-синий', 'Бежевый', 'Чёрный', 'Коричневый']

export const COLOR_SWATCH: Record<string, string> = {
  'Тёмно-синий': '#1f2a44',
  Бежевый: '#d8c8ab',
  Чёрный: '#1a1a1a',
  Коричневый: '#5a3a26'
}

export const STATUS_LABEL = { paid: 'Оплачено', reserved: 'Бронь' } as const
export const DELIVERY_LABEL = { buyer: 'Покупатель', us: 'Мы' } as const

export const DATA_FILES = {
  purchases: 'data/purchases.json',
  sales: 'data/sales.json',
  expenses: 'data/expenses.json',
  config: 'data/config.json'
} as const
export const LOCK_FILE = 'lock.json'

export const LOCK_TTL_MS = 10 * 60 * 1000
export const HEARTBEAT_MS = 2 * 60 * 1000
export const POLL_MS = 60 * 1000
