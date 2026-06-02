import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function getCounts() {
  const supabase = getServerClient()

  const [bu, proposals, prospects, jobs, jobDecisions] = await Promise.all([
    supabase.from('business_units').select('*', { count: 'exact', head: true }),
    supabase.from('proposals').select('*', { count: 'exact', head: true }),
    supabase.from('prospects').select('*', { count: 'exact', head: true }),
    supabase.from('jobs').select('*', { count: 'exact', head: true }),
    supabase.from('job_decisions').select('*', { count: 'exact', head: true }),
  ])

  return {
    business_units: bu.count ?? null,
    proposals: proposals.count ?? null,
    prospects: prospects.count ?? null,
    jobs: jobs.count ?? null,
    job_decisions: jobDecisions.count ?? null,
    errors: {
      business_units: bu.error?.message ?? null,
      proposals: proposals.error?.message ?? null,
      prospects: prospects.error?.message ?? null,
      jobs: jobs.error?.message ?? null,
      job_decisions: jobDecisions.error?.message ?? null,
    },
  }
}

export default async function HealthPage() {
  const data = await getCounts()
  const hasErrors = Object.values(data.errors).some(Boolean)

  return (
    <main className="min-h-screen px-6 py-16 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <div className={`size-2 rounded-full ${hasErrors ? 'bg-destructive' : 'bg-accent'}`} />
        <h1 className="text-2xl font-bold tracking-tight">Health check</h1>
      </div>
      <p className="text-sm text-muted-fg mb-10">Brain Central · Supabase connectivity</p>

      <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
        <Row label="business_units" value={data.business_units} error={data.errors.business_units} />
        <Row label="proposals" value={data.proposals} error={data.errors.proposals} />
        <Row label="prospects" value={data.prospects} error={data.errors.prospects} />
        <Row label="jobs" value={data.jobs} error={data.errors.jobs} />
        <Row label="job_decisions" value={data.job_decisions} error={data.errors.job_decisions} />
      </div>

      <p className="text-xs text-muted-fg mt-6">
        {hasErrors ? '⚠ at least one query failed' : '✓ all queries succeeded'}
      </p>
    </main>
  )
}

function Row({ label, value, error }: { label: string; value: number | null; error: string | null }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <span className="text-sm font-medium text-muted-fg font-mono">{label}</span>
      {error ? (
        <span className="text-sm text-destructive">{error}</span>
      ) : (
        <span className="text-sm tabular-nums font-semibold text-fg">{value?.toLocaleString() ?? '—'}</span>
      )}
    </div>
  )
}
