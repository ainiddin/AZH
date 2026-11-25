import * as React from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[14px] border border-line bg-white px-[18px] py-4', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('section-title', className)} {...props} />
}

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'pos' | 'neg' | 'gold' | 'warn' }) {
  const tones = {
    neutral: 'bg-soft text-muted',
    pos: 'bg-pos/10 text-pos',
    neg: 'bg-neg/10 text-neg',
    gold: 'bg-gold/15 text-[#7d6237]',
    warn: 'bg-[#fff7e6] text-warn'
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', tones[tone], className)}
      {...props}
    />
  )
}
