export function newId(prefix: string): string {
  const rnd = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}${rnd}`
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

export function todayIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 1 продажа / 2 продажи / 5 продаж */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b > 1 && b < 5) return few
  if (b === 1) return one
  return many
}

export function fmtKzt(n: number, digits = 0): string {
  return (
    n.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' ₸'
  )
}

export function fmtPct(n: number): string {
  return (n * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + '%'
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}
