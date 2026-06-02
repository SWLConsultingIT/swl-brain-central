import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import { listJobs, type JobRow } from '@/lib/jobs/list'
import ClassifyButton from './classify-button'

export const dynamic = 'force-dynamic'

type Column = {
  status: string
  label: string
  emoji: string
  dot: string // tailwind bg-* for the dot indicator
}

const COLUMNS: Column[] = [
  { status: 'new',              label: 'Prospect',          emoji: '🧲', dot: 'bg-slate-500' },
  { status: 'prequalified',     label: 'Prequalified',      emoji: '🔒', dot: 'bg-amber-500' },
  { status: 'qualified',        label: 'Qualified',         emoji: '✅', dot: 'bg-emerald-500' },
  { status: 'proposal_drafted', label: 'Proposal',          emoji: '👀', dot: 'bg-sky-500' },
  { status: 'ready_to_send',    label: 'Ready to Send',     emoji: '📤', dot: 'bg-violet-500' },
  { status: 'sent',             label: 'Sent',              emoji: '📝', dot: 'bg-fuchsia-500' },
  { status: 'discarded',        label: 'Discarded',         emoji: '💀', dot: 'bg-zinc-700' },
  { status: 'discarded_review', label: 'Revisar Discarded', emoji: '🔁', dot: 'bg-orange-500' },
]

function shortUpworkUrl(link: string | null, upworkId: string | null): string {
  if (!link) return ''
  const last5 = (upworkId ?? '').slice(-5)
  return last5 ? `upwork.com/fre…${last5}/` : 'upwork.com/…'
}

function Ticket({ value, currency }: { value: number | null; currency: string | null }) {
  if (value == null) return null
  const cur = currency ?? 'USD'
  const ok = cur === 'USD' && value >= 40
  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium tabular-nums px-2 py-0.5 rounded-md ${
        ok
          ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20'
          : 'bg-zinc-800/60 text-muted-fg ring-1 ring-border'
      }`}
    >
      {cur === 'USD' ? '$' : cur}
      {value}
    </span>
  )
}

function ScoreBadge({ value }: { value: number }) {
  const tone =
    value >= 70
      ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20'
      : value >= 40
        ? 'bg-amber-500/10 text-amber-300 ring-amber-500/20'
        : 'bg-zinc-800/60 text-muted-fg ring-border'
  return (
    <span className={`text-[11px] font-medium tabular-nums px-2 py-0.5 rounded-md ring-1 ${tone}`}>
      {value}
    </span>
  )
}

function AreaBadge({ name }: { name: string }) {
  return (
    <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-info/10 text-info ring-1 ring-info/20">
      {name}
    </span>
  )
}

function Card({ job }: { job: JobRow }) {
  return (
    <div className="group bg-card hover:bg-card-hover border border-border hover:border-border-hover rounded-xl p-4 shadow-card hover:shadow-card-hover transition-all duration-150">
      <div className="text-[13px] font-semibold leading-snug text-fg line-clamp-3">{job.title}</div>

      {job.link && (
        <a
          href={job.link}
          target="_blank"
          rel="noreferrer"
          className="block text-[11px] text-muted-fg/70 hover:text-muted-fg mt-2 truncate font-mono"
        >
          {shortUpworkUrl(job.link, job.upwork_id)}
        </a>
      )}

      <div className="flex items-center gap-1.5 flex-wrap mt-3">
        <Ticket value={job.ticket} currency={job.ticket_currency} />
        {job.classifier_score != null && <ScoreBadge value={job.classifier_score} />}
        {job.classifier_area && <AreaBadge name={job.classifier_area} />}
      </div>

      {job.classifier_reason && (
        <p className="text-[12px] text-muted-fg leading-snug mt-3 italic line-clamp-3">
          “{job.classifier_reason}”
        </p>
      )}

      {(job.status === 'new' || job.status === 'prequalified') && (
        <div className="mt-3 pt-3 border-t border-border">
          <ClassifyButton jobId={job.id} status={job.status} />
        </div>
      )}
    </div>
  )
}

export default async function ProspectsPage() {
  const supabase = getServerClient()
  let jobs: JobRow[] = []
  let error: string | null = null
  try {
    jobs = await listJobs(supabase)
  } catch (e) {
    error = (e as Error).message
  }

  const byStatus = new Map<string, JobRow[]>()
  for (const c of COLUMNS) byStatus.set(c.status, [])
  for (const j of jobs) {
    if (byStatus.has(j.status)) byStatus.get(j.status)!.push(j)
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-border bg-bg/80 backdrop-blur supports-[backdrop-filter]:bg-bg/60 sticky top-0 z-10">
        <div className="px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="size-8 rounded-lg bg-gradient-to-br from-emerald-500 to-info flex items-center justify-center text-bg font-bold text-sm">
              B
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">Brain Central</h1>
              <p className="text-[11px] text-muted-fg">CRM UPWORK · Por estado</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-muted-fg">
            <span className="tabular-nums">{jobs.length} jobs</span>
            <Link href="/health" className="hover:text-fg transition">
              /health
            </Link>
          </div>
        </div>
      </header>

      {error && (
        <div className="px-8 py-4 bg-destructive/10 border-b border-destructive/30 text-destructive text-sm">
          Error: {error}
        </div>
      )}

      <div className="kanban-scroll overflow-x-auto px-8 py-6">
        <div className="flex gap-4 min-w-max">
          {COLUMNS.map(col => {
            const items = byStatus.get(col.status) ?? []
            return (
              <div key={col.status} className="w-80 flex-shrink-0">
                <div className="flex items-center justify-between px-1 pb-3 mb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${col.dot}`} />
                    <h2 className="text-[13px] font-semibold tracking-tight">{col.label}</h2>
                    <span className="text-[11px] text-muted-fg/70">{col.emoji}</span>
                  </div>
                  <span className="text-[11px] text-muted-fg tabular-nums font-medium px-1.5 py-0.5 bg-muted rounded">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {items.map(j => (
                    <Card key={j.id} job={j} />
                  ))}
                  {items.length === 0 && (
                    <div className="text-[11px] text-muted-fg/40 italic px-3 py-8 text-center border border-dashed border-border rounded-lg">
                      empty
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
