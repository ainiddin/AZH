export interface CommitInfo {
  sha: string
  message: string
  author: string
  date: string
}

/** Файл изменился с момента чтения (GitHub 409/422 на PUT /contents с sha). */
export class ConflictError extends Error {
  constructor(message = 'Файл изменён другим клиентом') {
    super(message)
    this.name = 'ConflictError'
  }
}

/** Ветка сдвинулась — updateRef с force:false отклонён. */
export class RefMovedError extends Error {
  constructor(message = 'Ветка на сервере изменилась') {
    super(message)
    this.name = 'RefMovedError'
  }
}

/** Нет связи с сервером. */
export class OfflineError extends Error {
  constructor(message = 'Нет связи с GitHub') {
    super(message)
    this.name = 'OfflineError'
  }
}

/**
 * Удалённое хранилище, устроенное как git: коммиты, деревья, blob-ы.
 * Реализации: GitHubStore (Octokit) и MemoryStore (тесты).
 */
export interface RemoteStore {
  /** sha последнего коммита ветки или null, если репозиторий пуст */
  getHead(): Promise<string | null>
  /** путь → sha blob-а для всех файлов коммита */
  getTree(commitSha: string): Promise<Record<string, string>>
  readBlob(blobSha: string): Promise<string>
  /**
   * Compare-and-swap одного файла (PUT /contents).
   * prevSha — sha blob-а, который мы прочитали (null — файла не было).
   * Бросает ConflictError, если файл успели изменить. Возвращает новый sha blob-а.
   */
  putFile(path: string, content: string, prevSha: string | null, message: string, author: string): Promise<string>
  /**
   * Один атомарный коммит поверх baseCommit (blobs → tree → commit → updateRef force:false).
   * Бросает RefMovedError, если ветка уже не baseCommit.
   */
  commitFiles(
    baseCommit: string,
    files: Record<string, string>,
    message: string,
    author: string
  ): Promise<{ commit: string; shas: Record<string, string> }>
  listCommits(limit: number): Promise<CommitInfo[]>
}
