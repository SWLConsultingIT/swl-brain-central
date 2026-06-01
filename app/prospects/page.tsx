import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import { listJobs, type JobRow } from '@/lib/jobs/list'
import ClassifyButton from './classify-button'

export const dynamic = 'force-dynamic'

const STATUS_STYLE: Record<string, string> = {
  new:              'bg-zinc-700 text-zinc-100',
  prequalified:     'bg-amber-900/40 text-amber-200 border border-amber-700/40',
  qualified:        'bg-emerald-900/40 text-emerald-200 border border-emerald-700/40',
  proposal_drafted: 'bg-blue-900/40 text-blue-200 border border-blue-700/40',
  ready_to_send:    'bg-violet-900/40 text-violet-200 border border-violet-700/40',
  sent:             'bg-violet-700 text-white',
  discarded:        'bg-zinc-800 text-zinc-500 line-through',
  discarded_review: 'bg-orange-900/40 text-orange-200 border border-orange-700/40',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded ${STATUS_STYLE[status] ?? 'bg-zinc-700'}`}>
      {status}
    </span>
  )
}

function Ticket({ value, currency }: { value: number | null; currency: string | null }) {
  if (value == null) return <span className="opacity-40">—</span>
  const cur = currency ?? 'USD'
  const bad = cur !== 'USD' || value < 40
  return (
    <span className={`tabular-nums ${bad ? 'text-red-400' : 'text-emerald-300'}`}>
      {cur === 'USD' ? '$' : cur} {value}
    </span>
  )
}

function Score({ value }: { value: number | null }) {
  if (value == null) return <span className="opacity-40">—</span>
  const color = value >= 70 ? 'text-emerald-300' : value >= 40 ? 'text-amber-300' : 'text-zinc-400'
  return <span className={`tabular-nums font-medium ${color}`}>{value}</span>
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

  const byStatus = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <main className="min-h-screen px-6 py-12 max-w-6xl mx-auto">
      <header className="flex items-baseline justify-between mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Prospects</h1>
        <Link href="/health" className="text-xs opacity-50 hover:opacity-100">/health</Link>
      </header>
      <p className="text-sm opacity-60 mb-8">
        Jobs scrapeados de Upwork. State machine: <span className="opacity-80">new → prequalified → qualified → proposal_drafted → ready_to_send → sent</span>
      </p>

      <div className="flex flex-wrap gap-2 mb-8 text-xs">
        {Object.entries(byStatus).map(([s, n]) => (
          <div key={s} className="flex items-center gap-1.5">
            <StatusPill status={s} />
            <span className="tabular-nums opacity-70">{n}</span>
          </div>
        ))}
        {jobs.length === 0 && !error && (
          <span className="opacity-50">No jobs yet. Run <code className="opacity-70">node --env-file=.env.local supabase/scripts/seed-sample-jobs.ts</code></span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400 mb-6">Error: {error}</p>
      )}

      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wide opacity-50">
            <tr className="border-b border-white/10">
              <th className="text-left font-medium py-2 px-2">Job</th>
              <th className="text-right font-medium py-2 px-2">Ticket</th>
              <th className="text-left font-medium py-2 px-2">Status</th>
              <th className="text-right font-medium py-2 px-2">Score</th>
              <th className="text-left font-medium py-2 px-2">Area</th>
              <th className="text-left font-medium py-2 px-2">Reason</th>
              <th className="text-right font-medium py-2 px-2 w-44">Action</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id} className="border-b border-white/5 align-top">
                <td className="py-3 px-2">
                  <div className="font-medium leading-snug">{j.title}</div>
                  <div className="text-[10px] opacity-40 mt-0.5 tabular-nums">
                    {j.industry ? `${j.industry} · ` : ''}
                    {j.country ?? ''}
                    {j.upwork_id ? ` · ${j.upwork_id.slice(-8)}` : ''}
                  </div>
                </td>
                <td className="py-3 px-2 text-right whitespace-nowrap">
                  <Ticket value={j.ticket} currency={j.ticket_currency} />
                </td>
                <td className="py-3 px-2"><StatusPill status={j.status} /></td>
                <td className="py-3 px-2 text-right"><Score value={j.classifier_score} /></td>
                <td className="py-3 px-2 text-xs opacity-80">{j.classifier_area ?? <span className="opacity-30">—</span>}</td>
                <td className="py-3 px-2 text-xs opacity-70 max-w-[280px]">{j.classifier_reason ?? <span className="opacity-30">—</span>}</td>
                <td className="py-3 px-2 text-right">
                  <ClassifyButton jobId={j.id} status={j.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
