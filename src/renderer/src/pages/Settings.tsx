import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fmtKzt } from '@shared/util'
import { mutate, useApp, useData, useEditable } from '@/store/app'
import { num } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { PageTitle } from '@/components/common'

export function Settings() {
  const data = useData()!
  const editable = useEditable()
  const settings = useApp((s) => s.settings)!
  const sync = useApp((s) => s.sync)!
  const load = useApp((s) => s.load)
  const toast = useApp((s) => s.toast)

  const [target, setTarget] = useState(String(data.config.targetPrice))
  const [min, setMin] = useState(String(data.config.minPrice))
  useEffect(() => {
    setTarget(String(data.config.targetPrice))
    setMin(String(data.config.minPrice))
  }, [data.config.targetPrice, data.config.minPrice])

  const [user, setUser] = useState(settings.user)
  const [repo, setRepo] = useState(`${settings.owner}/${settings.repo}`)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState('')
  useEffect(() => {
    window.api.app.version().then((r) => r.ok && setVersion(r.value))
  }, [])

  const t = num(target)
  const m = num(min)
  const pricesValid = t > 0 && m > 0 && m <= t

  const savePrices = () =>
    mutate((d) => (d.config = { targetPrice: t, minPrice: m }), 'Цены изменены (не забудьте сохранить)')

  const saveConnection = async () => {
    const [owner, name] = repo.trim().split('/')
    if (!owner || !name) return toast('err', 'Репозиторий в формате владелец/имя')
    setBusy(true)
    const r = await window.api.settings.save({ user, owner, repo: name, token })
    setBusy(false)
    if (!r.ok) return toast('err', r.error.message)
    setToken('')
    toast('ok', 'Подключение сохранено')
    await load()
  }

  return (
    <div className="max-w-[760px]">
      <PageTitle>Настройки</PageTitle>

      <Card className="mb-5">
        <CardTitle>Цены (общие для всех)</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Целевая цена, ₸" hint="Для сценариев и точки безубыточности">
            <Input value={target} onChange={(e) => setTarget(e.target.value)} disabled={!editable} />
          </Field>
          <Field label="Минимальная цена, ₸" hint="Ниже — предупреждение при продаже">
            <Input value={min} onChange={(e) => setMin(e.target.value)} disabled={!editable} />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button
            onClick={savePrices}
            disabled={!editable || !pricesValid || (t === data.config.targetPrice && m === data.config.minPrice)}
          >
            Применить
          </Button>
          {!editable && <span className="text-[13px] text-muted">Изменить можно в активном режиме</span>}
          {editable && !pricesValid && <span className="text-[13px] text-neg">Минимальная цена не может быть больше целевой</span>}
          {editable && pricesValid && (
            <span className="text-[13px] text-muted">
              сейчас: {fmtKzt(data.config.targetPrice)} / {fmtKzt(data.config.minPrice)}
            </span>
          )}
        </div>
      </Card>

      <Card className="mb-5">
        <CardTitle>Подключение</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ваше имя">
            <Input value={user} onChange={(e) => setUser(e.target.value)} disabled={sync.mode === 'active'} />
          </Field>
          <Field label="Репозиторий данных">
            <Input value={repo} onChange={(e) => setRepo(e.target.value)} disabled={sync.mode === 'active'} />
          </Field>
          <Field label="Новый токен" hint="Оставьте пустым, чтобы не менять" className="col-span-2">
            <Input
              type="password"
              className="font-mono text-[13px]"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_…"
              disabled={sync.mode === 'active'}
            />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={saveConnection} disabled={busy || sync.mode === 'active'}>
            {busy && <Loader2 className="animate-spin" />} Проверить и сохранить
          </Button>
          {sync.mode === 'active' && <span className="text-[13px] text-muted">Сначала сохраните работу и выйдите из активного режима</span>}
        </div>
      </Card>

      <Card>
        <CardTitle>О программе</CardTitle>
        <div className="grid grid-cols-[160px_1fr] gap-y-1 text-[13px]">
          <span className="text-muted">Версия</span>
          <span>AZH {version}</span>
          <span className="text-muted">Устройство</span>
          <span className="font-mono text-[12px]">{settings.deviceId}</span>
          <span className="text-muted">Репозиторий</span>
          <span>
            {settings.owner}/{settings.repo}
          </span>
        </div>
      </Card>
    </div>
  )
}
