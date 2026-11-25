import * as React from 'react'
import { cn } from '@/lib/utils'

const variants = {
  default: 'bg-ink text-white border-ink hover:bg-black',
  gold: 'bg-gold text-white border-gold hover:brightness-95',
  outline: 'bg-white text-ink border-line hover:border-ink/40',
  ghost: 'bg-transparent border-transparent text-muted hover:text-ink',
  danger: 'bg-white text-neg border-line hover:border-neg/50',
  dark: 'bg-white/5 text-white border-white/15 hover:bg-white/10'
} as const

const sizes = {
  default: 'h-9 px-4',
  sm: 'h-8 px-3 text-[13px]',
  icon: 'h-8 w-8 p-0'
} as const

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
)
Button.displayName = 'Button'
