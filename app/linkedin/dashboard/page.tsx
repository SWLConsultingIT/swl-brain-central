import Link from 'next/link'
import LogoutButton from '@/app/logout-button'
import BrandSwitch from '@/app/brand-switch'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 60

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function ago(iso: string | null | undefined): string {
  if (!iso) return 'nunca'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < HOUR_MS) return `hace ${Math.round(ms / 60_000)} min`
  if (ms < DAY_MS) return `hace ${Math.round(ms / HOUR_MS)}h`
  return `hace ${Math.round(ms / DAY_MS)}d`
}

async function loadData() {
  const supabase = getServerClient()
  const now = new Date()
  const since24h = new Date(now.getTime() - DAY_MS).toISOString()
  const since7d = new Date(now.getTime() - 7 * DAY_MS).toISOString()

  const [last24h, last7d, lastIngest, lastClassif, lastCover, statusBreakdown, recentNotes, recentClassifications, buCards] = await Promise.all([
    supabase.from('linkedin_jobs').select('id, status, classifier_match, classifier_run_at, cover_letter_draft, classifier_area, business_unit_id, created_at').gte('created_at', since24h),
    supabase.from('linkedin_jobs').select('created_at, status, classifier_match, cover_letter_draft, classifier_area').gte('created_at', since7d),
    supabase.from('linkedin_jobs').select('created_at').order('created_at', { ascending: false }).limit(1),
    supabase.from('linkedin_jobs').select('classifier_run_at').not('classifier_run_at', 'is', null).order('classifier_run_at', { ascending: false }).limit(1),
    supabase.from('linkedin_jobs').select('cover_letter_generated_at').not('cover_letter_generated_at', 'is', null).order('cover_letter_generated_at', { ascending: false }).limit(1),
    supabase.from('linkedin_jobs').select('status'),
    supabase.from('linkedin_jobs').select('id, title, company_name, classifier_area, classifier_score, cover_letter_draft, cover_letter_generated_at, employment_type, link, business_unit_id').not('cover_letter_draft', 'is', null).order('cover_letter_generated_at', { ascending: false }).limit(10),
    supabase.from('linkedin_jobs').select('id, title, classifier_match, classifier_score, classifier_area, classifier_reason, classifier_run_at, employment_type, seniority').not('classifier_run_at', 'is', null).order('classifier_run_at', { ascending: false }).limit(15),
    supabase.from('business_units').select('id, name').eq('is_active', true),
  ])

  const jobs24h = last24h.data ?? []
  const jobs7d = last7d.data ?? []
  const buNames = Object.fromEntries((buCards.data ?? []).map((b: { id: string; name: string }) => [b.id, b.name]))

  const ingested24h = jobs24h.length
  const classified24h = jobs24h.filter((j) => j.classifier_run_at).length
  const matched24h = jobs24h.filter((j) => j.classifier_match === true).length
  const covers24h = jobs24h.filter((j) => j.cover_letter_draft).length

  const cat24h: Record<string, number> = {}
  for (const j of jobs24h) { const c = j.classifier_area ?? 'Sin clasificar'; cat24h[c] = (cat24h[c] ?? 0) + 1 }
  const cat7d: Record<string, number> = {}
  for (const j of jobs7d) { const c = j.classifier_area ?? 'Sin clasificar'; cat7d[c] = (cat7d[c] ?? 0) + 1 }
  const entrada = Array.from(new Set([...Object.keys(cat24h), ...Object.keys(cat7d)]))
    .map((cat) => {
      const today = cat24h[cat] ?? 0
      const avg = Math.round(((cat7d[cat] ?? 0) / 7) * 10) / 10
      return { cat, today, avg, low: today === 0 && avg >= 1 }
    })
    .sort((a, b) => b.avg - a.avg)

  const statusCounts: Record<string, number> = {}
  for (const r of statusBreakdown.data ?? []) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1

  return {
    entrada,
    funnel24h: { ingested: ingested24h, classified: classified24h, matched: matched24h, covers: covers24h },
    pulse: {
      lastIngest: lastIngest.data?.[0]?.created_at,
      lastClassif: lastClassif.data?.[0]?.classifier_run_at,
      lastCover: lastCover.data?.[0]?.cover_letter_generated_at,
    },
    statusCounts,
    recentNotes: recentNotes.data ?? [],
    recentClassifications: recentClassifications.data ?? [],
    buNames,
  }
}

export default async function LinkedInDashboardPage() {
  const d = await loadData()
  const now = Date.now()
  const checks = {
    scrape: !!d.pulse.lastIngest && now - new Date(d.pulse.lastIngest).getTime() < 6 * HOUR_MS,
    classify: !!d.pulse.lastClassif && now - new Date(d.pulse.lastClassif).getTime() < 6 * HOUR_MS,
    cover: !!d.pulse.lastCover && now - new Date(d.pulse.lastCover).getTime() < 48 * HOUR_MS,
  }
  const lowCats = d.entrada.filter((e) => e.low).map((e) => e.cat)
  const problems: string[] = []
  if (!checks.scrape) problems.push('el scrapeo de LinkedIn no corrió en las últimas 6 horas')
  if (!checks.classify) problems.push('el clasificador no corrió hace rato')
  if (lowCats.length) problems.push(`sin entrar trabajo hoy: ${lowCats.join(', ')}`)
  const allOk = problems.length === 0

  const pipeline = [
    { label: 'Scrapeo LinkedIn', value: ago(d.pulse.lastIngest), ok: checks.scrape },
    { label: 'Clasificación', value: ago(d.pulse.lastClassif), ok: checks.classify },
    { label: 'Notas de aplicación', value: ago(d.pulse.lastCover), ok: checks.cover },
  ]

  return (
    <main className="min-h-screen bg-bg">
      <header className="bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/60 border-b border-border sticky top-0 z-10">
        <div className="px-8 py-4 flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <h1 className="text-[15px] font-bold tracking-tight text-fg group-hover:text-fg-muted transition">CRM Jobs</h1>
            </Link>
            <span className="text-fg-subtle text-sm">/</span>
            <span className="text-fg-muted text-sm font-medium">LinkedIn · Dashboard</span>
          </div>
          <div className="flex items-center gap-5 text-[13px]">
            <BrandSwitch />
            <Link href="/linkedin" className="text-fg-muted hover:text-fg transition font-medium">Jobs</Link>
            <Link href="/linkedin/stats" className="text-fg-muted hover:text-fg transition font-medium">Stats</Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-8 py-8 space-y-10">
        {/* Estado general */}
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

        {/* Entrada por categoría */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-1">¿Está entrando trabajo? — por categoría</h2>
          <p className="text-[13px] text-fg-muted mb-3">
            Jobs de LinkedIn que entraron en las <strong>últimas 24h</strong> vs el <strong>promedio diario</strong> de la semana.
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

        {/* Salud del pipeline */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-3">Salud del pipeline</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {pipeline.map((p) => (
              <div key={p.label} className="bg-surface border border-border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`size-1.5 rounded-full ${p.ok ? 'bg-accent' : 'bg-warning'}`} />
                  <span className="text-[11px] uppercase tracking-wide text-fg-muted font-medium">{p.label}</span>
                </div>
                <div className="text-sm font-semibold tabular-nums">{p.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Embudo del día */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-3">Embudo del día (últimas 24h)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BigStat label="Entraron" value={d.funnel24h.ingested} />
            <BigStat label="Clasificados" value={d.funnel24h.classified} sub={d.funnel24h.ingested > 0 ? `${((d.funnel24h.classified / d.funnel24h.ingested) * 100).toFixed(0)}%` : null} />
            <BigStat label="Viables (qualified)" value={d.funnel24h.matched} sub={d.funnel24h.classified > 0 ? `${((d.funnel24h.matched / d.funnel24h.classified) * 100).toFixed(0)}% de clasificados` : null} />
            <BigStat label="Notas generadas" value={d.funnel24h.covers} accent />
          </div>
        </section>

        {/* Notas recientes */}
        <section>
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted mb-3">Últimas 10 notas de aplicación generadas</h2>
          <div className="space-y-3">
            {d.recentNotes.length === 0 ? (
              <div className="bg-surface border border-border rounded-xl px-4 py-6 text-fg-muted text-center text-sm">Aún no hay notas generadas</div>
            ) : d.recentNotes.map((j) => {
              const bu = j.business_unit_id ? d.buNames[j.business_unit_id] : j.classifier_area
              return (
                <details key={j.id} className="bg-surface border border-border rounded-xl overflow-hidden">
                  <summary className="px-4 py-3 cursor-pointer hover:bg-surface flex items-center gap-3 flex-wrap">
                    <span className="size-2 rounded-full bg-accent shrink-0" />
                    <span className="font-medium text-sm flex-1 min-w-[200px]">{j.title}</span>
                    {j.company_name && <span className="text-xs text-fg-muted">{j.company_name}</span>}
                    <span className="text-xs text-fg-muted">{bu}</span>
                    <span className="text-xs text-fg-muted">score {j.classifier_score}</span>
                    {j.employment_type && <span className="text-xs text-fg-muted">{j.employment_type}</span>}
                    <span className="text-xs text-fg-muted">{ago(j.cover_letter_generated_at)}</span>
                    {j.link && <a href={j.link} target="_blank" rel="noopener" className="text-xs text-info hover:underline">↗ LinkedIn</a>}
                  </summary>
                  <pre className="px-4 py-4 bg-surface text-sm whitespace-pre-wrap font-sans leading-relaxed border-t border-border">{j.cover_letter_draft}</pre>
                </details>
              )
            })}
          </div>
        </section>

        {/* Clasificaciones recientes */}
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
                {d.recentClassifications.map((j) => (
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

function BigStat({ label, value, sub, accent }: { label: string; value: number; sub?: string | null; accent?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-xl px-5 py-4">
      <div className="text-[11px] uppercase tracking-wide text-fg-muted font-medium mb-2">{label}</div>
      <div className={`text-3xl font-bold tabular-nums ${accent ? 'text-accent-fg' : 'text-fg'}`}>{value}</div>
      {sub && <div className="text-xs text-fg-muted mt-1">{sub}</div>}
    </div>
  )
}
