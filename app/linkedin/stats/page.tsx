import Link from 'next/link'
import LogoutButton from '@/app/logout-button'
import BrandSwitch from '@/app/brand-switch'
import { getServerClient } from '@/lib/supabase/server'
import { getLinkedInSent } from '@/lib/stats/linkedin-sent'
import StatsView from '@/app/stats/stats-view'

export const dynamic = 'force-dynamic'

export default async function LinkedInStatsPage() {
  const supabase = getServerClient()
  let rows: Awaited<ReturnType<typeof getLinkedInSent>> = []
  let error: string | null = null
  try {
    rows = await getLinkedInSent(supabase)
  } catch (e) {
    error = (e as Error).message
  }

  return (
    <main className="min-h-screen bg-bg">
      <header className="bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70 border-b border-border sticky top-0 z-10">
        <div className="px-8 py-3.5 flex items-center justify-between max-w-[2400px] mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <h1 className="text-[14px] font-semibold tracking-tight text-fg group-hover:text-fg-muted transition-colors">CRM Jobs</h1>
            </Link>
            <span className="text-fg-subtle text-[13px]" aria-hidden>/</span>
            <span className="text-fg-muted text-[13px] font-medium">LinkedIn · Stats</span>
          </div>
          <div className="flex items-center gap-5 text-[13px]">
            <BrandSwitch />
            <Link href="/linkedin" className="text-fg-muted hover:text-fg transition-colors font-medium">Jobs</Link>
            <Link href="/linkedin/dashboard" className="text-fg-muted hover:text-fg transition-colors font-medium">Dashboard</Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      {error && (
        <div className="px-8 py-3 bg-destructive-bg border-b border-destructive/20 text-destructive text-sm">
          {error} — ¿corriste la migración <code>0033_linkedin_jobs.sql</code>?
        </div>
      )}

      <StatsView rows={rows} variant="linkedin" />
    </main>
  )
}
