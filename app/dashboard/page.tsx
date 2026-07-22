import Link from 'next/link'
import LogoutButton from '@/app/logout-button'
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
    lastQuestions,
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
      .select('id, status, classifier_match, classifier_run_at, cover_letter_draft, classifier_area, business_unit_id, created_at, questions, questions_answers')
      .gte('created_at', since24h),
    // jobs in last 7d for trend
    supabase
      .from('jobs')
      .select('created_at, status, classifier_match, cover_letter_draft, classifier_area')
      .gte('created_at', since7d),
    // last activity pulses
    supabase.from('jobs').select('created_at').order('created_at', { ascending: false }).limit(1),
    supabase.from('jobs').select('classifier_run_at').not('classifier_run_at', 'is', null).order('classifier_run_at', { ascending: false }).limit(1),
    supabase.from('jobs').select('cover_letter_generated_at').not('cover_letter_generated_at', 'is', null).order('cover_letter_generated_at', { ascending: false }).limit(1),
    // last job that actually got screening questions (detecta si screening se rompió en silencio)
    supabase.from('jobs').select('created_at').not('questions->0', 'is', null).order('created_at', { ascending: false }).limit(1),
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
  const questions24h = jobs24h.filter(j => Array.isArray(j.questions) && j.questions.length > 0).length
  const answers24h = jobs24h.filter(j => Array.isArray(j.questions_answers) && j.questions_answers.length > 0).length

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

  // Entrada de jobs por categoría: hoy (24h) vs promedio diario de los últimos 7d.
  // Sirve para que cualquiera vea si una categoría (ej. finance) dejó de entrar.
  const cat24h: Record<string, number> = {}
  for (const j of jobs24h) {
    const c = j.classifier_area ?? 'Sin clasificar'
    cat24h[c] = (cat24h[c] ?? 0) + 1
  }
  const cat7d: Record<string, number> = {}
  for (const j of jobs7d) {
    const c = j.classifier_area ?? 'Sin clasificar'
    cat7d[c] = (cat7d[c] ?? 0) + 1
  }
  const entrada = Array.from(new Set([...Object.keys(cat24h), ...Object.keys(cat7d)]))
    .map((cat) => {
      const today = cat24h[cat] ?? 0
      const avg = Math.round(((cat7d[cat] ?? 0) / 7) * 10) / 10
      return { cat, today, avg, low: today === 0 && avg >= 1 }
    })
    .sort((a, b) => b.avg - a.avg)

  return {
    entrada,
    funnel24h: { ingested: ingested24h, passedFilter: passedFilter24h, matched: matched24h, covers: covers24h },
    pulse: {
      lastIngest: lastIngest.data?.[0]?.created_at,
      lastClassif: lastClassif.data?.[0]?.classifier_run_at,
      lastCover: lastCover.data?.[0]?.cover_letter_generated_at,
      lastQuestions: lastQuestions.data?.[0]?.created_at,
    },
    screening24h: { asked: questions24h, answered: answers24h },
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

  // Estado general del sistema — para el banner de 1 vistazo.
  const now = Date.now()
  const checks = {
    scrape: !!d.pulse.lastIngest && now - new Date(d.pulse.lastIngest).getTime() < 6 * HOUR_MS,
    classify: !!d.pulse.lastClassif && now - new Date(d.pulse.lastClassif).getTime() < 6 * HOUR_MS,
    cover: !!d.pulse.lastCover && now - new Date(d.pulse.lastCover).getTime() < 26 * HOUR_MS,
    screening: !!d.pulse.lastQuestions && now - new Date(d.pulse.lastQuestions).getTime() < 26 * HOUR_MS,
    answers: !(d.screening24h.asked > 0 && d.screening24h.answered === 0),
  }
  const lowCats = d.entrada.filter((e) => e.low).map((e) => e.cat)
  const problems: string[] = []
  if (!checks.scrape) problems.push('el scrapeo no corrió en las últimas 6 horas')
  if (!checks.classify) problems.push('el clasificador no corrió hace rato')
  if (!checks.screening) problems.push('no entran preguntas hace más de un día')
  if (lowCats.length) problems.push(`sin entrar trabajo hoy: ${lowCats.join(', ')}`)
  const allOk = problems.length === 0

  const pipeline = [
    { label: 'Scrapeo de jobs', value: ago(d.pulse.lastIngest), ok: checks.scrape },
    { label: 'Clasificación', value: ago(d.pulse.lastClassif), ok: checks.classify },
    { label: 'Cover letters', value: ago(d.pulse.lastCover), ok: checks.cover },
    { label: 'Screening (preguntas)', value: ago(d.pulse.lastQuestions), ok: checks.screening },
    { label: 'Respuestas del agente', value: `${d.screening24h.answered}/${d.screening24h.asked} hoy`, ok: checks.answers },
  ]

  return (
    <main className="min-h-screen bg-bg">
      {/* header */}
      <header className="bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/60 border-b border-border sticky top-0 z-10">
        <div className="px-8 py-4 flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="size-7 rounded-md bg-fg flex items-center justify-center text-bg font-bold text-[13px] tracking-tighter">B</div>
              <h1 className="text-[15px] font-bold tracking-tight text-fg group-hover:text-fg-muted transition">Upwork Brain</h1>
            </Link>
            <span className="text-fg-subtle text-sm">/</span>
            <span className="text-fg-muted text-sm font-medium">Dashboard</span>
          </div>
          <div className="flex items-center gap-5 text-[13px]">
            <Link href="/prospects" className="text-fg-muted hover:text-fg transition font-medium">Prospects</Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-8 py-8 space-y-10">

        {/* Estado general — 1 vistazo */}
        <section className={`rounded-xl border px-6 py-5 ${allOk ? 'bg-accent-bg border-accent/30' : 'bg-destructive-bg border-destructive/30'}`}>
          <div className="flex items-center gap-2.5">
            <span className={`size-2.5 rounded-full ${allOk ? 'bg-accent' : 'bg-destructive'}`} />
            <h2 className="text-lg font-semibold text-fg">{allOk ? 'Todo funcionando' : 'Atención — hay algo para revisar'}</h2>
          </div>
          <p className="text-sm text-fg-muted mt-1.5">
            Último scrapeo <strong className="text-fg">{ago(d.pulse.lastIngest)}</strong> · <strong className="text-fg">{d.funnel24h.ingested}</strong> jobs en las últimas 24h
          </p>
          {!allOk && (
            <ul className="mt-2.5 text-sm text-destructive list-disc pl-5 space-y-0.5">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </section>

        {/* Entrada por categoría — chequeo diario para todo el equipo */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-1">¿Está entrando trabajo? — por categoría</h2>
          <p className="text-[13px] text-fg-muted mb-3">
            Jobs que entraron en las <strong>últimas 24h</strong> vs el <strong>promedio diario</strong> de la semana.
            Si una categoría marca <span className="text-destructive font-medium">0 y su promedio es alto</span>, puede que ese scraper no esté trayendo — avisá al equipo técnico.
          </p>
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg border-b border-border">
                <tr className="text-left text-fg-muted text-xs uppercase tracking-wide">
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 text-right">Últimas 24h</th>
                  <th className="px-4 py-3 text-right">Promedio/día</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {d.entrada.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-fg-muted">Sin datos todavía</td></tr>
                ) : d.entrada.map((e) => {
                  const [dot, label, cls] =
                    e.low ? ['bg-destructive', 'Sin entrar hoy', 'text-destructive'] :
                    e.avg >= 1 && e.today < e.avg * 0.5 ? ['bg-warning', 'Bajo', 'text-warning'] :
                    ['bg-accent', 'OK', 'text-fg-muted']
                  return (
                    <tr key={e.cat} className={`border-b border-border last:border-0 ${e.low ? 'bg-destructive-bg/40' : ''}`}>
                      <td className="px-4 py-3 font-medium">{e.cat}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{e.today}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-fg-muted">{e.avg}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                          <span className={`size-1.5 rounded-full ${dot}`} />
                          <span className={cls}>{label}</span>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Salud del pipeline — cada etapa, en castellano */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-3">Salud del pipeline</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {pipeline.map((p) => <PulseCard key={p.label} label={p.label} value={p.value} ok={p.ok} />)}
          </div>
        </section>

        {/* Embudo del día */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-3">Embudo del día (últimas 24h)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BigStat label="Entraron" value={d.funnel24h.ingested} />
            <BigStat label="Pasaron filtro $40/h" value={d.funnel24h.passedFilter} sub={d.funnel24h.ingested > 0 ? `${((d.funnel24h.passedFilter / d.funnel24h.ingested) * 100).toFixed(0)}%` : null} />
            <BigStat label="Viables (qualified)" value={d.funnel24h.matched} sub={d.funnel24h.passedFilter > 0 ? `${((d.funnel24h.matched / d.funnel24h.passedFilter) * 100).toFixed(0)}% del filtro` : null} />
            <BigStat label="Cover letters" value={d.funnel24h.covers} accent />
          </div>
        </section>

        {/* Recent cover letters */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-3">Últimas 10 cover letters generadas</h2>
          <div className="space-y-3">
            {d.recentCoverLetters.length === 0 ? (
              <div className="bg-surface border border-border rounded-xl px-4 py-6 text-fg-muted text-center text-sm">Aún no hay cover letters generadas</div>
            ) : d.recentCoverLetters.map((j) => {
              const bu = j.business_unit_id ? d.buNames[j.business_unit_id] : j.classifier_area
              const ticket = j.ticket ? `$${j.ticket}` : j.hourly_average ? `$${j.hourly_average}/h` : '—'
              return (
                <details key={j.id} className="bg-surface border border-border rounded-xl overflow-hidden">
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
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
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

        <p className="text-xs text-fg-subtle text-center pt-4">Se actualiza solo cada 60s. Recargar: ⌘+R</p>
      </div>
    </main>
  )
}

function PulseCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3">
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
    <div className="bg-surface border border-border rounded-xl px-5 py-4">
      <div className="text-[11px] uppercase tracking-wide text-fg-muted font-medium mb-2">{label}</div>
      <div className={`text-3xl font-bold tabular-nums ${accent ? 'text-accent-fg' : 'text-fg'}`}>{value}</div>
      {sub && <div className="text-xs text-fg-muted mt-1">{sub}</div>}
    </div>
  )
}
