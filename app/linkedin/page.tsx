import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import { listLinkedInJobs, type LinkedInJobRow } from '@/lib/linkedin/list'
import Board from './board'
import LogoutButton from '@/app/logout-button'

export const dynamic = 'force-dynamic'

export default async function LinkedInPage() {
  const supabase = getServerClient()
  let jobs: LinkedInJobRow[] = []
  let error: string | null = null
  try {
    jobs = await listLinkedInJobs(supabase)
  } catch (e) {
    error = (e as Error).message
  }

  const { data: bus } = await supabase
    .from('business_units')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
  const businessUnits = (bus ?? []) as { id: string; name: string }[]

  return (
    <main className="min-h-screen bg-bg">
      <header className="bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70 border-b border-border sticky top-0 z-10">
        <div className="px-8 py-3.5 flex items-center justify-between max-w-[2400px] mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="size-6 rounded-md bg-fg flex items-center justify-center text-bg font-bold text-[11px] tracking-tighter">
                B
              </div>
              <h1 className="text-[14px] font-semibold tracking-tight text-fg group-hover:text-fg-muted transition-colors">
                Upwork Brain
              </h1>
            </Link>
            <span className="text-fg-subtle text-[13px]" aria-hidden>/</span>
            <span className="text-fg-muted text-[13px] font-medium">LinkedIn</span>
          </div>

          <div className="flex items-center gap-6 text-[13px]">
            <span className="text-fg-muted font-mono tabular-nums">
              <span className="font-semibold text-fg">{jobs.length}</span>
              <span className="text-fg-subtle ml-1">jobs</span>
            </span>
            <Link href="/prospects" className="text-fg-muted hover:text-fg transition-colors font-medium">
              Upwork
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <LogoutButton />
          </div>
        </div>
      </header>

      {error && (
        <div className="px-8 py-3 bg-destructive-bg border-b border-destructive/20 text-destructive text-sm">
          {error} — ¿corriste la migración <code>0033_linkedin_jobs.sql</code>?
        </div>
      )}

      <Board jobs={jobs} businessUnits={businessUnits} />
    </main>
  )
}
