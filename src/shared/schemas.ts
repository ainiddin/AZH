import { z } from 'zod'
import { CHANNELS, EXPENSE_CATEGORIES } from './constants'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата должна быть в формате ГГГГ-ММ-ДД')
const money = z.number({ error: 'Нужно число' }).finite().min(0, 'Не может быть отрицательным')
const qty = z.number({ error: 'Нужно число' }).int('Нужно целое число').positive('Должно быть больше 0')

export const PurchaseItemSchema = z.object({
  color: z.string().trim().min(1, 'Укажите цвет'),
  qty,
  unitCny: money
})

export const CostSchema = z.object({
  label: z.string().trim().min(1, 'Укажите статью'),
  kzt: money
})

export const PurchaseSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  title: z.string().trim().min(1, 'Укажите название партии'),
  items: z.array(PurchaseItemSchema).min(1, 'Нужен хотя бы один товар'),
  costs: z.array(CostSchema)
})

export const SaleSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  color: z.string().trim().min(1, 'Укажите цвет'),
  qty,
  price: money,
  channel: z.enum(CHANNELS, { error: 'Неизвестный канал' }),
  status: z.enum(['paid', 'reserved'], { error: 'Статус: Оплачено или Бронь' }),
  buyer: z.string(),
  delivery: z.enum(['buyer', 'us'], { error: 'Доставка: Покупатель или Мы' }),
  deliveryCost: money,
  note: z.string(),
  by: z.string(),
  createdAt: z.string()
})

export const ExpenseSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  category: z.enum(EXPENSE_CATEGORIES, { error: 'Неизвестная категория' }),
  amount: money,
  note: z.string(),
  by: z.string()
})

export const ConfigSchema = z.object({
  targetPrice: money,
  minPrice: money
})

export const LockSchema = z.object({
  holder: z.string().nullable(),
  device: z.string().nullable().optional(),
  since: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional()
})

export const DataSetSchema = z.object({
  purchases: z.array(PurchaseSchema),
  sales: z.array(SaleSchema),
  expenses: z.array(ExpenseSchema),
  config: ConfigSchema
})
