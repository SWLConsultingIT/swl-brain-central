import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import { listJobs, type JobRow } from '@/lib/jobs/list'
import Board from './board'
import LogoutButton from '@/app/logout-button'

export const dynamic = 'force-dynamic'

export default async function ProspectsPage() {
  const supabase = getServerClient()
  let jobs: JobRow[] = []
  let error: string | null = null
  try {
    jobs = await listJobs(supabase)
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
            <span className="text-fg-muted text-[13px] font-medium">Prospects</span>
          </div>

          <div className="flex items-center gap-6 text-[13px]">
            <span className="text-fg-muted font-mono tabular-nums">
              <span className="font-semibold text-fg">{jobs.length}</span>
              <span className="text-fg-subtle ml-1">jobs</span>
            </span>
            <Link
              href="/stats"
              className="text-fg-muted hover:text-fg transition-colors font-medium"
            >
              Stats
            </Link>
            <Link
              href="/dashboard"
              className="text-fg-muted hover:text-fg transition-colors font-medium"
            >
              Dashboard
            </Link>
            <a
              href="/api/jobs/export"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-fg text-bg font-medium hover:bg-fg-muted transition-colors"
              title="Descargar todos los jobs en Excel"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M8 1.75v8.5M4.75 7l3.25 3.25L11.25 7" />
                <path d="M2.75 13.25h10.5" />
              </svg>
              Exportar Excel
            </a>
            <LogoutButton />
          </div>
        </div>
      </header>

      {error && (
        <div className="px-8 py-3 bg-destructive-bg border-b border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      <Board jobs={jobs} businessUnits={businessUnits} />
    </main>
  )
}
