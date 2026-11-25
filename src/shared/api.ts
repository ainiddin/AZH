import type { DataSet } from './types'
import type { EngineState, SyncErrorCode } from './sync/SyncEngine'
import type { CommitInfo } from './sync/RemoteStore'
import type { Workbook } from './excel/importPlan'

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: SyncErrorCode | 'error'; message: string; info?: Record<string, unknown> } }

export interface SettingsView {
  configured: boolean
  user: string
  owner: string
  repo: string
  deviceId: string
  hasToken: boolean
}

export interface SetupInput {
  user: string
  owner: string
  repo: string
  /** пусто — оставить сохранённый токен */
  token?: string
}

export interface OpenedWorkbook {
  fileName: string
  sheets: Workbook
}

/** Мост preload → renderer (window.api). Все вызовы возвращают ApiResult. */
export interface AzhApi {
  settings: {
    get(): Promise<ApiResult<SettingsView>>
    save(input: SetupInput): Promise<ApiResult<{ needsInit: boolean; isPrivate: boolean }>>
  }
  sync: {
    state(): Promise<ApiResult<EngineState | null>>
    onState(fn: (s: EngineState) => void): () => void
    initRepo(): Promise<ApiResult<void>>
    pull(): Promise<ApiResult<void>>
    start(force?: boolean): Promise<ApiResult<void>>
    push(release?: boolean): Promise<ApiResult<string | null>>
    cancel(): Promise<ApiResult<void>>
    revert(): Promise<ApiResult<void>>
    discardRecovery(): Promise<ApiResult<void>>
    updateDraft(data: DataSet, note?: string): Promise<ApiResult<void>>
    history(): Promise<ApiResult<CommitInfo[]>>
  }
  excel: {
    exportReport(data: DataSet): Promise<ApiResult<string | null>>
    saveTemplate(colors: string[]): Promise<ApiResult<string | null>>
    open(): Promise<ApiResult<OpenedWorkbook | null>>
  }
  app: {
    version(): Promise<ApiResult<string>>
  }
}
