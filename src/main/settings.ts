import { app, safeStorage } from 'electron'
import { randomBytes } from 'crypto'
import { hostname } from 'os'
import { join } from 'path'
import { readJson, writeJsonAtomic } from './localData'

interface StoredSettings {
  user: string
  owner: string
  repo: string
  deviceId: string
  /** токен, зашифрованный safeStorage (DPAPI на Windows), base64 */
  tokenEnc: string | null
}

const file = () => join(app.getPath('userData'), 'settings.json')

export async function loadSettings(): Promise<StoredSettings> {
  const s = await readJson<Partial<StoredSettings>>(file())
  const settings: StoredSettings = {
    user: s?.user ?? '',
    owner: s?.owner ?? '',
    repo: s?.repo ?? '',
    deviceId: s?.deviceId ?? `${hostname()}-${randomBytes(3).toString('hex')}`,
    tokenEnc: s?.tokenEnc ?? null
  }
  if (!s?.deviceId) await writeJsonAtomic(file(), settings)
  return settings
}

export async function saveSettings(patch: { user: string; owner: string; repo: string; token?: string }) {
  const cur = await loadSettings()
  const next: StoredSettings = { ...cur, user: patch.user.trim(), owner: patch.owner.trim(), repo: patch.repo.trim() }
  if (patch.token) next.tokenEnc = encryptToken(patch.token.trim())
  await writeJsonAtomic(file(), next)
  return next
}

export function encryptToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('Шифрование недоступно в этой системе — токен не может быть сохранён безопасно')
  return safeStorage.encryptString(token).toString('base64')
}

export function decryptToken(enc: string | null): string | null {
  if (!enc) return null
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}
