import { Octokit } from '@octokit/rest'
import {
  ConflictError,
  OfflineError,
  RefMovedError,
  type CommitInfo,
  type RemoteStore
} from '@shared/sync/RemoteStore'

const EMAIL = 'azh-app@users.noreply.github.com'

interface HttpErr {
  status?: number
  message?: string
}

function isNetworkError(e: HttpErr): boolean {
  return (
    !e.status ||
    (e.status === 500 && /fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|network|socket/i.test(e.message ?? ''))
  )
}

/** Понятные сообщения для типовых ответов GitHub. */
function friendly(e: unknown): Error {
  const err = e as HttpErr
  if (err instanceof ConflictError || err instanceof RefMovedError || err instanceof OfflineError) return err as Error
  if (isNetworkError(err)) return new OfflineError()
  if (err.status === 401) return new Error('GitHub отклонил токен (401). Проверьте токен в настройках.')
  if (err.status === 403)
    return new Error('Нет прав или превышен лимит запросов GitHub (403). Токену нужен доступ Contents: Read and write.')
  if (err.status === 404) return new Error('Репозиторий не найден или у токена нет к нему доступа (404).')
  return new Error(`GitHub: ${err.message ?? String(e)}`)
}

/** Удалённое хранилище поверх GitHub (Git Data API + Contents API). */
export class GitHubStore implements RemoteStore {
  private octo: Octokit
  private branch: string | null = null
  private empty = false

  constructor(
    token: string,
    private owner: string,
    private repo: string
  ) {
    this.octo = new Octokit({ auth: token, userAgent: 'AZH-desktop' })
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (e) {
      throw friendly(e)
    }
  }

  /** Проверка доступа для мастера настройки. */
  async checkAccess(): Promise<{ canPush: boolean; isPrivate: boolean; fullName: string }> {
    const { data } = await this.call(() => this.octo.repos.get({ owner: this.owner, repo: this.repo }))
    this.branch = data.default_branch
    return { canPush: !!data.permissions?.push, isPrivate: data.private, fullName: data.full_name }
  }

  private async getBranch(): Promise<string> {
    if (!this.branch) await this.checkAccess()
    return this.branch!
  }

  async getHead(): Promise<string | null> {
    const branch = await this.getBranch()
    try {
      const { data } = await this.octo.git.getRef({ owner: this.owner, repo: this.repo, ref: `heads/${branch}` })
      this.empty = false
      return data.object.sha
    } catch (e) {
      const err = e as HttpErr
      if (err.status === 404 || err.status === 409) {
        // пустой репозиторий (409 «Git Repository is empty») или ветки ещё нет
        this.empty = true
        return null
      }
      throw friendly(e)
    }
  }

  async getTree(commitSha: string): Promise<Record<string, string>> {
    return this.call(async () => {
      const commit = await this.octo.git.getCommit({ owner: this.owner, repo: this.repo, commit_sha: commitSha })
      const tree = await this.octo.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: commit.data.tree.sha,
        recursive: 'true'
      })
      const out: Record<string, string> = {}
      for (const t of tree.data.tree) if (t.type === 'blob' && t.path && t.sha) out[t.path] = t.sha
      return out
    })
  }

  async readBlob(blobSha: string): Promise<string> {
    return this.call(async () => {
      const { data } = await this.octo.git.getBlob({ owner: this.owner, repo: this.repo, file_sha: blobSha })
      return Buffer.from(data.content, data.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8')
    })
  }

  async putFile(path: string, content: string, prevSha: string | null, message: string, author: string): Promise<string> {
    const branch = await this.getBranch()
    try {
      const { data } = await this.octo.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        ...(prevSha ? { sha: prevSha } : {}),
        ...(this.empty ? {} : { branch }),
        author: { name: author, email: EMAIL },
        committer: { name: author, email: EMAIL }
      })
      this.empty = false
      return data.content!.sha!
    } catch (e) {
      const err = e as HttpErr
      // 409 — sha не совпал, 422 — файл уже есть, а sha не передали
      if (err.status === 409 || err.status === 422) throw new ConflictError()
      throw friendly(e)
    }
  }

  async commitFiles(
    baseCommit: string,
    files: Record<string, string>,
    message: string,
    author: string
  ): Promise<{ commit: string; shas: Record<string, string> }> {
    const branch = await this.getBranch()
    const { owner, repo } = this
    const shas: Record<string, string> = {}
    const tree = await this.call(async () => {
      for (const [path, content] of Object.entries(files)) {
        const blob = await this.octo.git.createBlob({ owner, repo, content, encoding: 'utf-8' })
        shas[path] = blob.data.sha
      }
      const base = await this.octo.git.getCommit({ owner, repo, commit_sha: baseCommit })
      return this.octo.git.createTree({
        owner,
        repo,
        base_tree: base.data.tree.sha,
        tree: Object.entries(shas).map(([path, sha]) => ({ path, sha, mode: '100644' as const, type: 'blob' as const }))
      })
    })
    const date = new Date().toISOString()
    const commit = await this.call(() =>
      this.octo.git.createCommit({
        owner,
        repo,
        message,
        tree: tree.data.sha,
        parents: [baseCommit],
        author: { name: author, email: EMAIL, date },
        committer: { name: author, email: EMAIL, date }
      })
    )
    try {
      await this.octo.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.data.sha, force: false })
    } catch (e) {
      const err = e as HttpErr
      if (err.status === 422 || err.status === 409) throw new RefMovedError()
      throw friendly(e)
    }
    return { commit: commit.data.sha, shas }
  }

  async listCommits(limit: number): Promise<CommitInfo[]> {
    const branch = await this.getBranch()
    try {
      const { data } = await this.octo.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        sha: branch,
        per_page: Math.min(100, limit)
      })
      return data.map((c) => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author?.name ?? c.author?.login ?? '—',
        date: c.commit.author?.date ?? ''
      }))
    } catch (e) {
      if ((e as HttpErr).status === 409) return []
      throw friendly(e)
    }
  }
}
