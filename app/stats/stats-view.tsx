'use client'

import { useMemo, useState } from 'react'
import type { SentRow } from '@/lib/stats/sent'

// Paleta categórica sobria para las categorías (consistente en claro).
const PALETTE = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#db2777', '#0891b2', '#65a30d', '#dc2626', '#475569']
function colorFor(cat: string, cats: string[]): string {
  const i = cats.indexOf(cat)
  return PALETTE[i % PALETTE.length]
}

const MONTH_LABEL = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
}

// Clave local (Argentina) YYYY-MM y YYYY-MM-DD desde un ISO UTC.
function localYM(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function localYMD(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function StatsView({ rows }: { rows: SentRow[] }) {
  const [month, setMonth] = useState<string>('all') // 'all' o 'YYYY-MM'
  const [catFilter, setCatFilter] = useState<string>('all')

  const now = new Date()
  const todayKey = localYMD(now.toISOString())
  const thisMonthKey = localYM(now.toISOString())
  const weekAgo = new Date(now.getTime() - 7 * 86400000)

  // KPIs (sobre todo el histórico de la app)
  const kpis = useMemo(() => {
    const total = rows.length
    const today = rows.filter((r) => localYMD(r.sent_at) === todayKey).length
    const week = rows.filter((r) => new Date(r.sent_at) >= weekAgo).length
    const thisMonth = rows.filter((r) => localYM(r.sent_at) === thisMonthKey).length
    const replies = rows.filter((r) => r.responded).length
    // promedio/día del mes actual
    const daysInMonthSoFar = now.getDate()
    const avgDay = daysInMonthSoFar > 0 ? (thisMonth / daysInMonthSoFar) : 0
    return { total, today, week, thisMonth, replies, avgDay }
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  // Meses disponibles (desc)
  const months = useMemo(() => {
    const s = new Set(rows.map((r) => localYM(r.sent_at)))
    return Array.from(s).sort().reverse()
  }, [rows])

  const byMonth = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(localYM(r.sent_at), (m.get(localYM(r.sent_at)) ?? 0) + 1)
    return months.map((ym) => ({ ym, count: m.get(ym) ?? 0 }))
  }, [rows, months])
  const maxMonth = Math.max(1, ...byMonth.map((x) => x.count))

  // Scope según mes seleccionado
  const scoped = useMemo(
    () => (month === 'all' ? rows : rows.filter((r) => localYM(r.sent_at) === month)),
    [rows, month],
  )

  const allCats = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category ?? 'Sin categoría'))).sort(),
    [rows],
  )
  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of scoped) {
      const c = r.category ?? 'Sin categoría'
      m.set(c, (m.get(c) ?? 0) + 1)
    }
    return Array.from(m.entries())
      .map(([cat, count]) => ({ cat, count }))
      .sort((a, b) => b.count - a.count)
  }, [scoped])
  const scopedTotal = scoped.length

  const list = useMemo(() => {
    let l = scoped
    if (catFilter !== 'all') l = l.filter((r) => (r.category ?? 'Sin categoría') === catFilter)
    return [...l].sort((a, b) => b.sent_at.localeCompare(a.sent_at))
  }, [scoped, catFilter])

  return (
    <div className="px-8 py-6 max-w-[2400px] mx-auto space-y-8">
      {/* KPIs */}
      <div className="bg-surface border border-border rounded-xl flex flex-wrap divide-x divide-border overflow-hidden">
        <Kpi label="Hoy" value={kpis.today} />
        <Kpi label="Esta semana" value={kpis.week} />
        <Kpi label="Este mes" value={kpis.thisMonth} accent="bg-info" />
        <Kpi label="Prom/día (mes)" value={kpis.avgDay.toFixed(1)} />
        <Kpi label="Total enviadas" value={kpis.total} accent="bg-fg" />
        <Kpi label="Respuestas" value={kpis.replies} accent="bg-accent" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por mes */}
        <section className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg">Por mes</h2>
            <button
              onClick={() => setMonth('all')}
              className={`text-[11px] font-medium ${month === 'all' ? 'text-fg' : 'text-fg-subtle hover:text-fg'}`}
            >
              Todos
            </button>
          </div>
          <div className="space-y-2.5">
            {byMonth.map(({ ym, count }) => (
              <button
                key={ym}
                onClick={() => setMonth(month === ym ? 'all' : ym)}
                className="w-full group flex items-center gap-3 text-left"
              >
                <span className={`w-14 text-[12px] font-mono tabular-nums ${month === ym ? 'text-fg font-semibold' : 'text-fg-muted'}`}>
                  {MONTH_LABEL(ym)}
                </span>
                <span className="flex-1 h-6 bg-bg rounded overflow-hidden relative">
                  <span
                    className={`absolute inset-y-0 left-0 rounded ${month === ym ? 'bg-fg' : 'bg-fg/50 group-hover:bg-fg/70'} transition-all`}
                    style={{ width: `${(count / maxMonth) * 100}%` }}
                  />
                </span>
                <span className="w-8 text-right text-[12px] font-mono tabular-nums font-semibold text-fg">{count}</span>
              </button>
            ))}
            {byMonth.length === 0 && <Empty />}
          </div>
        </section>

        {/* Por categoría */}
        <section className="bg-surface border border-border rounded-xl p-5">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg mb-4">
            Por categoría {month !== 'all' && <span className="text-fg-subtle font-normal normal-case">· {MONTH_LABEL(month)}</span>}
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
            {byCategory.length === 0 && <Empty />}
          </div>
        </section>
      </div>

      {/* Lista de enviadas */}
      <section className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg">
            Enviadas {month !== 'all' && `· ${MONTH_LABEL(month)}`} <span className="text-fg-subtle">({list.length})</span>
          </h2>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="text-[12px] bg-bg border border-border rounded-md px-2 py-1 text-fg"
          >
            <option value="all">Todas las categorías</option>
            {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="overflow-auto max-h-[520px]">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                {['Título', 'Categoría', 'Enviado', 'Reply', 'Link'].map((h) => (
                  <th key={h} className="text-left font-medium text-fg-muted text-[12px] px-4 py-2.5 bg-bg sticky top-0 border-b border-border whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.job_id} className="border-b border-border last:border-0 hover:bg-bg">
                  <td className="px-4 py-2 border-b border-border max-w-[420px]">
                    <span className="block truncate text-fg" title={r.title}>{r.title}</span>
                  </td>
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
              {list.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-fg-subtle text-[12px]">No hay envíos en este filtro</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="flex-1 min-w-[120px] px-5 py-3.5">
      <div className="flex items-center gap-1.5 text-[11px] text-fg-muted font-medium">
        {accent && <span className={`size-1.5 rounded-full ${accent}`} aria-hidden />}
        {label}
      </div>
      <div className="text-[24px] font-semibold tabular-nums tracking-tight text-fg leading-tight mt-1">{value}</div>
    </div>
  )
}

function Empty() {
  return <div className="text-[11px] text-fg-subtle py-6 text-center">Sin datos todavía</div>
}
