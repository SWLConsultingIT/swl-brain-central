'use client'

import { useMemo, useState } from 'react'
import type { SentRow } from '@/lib/stats/sent'

const CONNECT_USD = 0.15 // precio aprox. por connect en Upwork

// Paleta categórica sobria (consistente en claro).
const PALETTE = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#db2777', '#0891b2', '#65a30d', '#dc2626', '#475569']
function colorFor(cat: string, cats: string[]): string {
  return PALETTE[cats.indexOf(cat) % PALETTE.length]
}

const pad = (n: number) => String(n).padStart(2, '0')

type Period = 'day' | 'week' | 'month'

// Clave + etiqueta del bucket según el período (en hora local, Argentina).
function bucketKey(iso: string, p: Period): string {
  const d = new Date(iso)
  if (p === 'month') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  if (p === 'day') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  // week → lunes de esa semana
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
  return `${m.getFullYear()}-${pad(m.getMonth() + 1)}-${pad(m.getDate())}`
}
function bucketLabel(key: string, p: Period): string {
  if (p === 'month') {
    const [y, mm] = key.split('-').map(Number)
    return new Date(y, mm - 1, 1).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
  }
  const [y, mm, dd] = key.split('-').map(Number)
  const d = new Date(y, mm - 1, dd)
  if (p === 'week') return `sem ${pad(dd)}/${pad(mm)}`
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function localYMD(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function localYM(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}` }
function usd(connects: number) { return `$${(connects * CONNECT_USD).toFixed(2)}` }

type Agg = { proposals: number; connects: number; replies: number }
function aggregate(rows: SentRow[]): Agg {
  return {
    proposals: rows.length,
    connects: rows.reduce((s, r) => s + (r.connects ?? 0), 0),
    replies: rows.filter((r) => r.responded).length,
  }
}

export default function StatsView({ rows }: { rows: SentRow[] }) {
  const [period, setPeriod] = useState<Period>('month')
  const [bucket, setBucket] = useState<string>('all') // 'all' o clave de bucket
  const [catFilter, setCatFilter] = useState<string>('all')

  const now = new Date()

  // KPIs globales
  const kpis = useMemo(() => {
    const a = aggregate(rows)
    const today = rows.filter((r) => localYMD(new Date(r.sent_at)) === localYMD(now)).length
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    const week = rows.filter((r) => new Date(r.sent_at) >= weekAgo).length
    const month = rows.filter((r) => localYM(new Date(r.sent_at)) === localYM(now)).length
    return { ...a, today, week, month }
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  // Buckets según el período elegido
  const buckets = useMemo(() => {
    const m = new Map<string, SentRow[]>()
    for (const r of rows) {
      const k = bucketKey(r.sent_at, period)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(r)
    }
    const cap = period === 'day' ? 30 : period === 'week' ? 16 : 24
    return Array.from(m.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, cap)
      .map(([key, rs]) => ({ key, label: bucketLabel(key, period), ...aggregate(rs) }))
  }, [rows, period])

  // Al cambiar de período, si el bucket seleccionado ya no existe, volver a 'all'
  const bucketExists = bucket === 'all' || buckets.some((b) => b.key === bucket)
  const activeBucket = bucketExists ? bucket : 'all'

  const scoped = useMemo(
    () => (activeBucket === 'all' ? rows : rows.filter((r) => bucketKey(r.sent_at, period) === activeBucket)),
    [rows, activeBucket, period],
  )

  const allCats = useMemo(() => Array.from(new Set(rows.map((r) => r.category ?? 'Sin categoría'))).sort(), [rows])
  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of scoped) { const c = r.category ?? 'Sin categoría'; m.set(c, (m.get(c) ?? 0) + 1) }
    return Array.from(m.entries()).map(([cat, count]) => ({ cat, count })).sort((a, b) => b.count - a.count)
  }, [scoped])
  const scopedTotal = scoped.length

  // Resultado & costo (del período seleccionado; 'all' = total acumulado)
  const agg = useMemo(() => {
    const sent = scoped.length
    const responses = scoped.filter((r) => r.responded).length
    const withConn = scoped.filter((r) => r.connects != null)
    const connects = withConn.reduce((s, r) => s + (r.connects ?? 0), 0)
    const spent = connects * CONNECT_USD
    return {
      sent,
      responses,
      rate: sent ? responses / sent : 0,
      connects,
      withConnCount: withConn.length,
      spent,
      costPerProposal: withConn.length ? spent / withConn.length : null,
      costPerResponse: responses && spent > 0 ? spent / responses : null,
    }
  }, [scoped])

  const rateByCat = useMemo(() => {
    const m = new Map<string, { sent: number; resp: number }>()
    for (const r of scoped) {
      const c = r.category ?? 'Sin categoría'
      const e = m.get(c) ?? { sent: 0, resp: 0 }
      e.sent++
      if (r.responded) e.resp++
      m.set(c, e)
    }
    return Array.from(m.entries())
      .map(([cat, v]) => ({ cat, ...v, rate: v.sent ? v.resp / v.sent : 0 }))
      .sort((a, b) => b.sent - a.sent)
  }, [scoped])

  const list = useMemo(() => {
    let l = scoped
    if (catFilter !== 'all') l = l.filter((r) => (r.category ?? 'Sin categoría') === catFilter)
    return [...l].sort((a, b) => b.sent_at.localeCompare(a.sent_at))
  }, [scoped, catFilter])

  const maxProp = Math.max(1, ...buckets.map((b) => b.proposals))

  return (
    <div className="px-8 py-6 max-w-[2400px] mx-auto space-y-8">
      {/* KPIs globales */}
      <div className="bg-surface border border-border rounded-xl flex flex-wrap divide-x divide-border overflow-hidden">
        <Kpi label="Hoy" value={kpis.today} />
        <Kpi label="Esta semana" value={kpis.week} />
        <Kpi label="Este mes" value={kpis.month} accent="bg-info" />
        <Kpi label="Total enviadas" value={kpis.proposals} accent="bg-fg" />
        <Kpi label="Respuestas" value={kpis.replies} accent="bg-accent" />
        <Kpi label="Connects" value={kpis.connects} accent="bg-violet" />
        <Kpi label="$ gastado" value={usd(kpis.connects)} accent="bg-warning" />
      </div>

      {/* Resultado & costo */}
      <section className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg mb-4">
          Resultado &amp; costo {activeBucket !== 'all' && <span className="text-fg-subtle font-normal normal-case">· {bucketLabel(activeBucket, period)}</span>}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <Stat label="Enviadas" value={agg.sent} />
          <Stat label="Respuestas" value={agg.responses} sub={`${(agg.rate * 100).toFixed(0)}% tasa`} />
          <Stat label="Connects" value={agg.withConnCount ? agg.connects : '—'} sub={agg.withConnCount ? `${agg.withConnCount}/${agg.sent} cargadas` : 'sin cargar'} />
          <Stat label="$ gastado" value={agg.withConnCount ? `$${agg.spent.toFixed(2)}` : '—'} />
          <Stat label="Costo/propuesta" value={agg.costPerProposal != null ? `$${agg.costPerProposal.toFixed(2)}` : '—'} />
          <Stat label="Costo/respuesta" value={agg.costPerResponse != null ? `$${agg.costPerResponse.toFixed(2)}` : '—'} />
        </div>
        <h3 className="text-[11px] font-semibold tracking-[0.06em] uppercase text-fg-muted mb-3">Tasa de respuesta por categoría</h3>
        <div className="space-y-2.5">
          {rateByCat.map(({ cat, sent, resp, rate }) => (
            <div key={cat}>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span className="text-fg-muted truncate pr-2">{cat}</span>
                <span className="font-mono tabular-nums text-fg whitespace-nowrap">
                  <span className="font-semibold">{resp}</span>/{sent} · {(rate * 100).toFixed(0)}%
                </span>
              </div>
              <span className="block h-2 bg-bg rounded overflow-hidden">
                <span className="block h-full rounded bg-accent" style={{ width: `${rate * 100}%` }} />
              </span>
            </div>
          ))}
          {rateByCat.length === 0 && <div className="text-[11px] text-fg-subtle py-4 text-center">Sin envíos en este período</div>}
        </div>
      </section>

      {/* Tabla por período */}
      <section className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg">Por período</h2>
          <div className="flex items-center gap-1 bg-bg rounded-md p-0.5 border border-border">
            {(['day', 'week', 'month'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setBucket('all') }}
                className={`px-2.5 py-1 text-[12px] font-medium rounded transition-colors ${
                  period === p ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {p === 'day' ? 'Día' : p === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-auto max-h-[360px]">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                {['Período', 'Propuestas', 'Connects', '$ gastado', 'Respuestas'].map((h, i) => (
                  <th key={h} className={`font-medium text-fg-muted text-[12px] px-4 py-2.5 bg-bg sticky top-0 border-b border-border whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => {
                const sel = activeBucket === b.key
                return (
                  <tr
                    key={b.key}
                    onClick={() => setBucket(sel ? 'all' : b.key)}
                    className={`border-b border-border last:border-0 cursor-pointer transition-colors ${sel ? 'bg-bg' : 'hover:bg-bg'}`}
                  >
                    <td className="px-4 py-2 border-b border-border">
                      <span className="inline-flex items-center gap-2">
                        <span className={`text-[12px] font-medium ${sel ? 'text-fg' : 'text-fg-muted'}`}>{b.label}</span>
                        <span className="h-1.5 rounded-full bg-fg/30" style={{ width: `${Math.max(8, (b.proposals / maxProp) * 90)}px` }} />
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-border text-right font-mono tabular-nums font-semibold text-fg">{b.proposals}</td>
                    <td className="px-4 py-2 border-b border-border text-right font-mono tabular-nums text-fg-muted">{b.connects || '—'}</td>
                    <td className="px-4 py-2 border-b border-border text-right font-mono tabular-nums text-fg-muted">{b.connects ? usd(b.connects) : '—'}</td>
                    <td className="px-4 py-2 border-b border-border text-right font-mono tabular-nums text-fg-muted">{b.replies || '—'}</td>
                  </tr>
                )
              })}
              {buckets.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-fg-subtle text-[12px]">Sin envíos todavía</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Por categoría (del período seleccionado) */}
      <section className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg mb-4">
          Por categoría {activeBucket !== 'all' && <span className="text-fg-subtle font-normal normal-case">· {bucketLabel(activeBucket, period)}</span>}
        </h2>
        <div className="space-y-3">
          {byCategory.map(({ cat, count }) => {
            const pct = scopedTotal ? Math.round((count / scopedTotal) * 100) : 0
            return (
              <div key={cat}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="text-fg-muted truncate pr-2">{cat}</span>
                  <span className="font-mono tabular-nums text-fg font-semibold whitespace-nowrap">{count} · {pct}%</span>
                </div>
                <span className="block h-2 bg-bg rounded overflow-hidden">
                  <span className="block h-full rounded" style={{ width: `${pct}%`, background: colorFor(cat, allCats) }} />
                </span>
              </div>
            )
          })}
          {byCategory.length === 0 && <div className="text-[11px] text-fg-subtle py-6 text-center">Sin datos</div>}
        </div>
      </section>

      {/* Lista de enviadas */}
      <section className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg">
            Enviadas {activeBucket !== 'all' && `· ${bucketLabel(activeBucket, period)}`} <span className="text-fg-subtle">({list.length})</span>
          </h2>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="text-[12px] bg-bg border border-border rounded-md px-2 py-1 text-fg">
            <option value="all">Todas las categorías</option>
            {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="overflow-auto max-h-[520px]">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                {['Título', 'Categoría', 'Enviado', 'Connects', 'Reply', 'Link'].map((h) => (
                  <th key={h} className="text-left font-medium text-fg-muted text-[12px] px-4 py-2.5 bg-bg sticky top-0 border-b border-border whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.job_id} className="border-b border-border last:border-0 hover:bg-bg">
                  <td className="px-4 py-2 border-b border-border max-w-[420px]"><span className="block truncate text-fg" title={r.title}>{r.title}</span></td>
                  <td className="px-4 py-2 border-b border-border whitespace-nowrap">
                    {r.category ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
                        <span className="size-2 rounded-full" style={{ background: colorFor(r.category, allCats) }} />
                        {r.category}
                      </span>
                    ) : <span className="text-fg-subtle text-[11px]">—</span>}
                  </td>
                  <td className="px-4 py-2 border-b border-border whitespace-nowrap font-mono text-[11px] text-fg-muted">
                    {new Date(r.sent_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-2 border-b border-border font-mono text-[11px] text-fg-muted tabular-nums">{r.connects ?? '—'}</td>
                  <td className="px-4 py-2 border-b border-border text-center">
                    {r.responded
                      ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent-bg text-accent-fg">Reply</span>
                      : <span className="text-fg-subtle text-[11px]">—</span>}
                  </td>
                  <td className="px-4 py-2 border-b border-border">
                    {r.link
                      ? <a href={r.link} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-fg-subtle hover:text-fg whitespace-nowrap">open&nbsp;↗</a>
                      : <span className="text-fg-subtle text-[11px]">—</span>}
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-fg-subtle text-[12px]">No hay envíos en este filtro</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-bg border border-border rounded-lg px-4 py-3">
      <div className="text-[11px] text-fg-muted font-medium">{label}</div>
      <div className="text-[20px] font-semibold tabular-nums tracking-tight text-fg leading-tight mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-fg-subtle mt-0.5 font-mono tabular-nums">{sub}</div>}
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="flex-1 min-w-[110px] px-5 py-3.5">
      <div className="flex items-center gap-1.5 text-[11px] text-fg-muted font-medium">
        {accent && <span className={`size-1.5 rounded-full ${accent}`} aria-hidden />}
        {label}
      </div>
      <div className="text-[24px] font-semibold tabular-nums tracking-tight text-fg leading-tight mt-1">{value}</div>
    </div>
  )
}
