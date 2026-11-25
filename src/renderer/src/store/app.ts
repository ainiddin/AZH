import { create } from 'zustand'
import type { ApiResult, SettingsView } from '@shared/api'
import type { EngineState } from '@shared/sync/SyncEngine'
import type { DataSet } from '@shared/types'

export type Page = 'overview' | 'sales' | 'stock' | 'purchases' | 'expenses' | 'history' | 'settings'

export interface Toast {
  id: number
  kind: 'ok' | 'err' | 'info'
  text: string
}

interface ConfirmReq {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  resolve: (v: boolean) => void
}

interface AppStore {
  ready: boolean
  settings: SettingsView | null
  sync: EngineState | null
  page: Page
  toasts: Toast[]
  confirm: ConfirmReq | null
  importOpen: boolean
  setPage: (p: Page) => void
  setImportOpen: (v: boolean) => void
  toast: (kind: Toast['kind'], text: string) => void
  dismiss: (id: number) => void
  ask: (req: Omit<ConfirmReq, 'resolve'>) => Promise<boolean>
  answer: (v: boolean) => void
  load: () => Promise<void>
}

let toastId = 0

export const useApp = create<AppStore>((set, get) => ({
  ready: false,
  settings: null,
  sync: null,
  page: 'overview',
  toasts: [],
  confirm: null,
  importOpen: false,
  setPage: (page) => set({ page }),
  setImportOpen: (importOpen) => set({ importOpen }),
  toast: (kind, text) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }))
    setTimeout(() => get().dismiss(id), kind === 'err' ? 9000 : 4000)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  ask: (req) => new Promise<boolean>((resolve) => set({ confirm: { ...req, resolve } })),
  answer: (v) => {
    get().confirm?.resolve(v)
    set({ confirm: null })
  },
  load: async () => {
    const [settings, state] = await Promise.all([window.api.settings.get(), window.api.sync.state()])
    set({
      settings: settings.ok ? settings.value : null,
      sync: state.ok ? state.value : null,
      ready: true
    })
  }
}))

window.api.sync.onState((sync) => useApp.setState({ sync }))

/** Выполнить вызов API; ошибку показать уведомлением. */
export async function run<T>(p: Promise<ApiResult<T>>, okText?: string): Promise<T | undefined> {
  const r = await p
  if (!r.ok) {
    useApp.getState().toast('err', r.error.message)
    return undefined
  }
  if (okText) useApp.getState().toast('ok', okText)
  return r.value
}

/** Данные на экране: черновик в активном режиме, иначе последняя версия с сервера. */
export function useData(): DataSet | null {
  return useApp((s) => s.sync?.draft ?? s.sync?.remote ?? null)
}

export function useEditable(): boolean {
  return useApp((s) => s.sync?.mode === 'active' && !s.sync.lockLost)
}

/** Изменить черновик: копия данных → правка → сохранить в черновик (локально, до push). */
export async function mutate(fn: (d: DataSet) => void, okText?: string, note?: string): Promise<boolean> {
  const s = useApp.getState().sync
  const base = s?.draft
  if (!base) {
    useApp.getState().toast('err', 'Редактирование доступно только в активном режиме — нажмите «Начать работу»')
    return false
  }
  const next: DataSet = JSON.parse(JSON.stringify(base))
  fn(next)
  const r = await window.api.sync.updateDraft(next, note)
  if (!r.ok) {
    useApp.getState().toast('err', r.error.message)
    return false
  }
  if (okText) useApp.getState().toast('ok', okText)
  return true
}

/** «Начать работу» с подтверждением при просроченном чужом замке. */
export async function startWork() {
  const r = await window.api.sync.start(false)
  if (r.ok) return useApp.getState().toast('ok', 'Активный режим: можно редактировать')
  if (r.error.code === 'expired') {
    const yes = await useApp.getState().ask({
      title: 'Замок просрочен',
      message: r.error.message,
      confirmLabel: 'Забрать замок',
      danger: true
    })
    if (yes) await run(window.api.sync.start(true), 'Замок ваш — активный режим')
    return
  }
  useApp.getState().toast('err', r.error.message)
}
