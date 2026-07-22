import Link from 'next/link'
import LogoutButton from '@/app/logout-button'
import { getServerClient } from '@/lib/supabase/server'
import { getSentProposals } from '@/lib/stats/sent'
import StatsView from './stats-view'

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const supabase = getServerClient()
  let rows: Awaited<ReturnType<typeof getSentProposals>> = []
  let error: string | null = null
  try {
    rows = await getSentProposals(supabase)
  } catch (e) {
    error = (e as Error).message
  }

  return (
    <main className="min-h-screen bg-bg">
      <header className="bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70 border-b border-border sticky top-0 z-10">
        <div className="px-8 py-3.5 flex items-center justify-between max-w-[2400px] mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="size-6 rounded-md bg-fg flex items-center justify-center text-bg font-bold text-[11px] tracking-tighter">B</div>
              <h1 className="text-[14px] font-semibold tracking-tight text-fg group-hover:text-fg-muted transition-colors">Upwork Brain</h1>
            </Link>
            <span className="text-fg-subtle text-[13px]" aria-hidden>/</span>
            <span className="text-fg-muted text-[13px] font-medium">Stats</span>
          </div>
          <div className="flex items-center gap-6 text-[13px]">
            <Link href="/prospects" className="text-fg-muted hover:text-fg transition-colors font-medium">Prospects</Link>
            <Link href="/dashboard" className="text-fg-muted hover:text-fg transition-colors font-medium">Dashboard</Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      {error && (
        <div className="px-8 py-3 bg-destructive-bg border-b border-destructive/20 text-destructive text-sm">{error}</div>
      )}

      <StatsView rows={rows} />
    </main>
  )
}
