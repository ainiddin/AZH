import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useApp } from '@/store/app'
import { Header } from '@/components/Header'
import { Banners } from '@/components/Banners'
import { ConfirmDialog, Toasts } from '@/components/Overlays'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SetupWizard } from '@/pages/SetupWizard'
import { Overview } from '@/pages/Overview'
import { Sales } from '@/pages/Sales'
import { Stock } from '@/pages/Stock'
import { Purchases } from '@/pages/Purchases'
import { Expenses } from '@/pages/Expenses'
import { History } from '@/pages/History'
import { Settings } from '@/pages/Settings'
import { ImportDialog } from '@/pages/ImportDialog'

const PAGES = {
  overview: Overview,
  sales: Sales,
  stock: Stock,
  purchases: Purchases,
  expenses: Expenses,
  history: History,
  settings: Settings
}

export function App() {
  const { ready, settings, sync, page, load } = useApp()

  useEffect(() => {
    load()
  }, [load])

  let body: React.ReactNode
  if (!ready) body = <Splash text="Загрузка…" />
  else if (!settings?.configured || sync?.needsInit) body = <SetupWizard />
  else if (!sync) body = <Splash text="Подключение к GitHub…" />
  else if (!sync.remote && !sync.draft)
    body = <Splash text={sync.online ? 'Загрузка данных…' : 'Нет связи с GitHub и нет сохранённой копии данных. Проверьте интернет.'} spin={sync.online} />
  else {
    const Page = PAGES[page]
    body = (
      <div className="flex h-full flex-col">
        <Header />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-[1220px] px-6 pb-16 pt-6">
            <Banners />
            <Page />
          </div>
        </main>
        <ImportDialog />
      </div>
    )
  }

  return (
    <TooltipProvider>
      {body}
      <Toasts />
      <ConfirmDialog />
    </TooltipProvider>
  )
}

function Splash({ text, spin = true }: { text: string; spin?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#111] text-white">
      <div className="font-serif text-[52px] font-semibold tracking-[0.3em]">AZH</div>
      <div className="flex items-center gap-2 text-[13px] text-[#bdb5a6]">
        {spin && <Loader2 className="size-4 animate-spin" />}
        {text}
      </div>
    </div>
  )
}
