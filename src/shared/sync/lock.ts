import type { Lock } from '../types'
import { LOCK_TTL_MS } from '../constants'

export const FREE_LOCK: Lock = { holder: null, device: null, since: null, expiresAt: null }

export interface Identity {
  holder: string
  device: string
}

/**
 * free    — никто не держит;
 * mine    — держим мы (это имя и это устройство), даже если срок вышел;
 * expired — держит другой, но срок вышел — можно забрать с предупреждением;
 * busy    — держит другой, срок не вышел.
 */
export type LockState = 'free' | 'mine' | 'expired' | 'busy'

export function lockState(lock: Lock | null, me: Identity, now: number): LockState {
  if (!lock || !lock.holder) return 'free'
  if (lock.holder === me.holder && lock.device === me.device) return 'mine'
  const exp = lock.expiresAt ? Date.parse(lock.expiresAt) : 0
  return exp <= now ? 'expired' : 'busy'
}

export function makeLock(me: Identity, now: number, since?: string | null): Lock {
  return {
    holder: me.holder,
    device: me.device,
    since: since ?? new Date(now).toISOString(),
    expiresAt: new Date(now + LOCK_TTL_MS).toISOString()
  }
}

export function serializeLock(lock: Lock): string {
  return JSON.stringify(lock, null, 2) + '\n'
}
