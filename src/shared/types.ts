import type { z } from 'zod'
import type {
  ConfigSchema,
  CostSchema,
  DataSetSchema,
  ExpenseSchema,
  LockSchema,
  PurchaseItemSchema,
  PurchaseSchema,
  SaleSchema
} from './schemas'
import type { CHANNELS, EXPENSE_CATEGORIES } from './constants'

export type Channel = (typeof CHANNELS)[number]
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export type PurchaseItem = z.infer<typeof PurchaseItemSchema>
export type Cost = z.infer<typeof CostSchema>
export type Purchase = z.infer<typeof PurchaseSchema>
export type Sale = z.infer<typeof SaleSchema>
export type Expense = z.infer<typeof ExpenseSchema>
export type Config = z.infer<typeof ConfigSchema>
export type Lock = z.infer<typeof LockSchema>
export type DataSet = z.infer<typeof DataSetSchema>
export type Collection = 'purchases' | 'sales' | 'expenses'
