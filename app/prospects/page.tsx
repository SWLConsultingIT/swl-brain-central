import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import { listJobs, type JobRow } from '@/lib/jobs/list'
import ClassifyButton from './classify-button'

export const dynamic = 'force-dynamic'

// Mismas columnas que el Notion CRM de SWL, mismo orden y mismos emojis.
type Column = {
  status: string
  label: string
  emoji: string
  accent: string // borde/header de la columna
}

const COLUMNS: Column[] = [
  { status: 'new',              label: 'Prospect',          emoji: '🧲', accent: 'border-zinc-700' },
  { status: 'prequalified',     label: 'Prequalified',      emoji: '🔒', accent: 'border-amber-700/60' },
  { status: 'qualified',        label: 'Qualified',         emoji: '✅', accent: 'border-emerald-700/60' },
  { status: 'proposal_drafted', label: 'Proposal',          emoji: '👀', accent: 'border-blue-700/60' },
  { status: 'ready_to_send',    label: 'Ready to Send',     emoji: '📤', accent: 'border-violet-700/60' },
  { status: 'sent',             label: 'Sent',              emoji: '📝', accent: 'border-violet-500/60' },
  { status: 'discarded',        label: 'Discarded',         emoji: '💀', accent: 'border-zinc-800' },
  { status: 'discarded_review', label: 'Revisar Discarded', emoji: '🔁', accent: 'border-orange-700/60' },
]

function shortUpworkUrl(link: string | null, upworkId: string | null): string {
  if (!link) return ''
  const id = upworkId ?? ''
  const last5 = id.slice(-5)
  return last5 ? `upwork.com/fre…${last5}/` : 'upwork.com/…'
}

function Ticket({ value, currency }: { value: number | null; currency: string | null }) {
  if (value == null) return null
  const cur = currency ?? 'USD'
  const ok = cur === 'USD' && value >= 40
  return (
    <span
      className={`inline-flex items-center text-[10px] tabular-nums px-1.5 py-0.5 rounded ${
        ok ? 'bg-emerald-900/40 text-emerald-200' : 'bg-zinc-800 text-zinc-400'
      }`}
    >
      {cur === 'USD' ? '$' : cur} {value}
    </span>
  )
}

function Card({ job }: { job: JobRow }) {
  return (
    <div className="bg-zinc-900/60 hover:bg-zinc-900 transition border border-white/5 rounded-lg p-3 space-y-2">
      <div className="text-sm font-medium leading-snug">{job.title}</div>

      {job.link && (
        <a
          href={job.link}
          target="_blank"
          rel="noreferrer"
          className="block text-[11px] opacity-50 hover:opacity-100 truncate"
        >
          {shortUpworkUrl(job.link, job.upwork_id)}
        </a>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Ticket value={job.ticket} currency={job.ticket_currency} />
        {job.classifier_score != null && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded tabular-nums ${
              job.classifier_score >= 70
                ? 'bg-emerald-900/40 text-emerald-200'
                : job.classifier_score >= 40
                  ? 'bg-amber-900/40 text-amber-200'
                  : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            score {job.classifier_score}
          </span>
        )}
        {job.classifier_area && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-200">
            {job.classifier_area}
          </span>
        )}
      </div>

      {job.classifier_reason && (
        <p className="text-[11px] opacity-60 italic leading-snug line-clamp-3">"{job.classifier_reason}"</p>
      )}

      {(job.status === 'new' || job.status === 'prequalified') && (
        <div className="pt-1">
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
    <main className="min-h-screen px-6 py-8">
      <header className="flex items-baseline justify-between mb-6 max-w-[2400px] mx-auto">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CRM UPWORK</h1>
          <p className="text-xs opacity-50 mt-1">{jobs.length} jobs · Por estado</p>
        </div>
        <Link href="/health" className="text-xs opacity-50 hover:opacity-100">/health</Link>
      </header>

      {error && <p className="text-sm text-red-400 mb-6">Error: {error}</p>}

      <div className="overflow-x-auto -mx-6 px-6 pb-4">
        <div className="flex gap-4 min-w-max">
          {COLUMNS.map(col => {
            const items = byStatus.get(col.status) ?? []
            return (
              <div key={col.status} className="w-72 flex-shrink-0">
                <div className={`flex items-center justify-between border-b-2 ${col.accent} pb-2 mb-3`}>
                  <h2 className="text-sm font-medium">
                    <span className="mr-1.5">{col.emoji}</span>
                    {col.label}
                  </h2>
                  <span className="text-xs opacity-50 tabular-nums">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map(j => <Card key={j.id} job={j} />)}
                  {items.length === 0 && (
                    <div className="text-[11px] opacity-30 italic px-2 py-3">—</div>
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
