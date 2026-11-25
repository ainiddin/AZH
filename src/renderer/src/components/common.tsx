import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import { COLOR_SWATCH } from '@shared/constants'
import { fmtKzt } from '@shared/util'
import { cn } from '@/lib/utils'
import { Card } from './ui/card'

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn('inline-block size-3 shrink-0 rounded-full border border-black/10', className)}
      style={{ background: COLOR_SWATCH[color] ?? '#c9c3b6' }}
    />
  )
}

export function ColorName({ color }: { color: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <ColorDot color={color} />
      {color}
    </span>
  )
}

export function Kpi({
  label,
  value,
  sub,
  tone
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: 'pos' | 'neg' | null
}) {
  return (
    <Card>
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className={cn('mt-1.5 font-serif text-[27px] font-semibold leading-tight', tone === 'pos' && 'text-pos', tone === 'neg' && 'text-neg')}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[12px] text-muted">{sub}</div>}
    </Card>
  )
}

export function Money({ value, signed, className }: { value: number; signed?: boolean; className?: string }) {
  const tone = signed ? (value > 0 ? 'text-pos' : value < 0 ? 'text-neg' : '') : ''
  return <span className={cn('tabular-nums', tone, className)}>{fmtKzt(value)}</span>
}

export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-[#f0dcb0] bg-[#fff7e6] px-3 py-2 text-[13px] text-warn">
      {items.map((w) => (
        <div key={w} className="flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          {w}
        </div>
      ))}
    </div>
  )
}

export function PageTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 mt-1 flex items-end justify-between gap-4">
      <h1 className="text-[30px] leading-none">{children}</h1>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-[13px] text-muted">{children}</div>
}

export function ReadOnlyNote() {
  return (
    <div className="mb-4 rounded-lg border border-line bg-soft/60 px-4 py-2.5 text-[13px] text-muted">
      Режим просмотра. Чтобы вносить изменения, нажмите <b className="text-ink">«Начать работу»</b> вверху.
    </div>
  )
}
