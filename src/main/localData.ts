import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import type { CacheFile, Draft, Persistence } from '@shared/sync/SyncEngine'

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

/** Запись через временный файл — при падении посреди записи старый файл останется целым. */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(tmp, path)
}

/** Локальная копия данных и черновик в userData/<owner>__<repo>/ */
export class FilePersistence implements Persistence {
  constructor(private dir: string) {}

  private p(name: string) {
    return join(this.dir, name)
  }
  loadCache() {
    return readJson<CacheFile>(this.p('cache.json'))
  }
  saveCache(c: CacheFile) {
    return writeJsonAtomic(this.p('cache.json'), c)
  }
  loadDraft() {
    return readJson<Draft>(this.p('draft.json'))
  }
  saveDraft(d: Draft) {
    return writeJsonAtomic(this.p('draft.json'), d)
  }
  async clearDraft() {
    await fs.rm(this.p('draft.json'), { force: true })
  }
}
