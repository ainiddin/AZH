import * as React from 'react'
import * as T from '@radix-ui/react-tooltip'

export const TooltipProvider = T.Provider

export function Tooltip({ content, children }: { content?: React.ReactNode; children: React.ReactNode }) {
  if (!content) return <>{children}</>
  return (
    <T.Root delayDuration={150}>
      {/* span-обёртка, чтобы подсказка работала и у неактивных кнопок */}
      <T.Trigger asChild>
        <span className="inline-flex">{children}</span>
      </T.Trigger>
      <T.Portal>
        <T.Content
          sideOffset={6}
          className="z-[60] max-w-[280px] rounded-lg bg-ink px-3 py-2 text-[12px] leading-snug text-white shadow-lg"
        >
          {content}
          <T.Arrow className="fill-ink" />
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
