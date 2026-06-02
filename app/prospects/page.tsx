import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import { listJobs, type JobRow } from '@/lib/jobs/list'
import ClassifyButton from './classify-button'
import CoverLetterButton from './cover-letter-button'

export const dynamic = 'force-dynamic'

type Column = {
  status: string
  label: string
  dot: string
  bg: string
  fg: string
}

const COLUMNS: Column[] = [
  { status: 'new',              label: 'Prospect',          dot: 'bg-slate',       bg: 'bg-slate-bg',       fg: 'text-slate' },
  { status: 'prequalified',     label: 'Prequalified',      dot: 'bg-warning',     bg: 'bg-warning-bg',     fg: 'text-warning' },
  { status: 'qualified',        label: 'Qualified',         dot: 'bg-accent',      bg: 'bg-accent-bg',      fg: 'text-accent-fg' },
  { status: 'proposal_drafted', label: 'Proposal',          dot: 'bg-info',        bg: 'bg-info-bg',        fg: 'text-info' },
  { status: 'ready_to_send',    label: 'Ready to Send',     dot: 'bg-violet',      bg: 'bg-violet-bg',      fg: 'text-violet' },
  { status: 'sent',             label: 'Sent',              dot: 'bg-fuchsia',     bg: 'bg-fuchsia-bg',     fg: 'text-fuchsia' },
  { status: 'discarded',        label: 'Discarded',         dot: 'bg-fg-subtle',   bg: 'bg-bg',             fg: 'text-fg-subtle' },
  { status: 'discarded_review', label: 'Revisar Discarded', dot: 'bg-orange',      bg: 'bg-orange-bg',      fg: 'text-orange' },
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
      className={`inline-flex items-center text-xs font-semibold tabular-nums px-2 py-0.5 rounded-md ${
        ok ? 'bg-accent-bg text-accent-fg' : 'bg-bg text-fg-subtle border border-border'
      }`}
    >
      {cur === 'USD' ? '$' : `${cur} `}
      {value}
    </span>
  )
}

function ScoreBadge({ value }: { value: number }) {
  const tone =
    value >= 70
      ? 'bg-accent-bg text-accent-fg'
      : value >= 40
        ? 'bg-warning-bg text-warning'
        : 'bg-bg text-fg-subtle border border-border'
  return (
    <span className={`text-xs font-semibold tabular-nums px-2 py-0.5 rounded-md ${tone}`}>
      {value}
    </span>
  )
}

function AreaBadge({ name }: { name: string }) {
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-info-bg text-info">
      {name}
    </span>
  )
}

function Card({ job }: { job: JobRow }) {
  return (
    <div className="group bg-surface hover:bg-surface-hover border border-border hover:border-border-strong rounded-xl p-4 shadow-soft hover:shadow-soft-hover transition-all duration-150 cursor-default">
      <h3 className="text-[14px] font-semibold text-fg leading-snug line-clamp-3 mb-2">
        {job.title}
      </h3>

      {job.link && (
        <a
          href={job.link}
          target="_blank"
          rel="noreferrer"
          className="block text-[11px] font-mono text-fg-subtle hover:text-fg-muted transition truncate mb-3"
        >
          {shortUpworkUrl(job.link, job.upwork_id)}
        </a>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <Ticket value={job.ticket} currency={job.ticket_currency} />
        {job.classifier_score != null && <ScoreBadge value={job.classifier_score} />}
        {job.classifier_area && <AreaBadge name={job.classifier_area} />}
      </div>

      {job.classifier_reason && (
        <blockquote className="text-[12px] text-fg-muted leading-relaxed mt-3 pl-2.5 border-l-2 border-border-strong italic">
          {job.classifier_reason}
        </blockquote>
      )}

      {(job.status === 'new' || job.status === 'prequalified') && (
        <div className="mt-3 pt-3 border-t border-border">
          <ClassifyButton jobId={job.id} status={job.status} />
        </div>
      )}

      {job.status === 'qualified' && (
        <div className="mt-3 pt-3 border-t border-border">
          <CoverLetterButton jobId={job.id} status={job.status} />
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
    <main className="min-h-screen bg-bg">
      <header className="bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/60 border-b border-border sticky top-0 z-10">
        <div className="px-8 py-4 flex items-center justify-between max-w-[2400px] mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="size-7 rounded-md bg-fg flex items-center justify-center text-bg font-bold text-[13px] tracking-tighter">
                B
              </div>
              <div>
                <h1 className="text-[15px] font-bold tracking-tight text-fg group-hover:text-accent-fg transition">
                  Brain Central
                </h1>
              </div>
            </Link>
            <span className="text-fg-subtle text-sm">/</span>
            <span className="text-fg-muted text-sm font-medium">Prospects</span>
          </div>

          <div className="flex items-center gap-5 text-[13px]">
            <span className="text-fg-muted">
              <span className="font-semibold text-fg tabular-nums">{jobs.length}</span> jobs
            </span>
            <Link
              href="/health"
              className="text-fg-muted hover:text-fg transition font-medium"
            >
              Health
            </Link>
          </div>
        </div>
      </header>

      {error && (
        <div className="px-8 py-3 bg-destructive-bg border-b border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="kanban-scroll overflow-x-auto px-8 py-8">
        <div className="flex gap-5 min-w-max">
          {COLUMNS.map(col => {
            const items = byStatus.get(col.status) ?? []
            return (
              <div key={col.status} className="w-[300px] flex-shrink-0">
                <div className="flex items-center justify-between px-1 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`size-1.5 rounded-full ${col.dot}`} />
                    <h2 className={`text-[12px] font-bold tracking-wide uppercase ${col.fg}`}>
                      {col.label}
                    </h2>
                  </div>
                  <span className={`text-[11px] tabular-nums font-bold px-1.5 py-0.5 rounded ${col.bg} ${col.fg}`}>
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {items.map(j => (
                    <Card key={j.id} job={j} />
                  ))}
                  {items.length === 0 && (
                    <div className="text-[11px] text-fg-subtle px-3 py-6 text-center border border-dashed border-border rounded-lg">
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
