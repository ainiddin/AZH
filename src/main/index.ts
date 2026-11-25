import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { basename, join } from 'path'
import { SyncEngine, SyncError, type EngineState } from '@shared/sync/SyncEngine'
import type { ApiResult, SettingsView, SetupInput } from '@shared/api'
import type { DataSet } from '@shared/types'
import { seedData } from '@shared/seed'
import { GitHubStore } from './GitHubStore'
import { FilePersistence } from './localData'
import { decryptToken, loadSettings, saveSettings } from './settings'
import { exportReport } from './excel/export'
import { writeTemplate } from './excel/template'
import { readWorkbook } from './excel/read'
import { setupUpdater } from './updater'

let win: BrowserWindow | null = null
let engine: SyncEngine | null = null
let quitting = false

function send(state: EngineState) {
  win?.webContents.send('sync:changed', state)
}

async function startEngine(): Promise<SyncEngine | null> {
  engine?.dispose()
  engine = null
  const s = await loadSettings()
  const token = decryptToken(s.tokenEnc)
  if (!s.user || !s.owner || !s.repo || !token) return null
  const store = new GitHubStore(token, s.owner, s.repo)
  const dir = join(app.getPath('userData'), 'repos', `${s.owner}__${s.repo}`)
  engine = new SyncEngine(store, new FilePersistence(dir), { holder: s.user, device: s.deviceId })
  engine.onChange(send)
  await engine.init()
  return engine
}

function need(): SyncEngine {
  if (!engine) throw new Error('Приложение не настроено — откройте Настройки')
  return engine
}

/** Обёртка: ошибки main-процесса доходят до интерфейса с кодом и текстом. */
function handle<A extends unknown[], T>(channel: string, fn: (...args: A) => Promise<T> | T) {
  ipcMain.handle(channel, async (_e, ...args): Promise<ApiResult<T>> => {
    try {
      return { ok: true, value: await fn(...(args as A)) }
    } catch (e) {
      if (e instanceof SyncError) return { ok: false, error: { code: e.code, message: e.message, info: e.info } }
      return { ok: false, error: { code: 'error', message: e instanceof Error ? e.message : String(e) } }
    }
  })
}

function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function registerIpc() {
  handle('settings:get', async (): Promise<SettingsView> => {
    const s = await loadSettings()
    const hasToken = !!decryptToken(s.tokenEnc)
    return {
      configured: !!(s.user && s.owner && s.repo && hasToken),
      user: s.user,
      owner: s.owner,
      repo: s.repo,
      deviceId: s.deviceId,
      hasToken
    }
  })

  handle('settings:save', async (input: SetupInput) => {
    if (!input.user?.trim()) throw new Error('Укажите имя')
    if (!input.owner?.trim() || !input.repo?.trim()) throw new Error('Укажите владельца и имя репозитория')
    if (engine?.getState().mode === 'active')
      throw new Error('Сначала сохраните работу и выйдите из активного режима')
    const cur = await loadSettings()
    const token = input.token?.trim() || decryptToken(cur.tokenEnc)
    if (!token) throw new Error('Укажите GitHub-токен')
    // проверить доступ до сохранения
    const access = await new GitHubStore(token, input.owner.trim(), input.repo.trim()).checkAccess()
    if (!access.canPush) throw new Error('У токена нет права записи в репозиторий (нужно Contents: Read and write)')
    await saveSettings({ ...input, token: input.token?.trim() || undefined })
    const e = await startEngine()
    return { needsInit: !!e?.getState().needsInit, isPrivate: access.isPrivate }
  })

  handle('sync:state', () => engine?.getState() ?? null)
  handle('sync:initRepo', () => need().initRepo(seedData()))
  handle('sync:pull', () => need().pull())
  handle('sync:start', (force: boolean) => need().startWork({ force }))
  handle('sync:push', (release: boolean) => need().push({ release }))
  handle('sync:cancel', () => need().cancelWork())
  handle('sync:revert', () => need().revertDraft())
  handle('sync:discardRecovery', () => need().discardRecovery())
  handle('sync:updateDraft', (data: DataSet, note?: string) => need().updateDraft(data, note))
  handle('sync:history', () => need().history(100))

  handle('excel:export', async (data: DataSet) => {
    const res = await dialog.showSaveDialog(win!, {
      title: 'Сохранить отчёт Excel',
      defaultPath: `AZH отчёт ${stamp()}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (res.canceled || !res.filePath) return null
    await exportReport(res.filePath, data, engine?.getState().identity.holder ?? '')
    shell.showItemInFolder(res.filePath)
    return res.filePath
  })

  handle('excel:template', async (colors: string[]) => {
    const res = await dialog.showSaveDialog(win!, {
      title: 'Сохранить шаблон для ввода',
      defaultPath: 'AZH шаблон ввода.xlsx',
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (res.canceled || !res.filePath) return null
    await writeTemplate(res.filePath, colors)
    shell.showItemInFolder(res.filePath)
    return res.filePath
  })

  handle('excel:open', async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Выберите файл для импорта',
      properties: ['openFile'],
      filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    const path = res.filePaths[0]
    return { fileName: basename(path), sheets: await readWorkbook(path) }
  })

  handle('app:version', () => app.getVersion())
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    title: 'AZH',
    backgroundColor: '#f6f4ef',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // закрытие в активном режиме: предложить сохранить
  win.on('close', async (e) => {
    if (quitting || !engine) return
    const s = engine.getState()
    if (s.mode !== 'active') return
    e.preventDefault()
    const { response } = await dialog.showMessageBox(win!, {
      type: 'question',
      title: 'AZH',
      message: s.dirty ? `Есть несохранённые изменения: ${s.changesText}` : 'Вы в активном режиме',
      detail: s.dirty
        ? 'Сохранить их и освободить замок? Если выйти без сохранения, черновик останется на этом компьютере и его можно будет сохранить при следующем запуске (пока замок ваш).'
        : 'Освободить замок, чтобы другие могли работать?',
      buttons: ['Сохранить и выйти', 'Выйти (черновик останется)', 'Отмена'],
      defaultId: 0,
      cancelId: 2
    })
    if (response === 2) return
    if (response === 0) {
      try {
        await engine.push({ release: true })
      } catch (err) {
        const { response: r } = await dialog.showMessageBox(win!, {
          type: 'error',
          title: 'Не удалось сохранить',
          message: err instanceof Error ? err.message : String(err),
          detail: 'Черновик сохранён на этом компьютере.',
          buttons: ['Остаться', 'Всё равно выйти'],
          defaultId: 0,
          cancelId: 0
        })
        if (r === 0) return
      }
    }
    quitting = true
    win?.close()
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

// отдельный профиль (папка данных) — например, чтобы на одном ПК проверить работу двух пользователей
if (process.env.AZH_PROFILE) app.setPath('userData', process.env.AZH_PROFILE)

const single = app.requestSingleInstanceLock()
if (!single) app.quit()
else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.whenReady().then(async () => {
    app.setAppUserModelId('kz.ainiddin.azh')
    registerIpc()
    createWindow()
    startEngine().catch((e) => console.error(e))
    setupUpdater()
  })
  app.on('before-quit', () => {
    quitting = quitting || engine?.getState().mode !== 'active'
  })
  app.on('window-all-closed', () => {
    engine?.dispose()
    app.quit()
  })
}
