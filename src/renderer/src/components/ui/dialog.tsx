import * as React from 'react'
import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <D.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-line bg-white shadow-2xl outline-none',
            className
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <D.Title className="font-serif text-[22px] font-semibold">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-[13px] text-muted">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close className="rounded-md p-1 text-muted hover:text-ink" aria-label="Закрыть">
              <X className="size-5" />
            </D.Close>
          </div>
          {children && <div className="min-h-0 flex-1 overflow-auto px-6 py-4">{children}</div>}
          {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
