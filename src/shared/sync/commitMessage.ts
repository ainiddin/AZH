import type { Collection, DataSet } from '../types'
import { plural } from '../util'

export interface CollectionDiff {
  added: number
  changed: number
  removed: number
}

export type ChangeSummary = Record<Collection, CollectionDiff> & { config: boolean }

function diffById<T extends { id: string }>(base: T[], next: T[]): CollectionDiff {
  const before = new Map(base.map((x) => [x.id, JSON.stringify(x)]))
  const after = new Map(next.map((x) => [x.id, JSON.stringify(x)]))
  let added = 0
  let changed = 0
  let removed = 0
  for (const [id, v] of after) {
    const old = before.get(id)
    if (old === undefined) added++
    else if (old !== v) changed++
  }
  for (const id of before.keys()) if (!after.has(id)) removed++
  return { added, changed, removed }
}

export function diffData(base: DataSet, next: DataSet): ChangeSummary {
  return {
    purchases: diffById(base.purchases, next.purchases),
    sales: diffById(base.sales, next.sales),
    expenses: diffById(base.expenses, next.expenses),
    config: JSON.stringify(base.config) !== JSON.stringify(next.config)
  }
}

export function hasChanges(s: ChangeSummary): boolean {
  return (
    s.config ||
    (['purchases', 'sales', 'expenses'] as const).some(
      (k) => s[k].added + s[k].changed + s[k].removed > 0
    )
  )
}

const WORDS: Record<Collection, [string, string, string]> = {
  sales: ['продажа', 'продажи', 'продаж'],
  expenses: ['расход', 'расхода', 'расходов'],
  purchases: ['партия', 'партии', 'партий']
}

/** «+2 продажи, изм. 1 расход, −1 партия, настройки» */
export function describeChanges(s: ChangeSummary): string {
  const parts: string[] = []
  for (const k of ['sales', 'expenses', 'purchases'] as const) {
    const w = (n: number) => plural(n, ...WORDS[k])
    const d = s[k]
    if (d.added) parts.push(`+${d.added} ${w(d.added)}`)
    if (d.changed) parts.push(`изм. ${d.changed} ${w(d.changed)}`)
    if (d.removed) parts.push(`−${d.removed} ${w(d.removed)}`)
  }
  if (s.config) parts.push('настройки')
  return parts.join(', ')
}

export function commitMessage(holder: string, s: ChangeSummary, note?: string | null): string {
  const what = describeChanges(s) || 'без изменений данных'
  return note ? `${holder}: ${note}: ${what}` : `${holder}: ${what}`
}

/** Коммиты, которые только двигают замок, начинаются с этого префикса — История их скрывает. */
export const LOCK_COMMIT_PREFIX = 'lock: '
