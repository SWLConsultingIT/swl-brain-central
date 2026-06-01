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
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Health check</h1>
      <p className="text-sm opacity-60 mb-10">Brain Central · Supabase connectivity</p>

      <div className="space-y-3">
        <Row label="business_units" value={data.business_units} error={data.errors.business_units} />
        <Row label="proposals" value={data.proposals} error={data.errors.proposals} />
        <Row label="prospects" value={data.prospects} error={data.errors.prospects} />
        <Row label="jobs" value={data.jobs} error={data.errors.jobs} />
        <Row label="job_decisions" value={data.job_decisions} error={data.errors.job_decisions} />
      </div>

      <p className="text-xs opacity-50 mt-10">
        {hasErrors ? '⚠ at least one query failed' : '✓ all queries succeeded'}
      </p>
    </main>
  )
}

function Row({ label, value, error }: { label: string; value: number | null; error: string | null }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-2">
      <span className="text-sm opacity-80">{label}</span>
      {error ? (
        <span className="text-sm text-red-400">{error}</span>
      ) : (
        <span className="text-sm tabular-nums font-medium">{value?.toLocaleString() ?? '—'}</span>
      )}
    </div>
  )
}
