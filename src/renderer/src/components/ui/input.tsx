import * as React from 'react'
import { cn } from '@/lib/utils'

const base =
  'h-9 w-full rounded-lg border border-line bg-white px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:cursor-not-allowed disabled:bg-soft/60 disabled:text-muted'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(base, className)} {...props} />
)
Input.displayName = 'Input'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(base, 'pr-8', className)} {...props} />
)
Select.displayName = 'Select'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(base, 'h-auto min-h-[72px] py-2', className)} {...props} />
)
Textarea.displayName = 'Textarea'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1 block text-[12px] font-medium text-muted', className)} {...props} />
}

export function Field({
  label,
  hint,
  className,
  children
}: {
  label: string
  hint?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {hint && <div className="mt-1 text-[12px] text-muted">{hint}</div>}
    </div>
  )
}
