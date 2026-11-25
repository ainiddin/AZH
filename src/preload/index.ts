import { contextBridge, ipcRenderer } from 'electron'
import type { AzhApi } from '@shared/api'
import type { EngineState } from '@shared/sync/SyncEngine'

const call = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const api: AzhApi = {
  settings: {
    get: () => call('settings:get'),
    save: (input) => call('settings:save', input)
  },
  sync: {
    state: () => call('sync:state'),
    onState: (fn) => {
      const h = (_: unknown, s: EngineState) => fn(s)
      ipcRenderer.on('sync:changed', h)
      return () => ipcRenderer.removeListener('sync:changed', h)
    },
    initRepo: () => call('sync:initRepo'),
    pull: () => call('sync:pull'),
    start: (force) => call('sync:start', !!force),
    push: (release) => call('sync:push', !!release),
    cancel: () => call('sync:cancel'),
    revert: () => call('sync:revert'),
    discardRecovery: () => call('sync:discardRecovery'),
    updateDraft: (data, note) => call('sync:updateDraft', data, note),
    history: () => call('sync:history')
  },
  excel: {
    exportReport: (data) => call('excel:export', data),
    saveTemplate: (colors) => call('excel:template', colors),
    open: () => call('excel:open')
  },
  app: {
    version: () => call('app:version')
  }
}

contextBridge.exposeInMainWorld('api', api)
