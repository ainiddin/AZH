import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useApp } from '@/store/app'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-[380px] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-xl border bg-white px-4 py-3 text-[13px] shadow-lg',
            t.kind === 'err' ? 'border-neg/30' : 'border-line'
          )}
        >
          {t.kind === 'ok' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-pos" />}
          {t.kind === 'err' && <XCircle className="mt-0.5 size-4 shrink-0 text-neg" />}
          {t.kind === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-gold" />}
          <div className="flex-1">{t.text}</div>
          <button className="text-muted hover:text-ink" onClick={() => dismiss(t.id)} aria-label="Закрыть">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

export function ConfirmDialog() {
  const confirm = useApp((s) => s.confirm)
  const answer = useApp((s) => s.answer)
  return (
    <Dialog
      open={!!confirm}
      onOpenChange={(v) => !v && answer(false)}
      title={confirm?.title ?? ''}
      footer={
        <>
          <Button variant="outline" onClick={() => answer(false)}>
            Отмена
          </Button>
          <Button variant={confirm?.danger ? 'gold' : 'default'} onClick={() => answer(true)} autoFocus>
            {confirm?.confirmLabel ?? 'OK'}
          </Button>
        </>
      }
    >
      <p className="text-[14px] leading-relaxed">{confirm?.message}</p>
    </Dialog>
  )
}
