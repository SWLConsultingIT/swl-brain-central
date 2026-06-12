import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 60  // refresh server-side every 60s

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function ago(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < HOUR_MS) return `${Math.round(ms / 60_000)} min ago`
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)}h ago`
  return `${Math.round(ms / DAY_MS)}d ago`
}

function fmt(n: number | null): string {
  return n == null ? '—' : n.toLocaleString()
}

async function loadDashboardData() {
  const supabase = getServerClient()
  const now = new Date()
  const since24h = new Date(now.getTime() - DAY_MS).toISOString()
  const since7d = new Date(now.getTime() - 7 * DAY_MS).toISOString()

  const [
    last24h,
    last7d,
    lastIngest,
    lastClassif,
    lastCover,
    stuckPreq,
    stuckQual,
    stuckReview,
    statusBreakdown,
    recentCoverLetters,
    recentClassifications,
    buCards,
    proposalsTotal,
    proposalsWithCover,
  ] = await Promise.all([
    // jobs in last 24h with classifier + cover data
    supabase
      .from('jobs')
      .select('id, status, classifier_match, classifier_run_at, cover_letter_draft, classifier_area, business_unit_id, created_at')
      .gte('created_at', since24h),
    // jobs in last 7d for trend
    supabase
      .from('jobs')
      .select('created_at, status, classifier_match, cover_letter_draft')
      .gte('created_at', since7d),
    // last activity pulses
    supabase.from('jobs').select('created_at').order('created_at', { ascending: false }).limit(1),
    supabase.from('jobs').select('classifier_run_at').not('classifier_run_at', 'is', null).order('classifier_run_at', { ascending: false }).limit(1),
    supabase.from('jobs').select('cover_letter_generated_at').not('cover_letter_generated_at', 'is', null).order('cover_letter_generated_at', { ascending: false }).limit(1),
    // stuck counts
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'prequalified').is('classifier_run_at', null),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'qualified').is('cover_letter_draft', null),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'discarded_review'),
    // current status breakdown (all-time)
    supabase.from('jobs').select('status'),
    // recent cover letters for review
    supabase
      .from('jobs')
      .select('id, title, classifier_area, classifier_score, cover_letter_draft, cover_letter_generated_at, ticket, hourly_average, link, business_unit_id')
      .not('cover_letter_draft', 'is', null)
      .order('cover_letter_generated_at', { ascending: false })
      .limit(10),
    // recent classifications to verify quality
    supabase
      .from('jobs')
      .select('id, title, classifier_match, classifier_score, classifier_area, classifier_reason, classifier_run_at, ticket, hourly_average')
      .not('classifier_run_at', 'is', null)
      .order('classifier_run_at', { ascending: false })
      .limit(15),
    // BUs
    supabase.from('business_units').select('id, name').eq('is_active', true),
    // memory reference (precedent quality)
    supabase.from('proposals').select('*', { count: 'exact', head: true }).eq('status', 'Sent'),
    supabase
      .from('proposals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Sent')
      .not('cover_letter', 'is', null)
      .neq('cover_letter', ''),
  ])

  const jobs24h = last24h.data ?? []
  const jobs7d = last7d.data ?? []
  const buNames = Object.fromEntries((buCards.data ?? []).map((b: { id: string; name: string }) => [b.id, b.name]))

  // funnel 24h
  const ingested24h = jobs24h.length
  const passedFilter24h = jobs24h.filter(j => j.classifier_run_at).length
  const matched24h = jobs24h.filter(j => j.classifier_match === true).length
  const covers24h = jobs24h.filter(j => j.cover_letter_draft).length

  // 7d trend by day
  const byDay: Record<string, { total: number; matches: number; covers: number }> = {}
  for (const j of jobs7d) {
    const day = j.created_at.slice(0, 10)
    if (!byDay[day]) byDay[day] = { total: 0, matches: 0, covers: 0 }
    byDay[day].total++
    if (j.classifier_match) byDay[day].matches++
    if (j.cover_letter_draft) byDay[day].covers++
  }
  const days = Object.keys(byDay).sort()

  // BU breakdown last 24h
  const byBU: Record<string, { total: number; matches: number; covers: number }> = {}
  for (const j of jobs24h) {
    const name = j.business_unit_id ? buNames[j.business_unit_id] ?? '(unknown)' : (j.classifier_area ?? '(unfiltered)')
    if (!byBU[name]) byBU[name] = { total: 0, matches: 0, covers: 0 }
    byBU[name].total++
    if (j.classifier_match) byBU[name].matches++
    if (j.cover_letter_draft) byBU[name].covers++
  }

  // status breakdown all-time
  const statusCounts: Record<string, number> = {}
  for (const r of statusBreakdown.data ?? []) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1
  }

  return {
    funnel24h: { ingested: ingested24h, passedFilter: passedFilter24h, matched: matched24h, covers: covers24h },
    pulse: {
      lastIngest: lastIngest.data?.[0]?.created_at,
      lastClassif: lastClassif.data?.[0]?.classifier_run_at,
      lastCover: lastCover.data?.[0]?.cover_letter_generated_at,
    },
    stuck: {
      prequalified: stuckPreq.count ?? 0,
      qualified: stuckQual.count ?? 0,
      review: stuckReview.count ?? 0,
    },
    statusCounts,
    byBU,
    days7d: days.map(d => ({ day: d, ...byDay[d] })),
    recentCoverLetters: recentCoverLetters.data ?? [],
    recentClassifications: recentClassifications.data ?? [],
    memory: {
      totalProposals: proposalsTotal.count ?? 0,
      withCoverText: proposalsWithCover.count ?? 0,
    },
    buNames,
  }
}

export default async function DashboardPage() {
  const d = await loadDashboardData()

  const memoryRatio = d.memory.totalProposals ? (d.memory.withCoverText / d.memory.totalProposals) * 100 : 0
  const memoryWarning = memoryRatio < 10

  return (
    <main className="min-h-screen bg-bg">
      {/* header */}
      <header className="bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/60 border-b border-border sticky top-0 z-10">
        <div className="px-8 py-4 flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="size-7 rounded-md bg-fg flex items-center justify-center text-bg font-bold text-[13px] tracking-tighter">B</div>
              <h1 className="text-[15px] font-bold tracking-tight text-fg group-hover:text-accent-fg transition">Brain Central</h1>
            </Link>
            <span className="text-fg-subtle text-sm">/</span>
            <span className="text-fg-muted text-sm font-medium">Dashboard</span>
          </div>
          <div className="flex items-center gap-5 text-[13px]">
            <Link href="/prospects" className="text-fg-muted hover:text-fg transition font-medium">Prospects</Link>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-8 py-8 space-y-10">

        {/* Pulse — Top */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-3">Pulse</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <PulseCard label="Last ingest" value={ago(d.pulse.lastIngest)} ok={!!d.pulse.lastIngest && Date.now() - new Date(d.pulse.lastIngest).getTime() < 6 * HOUR_MS} />
            <PulseCard label="Last classify" value={ago(d.pulse.lastClassif)} ok={!!d.pulse.lastClassif && Date.now() - new Date(d.pulse.lastClassif).getTime() < 2 * HOUR_MS} />
            <PulseCard label="Last cover letter" value={ago(d.pulse.lastCover)} ok={!!d.pulse.lastCover && Date.now() - new Date(d.pulse.lastCover).getTime() < 24 * HOUR_MS} />
            <PulseCard label="Stuck prequalified" value={d.stuck.prequalified.toString()} ok={d.stuck.prequalified === 0} />
            <PulseCard label="Stuck qualified" value={d.stuck.qualified.toString()} ok={d.stuck.qualified === 0} />
            <PulseCard label="Discarded review" value={d.stuck.review.toString()} ok={d.stuck.review === 0} />
          </div>
        </section>

        {/* Funnel 24h */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-3">Funnel (últimas 24h)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BigStat label="Ingestados" value={d.funnel24h.ingested} />
            <BigStat label="Pasaron filtro $40/h" value={d.funnel24h.passedFilter} sub={d.funnel24h.ingested > 0 ? `${((d.funnel24h.passedFilter / d.funnel24h.ingested) * 100).toFixed(0)}%` : null} />
            <BigStat label="Match (qualified)" value={d.funnel24h.matched} sub={d.funnel24h.passedFilter > 0 ? `${((d.funnel24h.matched / d.funnel24h.passedFilter) * 100).toFixed(0)}% del filtro` : null} />
            <BigStat label="Cover letters" value={d.funnel24h.covers} accent />
          </div>
        </section>

        {/* 7-day trend table */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-3">Últimos 7 días</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface border-b border-border">
                <tr className="text-left text-fg-muted text-xs uppercase tracking-wide">
                  <th className="px-4 py-3">Día</th>
                  <th className="px-4 py-3 text-right">Ingestados</th>
                  <th className="px-4 py-3 text-right">Matches</th>
                  <th className="px-4 py-3 text-right">Cover letters</th>
                </tr>
              </thead>
              <tbody>
                {d.days7d.length === 0 ? (
                  <tr><td className="px-4 py-6 text-fg-muted text-center" colSpan={4}>Sin actividad en los últimos 7 días</td></tr>
                ) : d.days7d.map(row => (
                  <tr key={row.day} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-fg-muted">{row.day}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-info">{row.matches}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-accent-fg">{row.covers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* BU breakdown 24h */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-3">Por BU (últimas 24h)</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {Object.entries(d.byBU).length === 0 ? (
              <div className="px-4 py-6 text-fg-muted text-center text-sm">Sin actividad por BU en las últimas 24h</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface border-b border-border">
                  <tr className="text-left text-fg-muted text-xs uppercase tracking-wide">
                    <th className="px-4 py-3">Business Unit</th>
                    <th className="px-4 py-3 text-right">Procesados</th>
                    <th className="px-4 py-3 text-right">Matches</th>
                    <th className="px-4 py-3 text-right">Cover letters</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(d.byBU).sort((a, b) => b[1].total - a[1].total).map(([bu, s]) => (
                    <tr key={bu} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">{bu}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.total}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-info">{s.matches}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-accent-fg">{s.covers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Status kanban totals */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-3">Status global de la tabla jobs</h2>
          <div className="bg-card border border-border rounded-xl px-4 py-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {Object.entries(d.statusCounts).sort((a, b) => b[1] - a[1]).map(([s, c]) => (
              <div key={s}>
                <span className="font-mono text-fg-muted">{s}</span>{' '}
                <span className="font-semibold tabular-nums">{fmt(c)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Recent cover letters */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-3">Últimas 10 cover letters generadas</h2>
          <div className="space-y-3">
            {d.recentCoverLetters.length === 0 ? (
              <div className="bg-card border border-border rounded-xl px-4 py-6 text-fg-muted text-center text-sm">Aún no hay cover letters generadas</div>
            ) : d.recentCoverLetters.map((j) => {
              const bu = j.business_unit_id ? d.buNames[j.business_unit_id] : j.classifier_area
              const ticket = j.ticket ? `$${j.ticket}` : j.hourly_average ? `$${j.hourly_average}/h` : '—'
              return (
                <details key={j.id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <summary className="px-4 py-3 cursor-pointer hover:bg-surface flex items-center gap-3 flex-wrap">
                    <span className="size-2 rounded-full bg-accent shrink-0" />
                    <span className="font-medium text-sm flex-1 min-w-[200px]">{j.title}</span>
                    <span className="text-xs text-fg-muted">{bu}</span>
                    <span className="text-xs text-fg-muted">score {j.classifier_score}</span>
                    <span className="text-xs text-fg-muted tabular-nums">{ticket}</span>
                    <span className="text-xs text-fg-muted">{ago(j.cover_letter_generated_at)}</span>
                    {j.link && <a href={j.link} target="_blank" rel="noopener" className="text-xs text-info hover:underline">↗ Upwork</a>}
                  </summary>
                  <pre className="px-4 py-4 bg-surface text-sm whitespace-pre-wrap font-sans leading-relaxed border-t border-border">{j.cover_letter_draft}</pre>
                </details>
              )
            })}
          </div>
        </section>

        {/* Recent classifications */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-3">Últimas 15 clasificaciones</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface border-b border-border">
                <tr className="text-left text-fg-muted text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 w-16"></th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3">BU</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {d.recentClassifications.map(j => (
                  <tr key={j.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-3">
                      {j.classifier_match
                        ? <span className="inline-flex items-center gap-1.5 text-accent-fg text-xs font-medium"><span className="size-1.5 rounded-full bg-accent" /> match</span>
                        : <span className="inline-flex items-center gap-1.5 text-fg-muted text-xs"><span className="size-1.5 rounded-full bg-fg-subtle" /> no</span>}
                    </td>
                    <td className="px-4 py-3 max-w-[280px] truncate">{j.title}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{j.classifier_score}</td>
                    <td className="px-4 py-3 text-xs text-fg-muted">{j.classifier_area ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-fg-muted max-w-[400px] line-clamp-2">{j.classifier_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Memory health */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-3">Memoria episódica</h2>
          <div className={`bg-card border rounded-xl px-5 py-4 ${memoryWarning ? 'border-warning/30' : 'border-border'}`}>
            <div className="flex items-baseline gap-3 mb-2">
              <span className={`text-2xl font-bold tabular-nums ${memoryWarning ? 'text-warning' : 'text-fg'}`}>
                {d.memory.withCoverText.toLocaleString()} / {d.memory.totalProposals.toLocaleString()}
              </span>
              <span className="text-sm text-fg-muted">proposals con texto de cover letter</span>
            </div>
            {memoryWarning ? (
              <p className="text-sm text-warning">
                ⚠ El brain decide sin memoria episódica real. Solo {memoryRatio.toFixed(1)}% de las proposals históricas tienen texto. Sync de Notion API pendiente.
              </p>
            ) : (
              <p className="text-sm text-fg-muted">{memoryRatio.toFixed(1)}% de las proposals históricas tienen texto disponible como precedent.</p>
            )}
          </div>
        </section>

        <p className="text-xs text-fg-subtle text-center pt-4">Refresca cada 60s automáticamente. Reload manual: ⌘+R</p>
      </div>
    </main>
  )
}

function PulseCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`size-1.5 rounded-full ${ok ? 'bg-accent' : 'bg-warning'}`} />
        <span className="text-[11px] uppercase tracking-wide text-fg-muted font-medium">{label}</span>
      </div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function BigStat({ label, value, sub, accent }: { label: string; value: number; sub?: string | null; accent?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4">
      <div className="text-[11px] uppercase tracking-wide text-fg-muted font-medium mb-2">{label}</div>
      <div className={`text-3xl font-bold tabular-nums ${accent ? 'text-accent-fg' : 'text-fg'}`}>{value}</div>
      {sub && <div className="text-xs text-fg-muted mt-1">{sub}</div>}
    </div>
  )
}
