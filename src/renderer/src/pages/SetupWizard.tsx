import { useState } from 'react'
import { Database, KeyRound, Loader2, User } from 'lucide-react'
import { run, useApp } from '@/store/app'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'

/** Мастер первого запуска: имя, токен, репозиторий; засев пустого репозитория. */
export function SetupWizard() {
  const settings = useApp((s) => s.settings)
  const sync = useApp((s) => s.sync)
  const load = useApp((s) => s.load)
  const [user, setUser] = useState(settings?.user ?? '')
  const [token, setToken] = useState('')
  const [repoFull, setRepoFull] = useState(settings?.owner ? `${settings.owner}/${settings.repo}` : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsInit = !!settings?.configured && !!sync?.needsInit

  const connect = async () => {
    setError(null)
    const m = repoFull.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').match(/^([\w.-]+)\/([\w.-]+)\/?$/)
    if (!user.trim()) return setError('Укажите ваше имя — оно будет в истории изменений')
    if (!m) return setError('Репозиторий в формате владелец/имя, например ainiddin/jacquemus-data')
    if (!token.trim() && !settings?.hasToken) return setError('Вставьте GitHub-токен')
    setBusy(true)
    const r = await window.api.settings.save({ user, owner: m[1], repo: m[2], token })
    setBusy(false)
    if (!r.ok) return setError(r.error.message)
    if (!r.value.isPrivate) useApp.getState().toast('info', 'Внимание: репозиторий данных публичный. Лучше сделать его приватным.')
    await load()
  }

  const init = async () => {
    setBusy(true)
    await run(window.api.sync.initRepo(), 'Репозиторий подготовлен, начальные данные записаны')
    setBusy(false)
    await load()
  }

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-[#111] p-6">
      <div className="w-[min(560px,100%)] rounded-2xl border border-line bg-bg p-8 shadow-2xl">
        <div className="font-serif text-[40px] font-semibold leading-none tracking-[0.28em]">AZH</div>
        <div className="mt-2 text-[12px] uppercase tracking-[0.14em] text-muted">Jacquemus · учёт шарфов</div>

        {needsInit ? (
          <div className="mt-8">
            <h2 className="text-[24px]">Репозиторий пуст</h2>
            <p className="mt-2 text-[14px] text-muted">
              В <b className="text-ink">{settings?.owner}/{settings?.repo}</b> ещё нет данных. Создать структуру файлов и записать начальную
              партию «Партия №1» (10 шарфов, 89 348,08 ₸)?
            </p>
            <div className="mt-6 flex gap-2">
              <Button variant="gold" onClick={init} disabled={busy}>
                {busy && <Loader2 className="animate-spin" />} Создать и засеять данные
              </Button>
              <Button variant="outline" onClick={() => useApp.setState({ sync: null, settings: { ...settings!, configured: false } })}>
                Другой репозиторий
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-4">
            <h2 className="text-[24px]">Первый запуск</h2>
            <Field label="Ваше имя" hint="Видно другим: «Сейчас работает …», и в истории изменений.">
              <div className="relative">
                <User className="absolute left-3 top-2.5 size-4 text-muted" />
                <Input className="pl-9" value={user} onChange={(e) => setUser(e.target.value)} placeholder="Айниддин" autoFocus />
              </div>
            </Field>
            <Field
              label="Репозиторий данных (владелец/имя)"
              hint="Приватный репозиторий GitHub, где хранятся данные. Может быть пустым — приложение само создаст файлы."
            >
              <div className="relative">
                <Database className="absolute left-3 top-2.5 size-4 text-muted" />
                <Input className="pl-9" value={repoFull} onChange={(e) => setRepoFull(e.target.value)} placeholder="ainiddin/jacquemus-data" />
              </div>
            </Field>
            <Field
              label="GitHub fine-grained token"
              hint={
                <>
                  Только этот репозиторий, разрешение <b>Contents: Read and write</b>. У каждого пользователя — свой токен. Хранится
                  зашифрованным средствами Windows.
                  {settings?.hasToken && ' Оставьте пустым, чтобы не менять сохранённый.'}
                </>
              }
            >
              <div className="relative">
                <KeyRound className="absolute left-3 top-2.5 size-4 text-muted" />
                <Input
                  className="pl-9 font-mono text-[13px]"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="github_pat_…"
                />
              </div>
            </Field>
            {error && <div className="rounded-lg border border-neg/30 bg-neg/5 px-3 py-2 text-[13px] text-neg">{error}</div>}
            <div className="mt-2">
              <Button variant="gold" onClick={connect} disabled={busy}>
                {busy && <Loader2 className="animate-spin" />} Подключиться
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
