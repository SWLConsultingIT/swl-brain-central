'use client'

import { useMemo, useState } from 'react'
import type { JobRow } from '@/lib/jobs/list'
import JobCard from './job-card'
import NotionTable, { NOTION_VIEW_COLUMNS } from './notion-table'
import { matchPct } from '@/lib/jobs/score'
import { isFresh } from './job-meta'

type Column = {
  status: string
  label: string
  dotClass: string
  countClass: string
  windowDays?: number
  emptyText: string
}

const COLUMNS: Column[] = [
  { status: 'proposal_drafted', label: 'Proposal',          dotClass: 'bg-info',       countClass: 'text-info',      emptyText: 'No drafts to review' },
  { status: 'sent',             label: 'Sent',              dotClass: 'bg-fg',         countClass: 'text-fg',        emptyText: 'Nothing sent yet' },
  { status: 'responded',        label: 'Responded',         dotClass: 'bg-accent',     countClass: 'text-accent-fg', emptyText: 'Awaiting replies' },
  { status: 'discarded_review', label: 'Para Chequear',     dotClass: 'bg-warning',    countClass: 'text-warning',   emptyText: 'Nada para chequear' },
  { status: 'discarded',        label: 'Discarded',         dotClass: 'bg-fg-subtle',  countClass: 'text-fg-subtle', windowDays: 3, emptyText: 'No discards in last 3 days' },
]

type BU = { id: string; name: string }

type ColStats = { count: number; avgScore: number | null; avgTicket: number | null }

function computeStats(items: JobRow[]): ColStats {
  if (items.length === 0) return { count: 0, avgScore: null, avgTicket: null }
  const scores = items.map(j => j.classifier_score).filter((n): n is number => n != null)
  const tickets = items
    .filter(j => (j.ticket_currency ?? 'USD') === 'USD')
    .map(j => j.ticket)
    .filter((n): n is number => n != null)
  return {
    count: items.length,
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    avgTicket: tickets.length ? Math.round(tickets.reduce((a, b) => a + b, 0) / tickets.length) : null,
  }
}

// Vistas estilo Notion. Cada tab filtra por status y define sus columnas.
// 'estado' es especial: muestra el kanban (Board) completo.
type NotionView = {
  id: string
  label: string
  status: string | null // null = kanban "Por estado"
  statuses?: string[]    // si está, la vista filtra por varios estados (en vez de status único)
  columnsKey?: keyof typeof NOTION_VIEW_COLUMNS
}

const NOTION_VIEWS: NotionView[] = [
  // 'Qualified' se quitó: es un estado de paso (casi siempre vacío). Los jobs viables
  // con carta viven en Check Proposal. La salud de qualified se vigila con el watchdog.
  { id: 'check_proposal', label: 'Check Proposal', status: 'proposal_drafted',  columnsKey: 'check_proposal' },
  // Hoja intermedia: jobs que se saturaron (≥40 propuestas / ≥4 interviews) y salieron
  // del pipeline solos, para que los revises antes de descartarlos del todo.
  { id: 'review',         label: 'Para Chequear',  status: 'discarded_review',  columnsKey: 'review' },
  // Sent = TODO lo que mandamos (enviados + los que ya respondieron). Los responded
  // se ven en verde acá y además aparecen en la solapa Client Reply.
  { id: 'sent',           label: 'Sent',           status: 'sent',   statuses: ['sent', 'responded'], columnsKey: 'sent' },
  // Clientes que contestaron en Upwork: al marcar "Client Reply" el job pasa de sent → responded.
  { id: 'client_reply',   label: 'Client Reply',   status: 'responded',         columnsKey: 'client_reply' },
  { id: 'discarded',      label: 'Discarded',      status: 'discarded',         columnsKey: 'discarded' },
  { id: 'estado',         label: 'By Status',      status: null },
]

export default function Board({ jobs, businessUnits }: { jobs: JobRow[]; businessUnits: BU[] }) {
  const [viewId, setViewId] = useState<string>('estado')
  const [query, setQuery] = useState('')
  const [buId, setBuId] = useState<string>('all')
  const [country, setCountry] = useState<string>('all')
  const [minScore, setMinScore] = useState<number>(0)
  const [sortBy, setSortBy] = useState<'score' | 'recent'>('score')

  // Orden compartido. 'recent' = más nuevos arriba. 'score' = FRESCO + MEJOR:
  // día más nuevo primero, y dentro de cada día el mejor score.
  const ageDays = (j: JobRow) => j.post_date ? Math.floor((Date.now() - new Date(j.post_date).getTime()) / 86400000) : 9999
  const byDate = (a: JobRow, b: JobRow) => (b.post_date ?? '').localeCompare(a.post_date ?? '')
  const sortJobs = (arr: JobRow[]) =>
    [...arr].sort((a, b) =>
      sortBy === 'recent'
        ? byDate(a, b)
        : (ageDays(a) - ageDays(b)) || (matchPct(b) - matchPct(a)) || byDate(a, b),
    )

  const buNames = useMemo(() => {
    const m: Record<string, string> = {}
    for (const b of businessUnits) m[b.id] = b.name
    return m
  }, [businessUnits])

  const countries = useMemo(() => {
    const set = new Set<string>()
    for (const j of jobs) if (j.country) set.add(j.country)
    return Array.from(set).sort()
  }, [jobs])

  const kpis = useMemo(() => {
    const qualified = jobs.filter(j =>
      j.status === 'qualified' ||
      j.status === 'proposal_drafted' ||
      j.status === 'ready_to_send'
    ).length
    const drafts = jobs.filter(j => !!j.cover_letter_draft).length
    const sent = jobs.filter(j => j.status === 'sent' || j.status === 'responded').length
    const fresh = jobs.filter(j => isFresh(j.post_date, 24)).length
    return { total: jobs.length, qualified, drafts, sent, fresh }
  }, [jobs])

  const activeView = useMemo(
    () => NOTION_VIEWS.find(v => v.id === viewId) ?? NOTION_VIEWS[NOTION_VIEWS.length - 1],
    [viewId],
  )
  const isBoardView = activeView.status === null

  // Filtros compartidos (búsqueda, BU, country, minScore) — aplican a todas las vistas.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return jobs.filter(j => {
      if (q) {
        const haystack = `${j.title} ${j.description ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (buId !== 'all' && j.business_unit_id !== buId) return false
      if (country !== 'all' && j.country !== country) return false
      if (minScore > 0 && matchPct(j) < minScore) return false
      return true
    })
  }, [jobs, query, buId, country, minScore])

  // Conteo por tab: respeta los filtros activos (búsqueda/BU/país/score) para que
  // el número de la solapa coincida con lo que muestra la tabla.
  const viewCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const v of NOTION_VIEWS) {
      const statuses = v.statuses ?? (v.status ? [v.status] : [])
      m[v.id] = v.status === null ? filtered.length : filtered.filter(j => statuses.includes(j.status)).length
    }
    return m
  }, [filtered])

  // Filas para la vista de tabla activa (filtra por el status de la vista).
  const tableRows = useMemo(() => {
    if (isBoardView || activeView.status === null) return []
    const statuses = activeView.statuses ?? [activeView.status]
    return filtered.filter(j => statuses.includes(j.status))
  }, [filtered, isBoardView, activeView])

  const byStatus = useMemo(() => {
    const now = Date.now()
    const map = new Map<string, JobRow[]>()
    const windows = new Map<string, number | undefined>()
    for (const c of COLUMNS) {
      map.set(c.status, [])
      windows.set(c.status, c.windowDays)
    }
    for (const j of filtered) {
      if (!map.has(j.status)) continue
      const windowDays = windows.get(j.status)
      if (windowDays != null) {
        const ts = j.updated_at ?? j.created_at
        const ageDays = (now - new Date(ts).getTime()) / (24 * 60 * 60 * 1000)
        if (ageDays > windowDays) continue
      }
      map.get(j.status)!.push(j)
    }
    return map
  }, [filtered])

  const activeFilters =
    (query.trim() ? 1 : 0) +
    (buId !== 'all' ? 1 : 0) +
    (country !== 'all' ? 1 : 0) +
    (minScore > 0 ? 1 : 0)

  const clearAll = () => {
    setQuery('')
    setBuId('all')
    setCountry('all')
    setMinScore(0)
  }

  return (
    <>
      {/* Hero KPI strip — barra de stats conectada (estilo Linear) */}
      <div className="px-8 pt-6 pb-2 max-w-[2400px] mx-auto">
        <div className="bg-surface border border-border rounded-xl flex flex-wrap divide-x divide-border overflow-hidden">
          <Kpi label="Total" value={kpis.total} />
          <Kpi label="Fresh 24h" value={kpis.fresh} accent="bg-warning" />
          <Kpi label="Qualified" value={kpis.qualified} accent="bg-accent" />
          <Kpi label="Drafts" value={kpis.drafts} accent="bg-violet" />
          <Kpi label="Sent" value={kpis.sent} accent="bg-fg" />
        </div>
      </div>

      {/* Notion-style view tabs */}
      <div className="border-b border-border bg-bg/40">
        <div className="px-8 max-w-[2400px] mx-auto flex items-center gap-1 overflow-x-auto kanban-scroll">
          {NOTION_VIEWS.map(v => {
            const active = viewId === v.id
            const count = viewCounts[v.id]
            return (
              <button
                key={v.id}
                onClick={() => setViewId(v.id)}
                className={`inline-flex items-center gap-2 my-2 px-3 py-1.5 text-[13px] font-medium whitespace-nowrap rounded-md transition-colors ${
                  active ? 'bg-surface text-fg border border-border shadow-sm' : 'text-fg-muted hover:text-fg hover:bg-surface/60'
                }`}
              >
                <span>{v.label}</span>
                <span className={`font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded ${
                  active ? 'bg-fg text-bg' : 'bg-border text-fg-subtle'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Filter bar */}
      <div className="border-b border-border bg-surface/60 backdrop-blur supports-[backdrop-filter]:bg-surface/40 sticky top-[57px] z-[9]">
        <div className="px-8 py-3 max-w-[2400px] mx-auto flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" aria-hidden>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search title or description…"
              className="w-full pl-8 pr-3 py-1.5 text-[13px] bg-bg border border-border rounded-md placeholder:text-fg-subtle focus:outline-none focus:border-fg focus:bg-surface transition-colors"
            />
          </div>

          <Select
            label="BU"
            value={buId}
            onChange={setBuId}
            options={[
              { value: 'all', label: 'All BUs' },
              ...businessUnits.map(b => ({ value: b.id, label: b.name })),
            ]}
          />

          <Select
            label="Country"
            value={country}
            onChange={setCountry}
            options={[
              { value: 'all', label: 'All' },
              ...countries.map(c => ({ value: c, label: c })),
            ]}
          />

          <Select
            label="Min score"
            value={String(minScore)}
            onChange={v => setMinScore(Number(v))}
            options={[
              { value: '0', label: 'Any' },
              { value: '40', label: '≥ 40' },
              { value: '60', label: '≥ 60' },
              { value: '70', label: '≥ 70' },
              { value: '80', label: '≥ 80' },
            ]}
          />

          <Select
            label="Sort"
            value={sortBy}
            onChange={v => setSortBy(v as 'score' | 'recent')}
            options={[
              { value: 'score', label: 'Fresh + best' },
              { value: 'recent', label: 'Newest' },
            ]}
          />

          <div className="flex items-center gap-3 ml-auto text-[12px] text-fg-muted">
            <span className="font-mono tabular-nums">
              <span className="font-semibold text-fg">{isBoardView ? filtered.length : tableRows.length}</span>
              <span className="text-fg-subtle"> / {jobs.length}</span>
            </span>
            {activeFilters > 0 && (
              <button onClick={clearAll} className="text-fg-muted hover:text-fg transition-colors font-medium">
                Clear ({activeFilters})
              </button>
            )}
          </div>
        </div>
      </div>

      {isBoardView ? (
        <div className="kanban-scroll overflow-x-auto px-8 py-8">
          <div className="flex gap-6 min-w-max">
            {COLUMNS.map(col => {
              const items = sortJobs(byStatus.get(col.status) ?? [])
              const stats = computeStats(items)
              return (
                <div key={col.status} className="w-[320px] flex-shrink-0">
                  <div className="px-1 pb-4 mb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`size-1.5 rounded-full ${col.dotClass}`} aria-hidden />
                        <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg">
                          {col.label}
                        </h2>
                        {col.windowDays != null && (
                          <span className="text-[10px] font-mono text-fg-subtle">· {col.windowDays}d</span>
                        )}
                      </div>
                      <span className={`font-mono text-[11px] tabular-nums font-semibold ${col.countClass}`}>
                        {stats.count}
                      </span>
                    </div>
                    {(stats.avgScore != null || stats.avgTicket != null) && (
                      <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-fg-subtle">
                        {stats.avgTicket != null && (
                          <span>
                            <span className="text-fg-muted">avg</span>{' '}
                            <span className="text-fg font-semibold tabular-nums">${stats.avgTicket}/h</span>
                          </span>
                        )}
                        {stats.avgTicket != null && stats.avgScore != null && <span className="text-fg-subtle/40">·</span>}
                        {stats.avgScore != null && (
                          <span>
                            <span className="text-fg-muted">score</span>{' '}
                            <span className="text-fg font-semibold tabular-nums">{stats.avgScore}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    {items.map(j => (
                      <JobCard key={j.id} job={j} />
                    ))}
                    {items.length === 0 && (
                      <div className="text-[11px] text-fg-subtle px-3 py-8 text-center">
                        {col.emptyText}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="px-8 py-6 max-w-[2400px] mx-auto">
          <NotionTable
            jobs={tableRows}
            columns={activeView.columnsKey ? NOTION_VIEW_COLUMNS[activeView.columnsKey] : []}
            buNames={buNames}
            sortBy={sortBy}
          />
        </div>
      )}
    </>
  )
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex-1 min-w-[120px] px-5 py-3.5">
      <div className="flex items-center gap-1.5 text-[11px] text-fg-muted font-medium">
        {accent && <span className={`size-1.5 rounded-full ${accent}`} aria-hidden />}
        {label}
      </div>
      <div className="text-[24px] font-semibold tabular-nums tracking-tight text-fg leading-tight mt-1">
        {value.toLocaleString()}
      </div>
    </div>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[12px]">
      <span className="text-fg-muted font-medium">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="appearance-none pl-2.5 pr-7 py-1.5 text-[13px] bg-bg border border-border rounded-md text-fg font-medium focus:outline-none focus:border-fg focus:bg-surface transition-colors cursor-pointer"
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </label>
  )
}
