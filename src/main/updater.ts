import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

/** Автообновление через GitHub Releases (репозиторий указан в electron-builder.yml → publish). */
export function setupUpdater() {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('error', (e) => console.error('Ошибка автообновления:', e?.message))
  autoUpdater.checkForUpdatesAndNotify().catch(() => undefined)
  setInterval(() => autoUpdater.checkForUpdates().catch(() => undefined), 6 * 60 * 60 * 1000)
}
