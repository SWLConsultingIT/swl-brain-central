'use client'

import { useMemo, useState } from 'react'
import type { JobRow } from '@/lib/jobs/list'
import JobCard from './job-card'
import JobTable from './job-table'
import { isFresh } from './job-meta'

type Column = {
  status: string
  label: string
  dotClass: string
  countClass: string
  windowDays?: number
}

const COLUMNS: Column[] = [
  { status: 'proposal_drafted', label: 'Proposal',          dotClass: 'bg-info',       countClass: 'text-info' },
  { status: 'ready_to_send',    label: 'Ready to Send',     dotClass: 'bg-violet',     countClass: 'text-violet' },
  { status: 'sent',             label: 'Sent',              dotClass: 'bg-fg',         countClass: 'text-fg' },
  { status: 'responded',        label: 'Responded',         dotClass: 'bg-accent',     countClass: 'text-accent-fg' },
  { status: 'discarded',        label: 'Discarded',         dotClass: 'bg-fg-subtle',  countClass: 'text-fg-subtle', windowDays: 3 },
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

type SavedView = {
  id: string
  label: string
  filter: (j: JobRow) => boolean
}

const SAVED_VIEWS: SavedView[] = [
  { id: 'all',       label: 'All',          filter: () => true },
  { id: 'drafts',    label: 'Drafts',       filter: j => !!j.cover_letter_draft && (j.status === 'qualified' || j.status === 'proposal_drafted') },
  { id: 'review',    label: 'Review',       filter: j => j.status === 'discarded_review' },
]

type ViewMode = 'board' | 'table'

export default function Board({ jobs, businessUnits }: { jobs: JobRow[]; businessUnits: BU[] }) {
  const [view, setView] = useState<ViewMode>('board')
  const [savedView, setSavedView] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [buId, setBuId] = useState<string>('all')
  const [country, setCountry] = useState<string>('all')
  const [minScore, setMinScore] = useState<number>(0)

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
    const sent = jobs.filter(j => j.status === 'sent').length
    const fresh = jobs.filter(j => isFresh(j.post_date, 24)).length
    return { total: jobs.length, qualified, drafts, sent, fresh }
  }, [jobs])

  const savedFilter = useMemo(
    () => SAVED_VIEWS.find(v => v.id === savedView)?.filter ?? (() => true),
    [savedView],
  )

  const savedViewCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const v of SAVED_VIEWS) m[v.id] = jobs.filter(v.filter).length
    return m
  }, [jobs])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return jobs.filter(j => {
      if (!savedFilter(j)) return false
      if (q && !j.title.toLowerCase().includes(q)) return false
      if (buId !== 'all' && j.business_unit_id !== buId) return false
      if (country !== 'all' && j.country !== country) return false
      if (minScore > 0 && (j.classifier_score ?? 0) < minScore) return false
      return true
    })
  }, [jobs, query, buId, country, minScore, savedFilter])

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
    setSavedView('all')
  }

  return (
    <>
      {/* Hero KPI strip */}
      <div className="px-8 pt-6 pb-2 max-w-[2400px] mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Total" value={kpis.total} />
          <Kpi label="Fresh 24h" value={kpis.fresh} />
          <Kpi label="Qualified" value={kpis.qualified} />
          <Kpi label="Drafts" value={kpis.drafts} />
          <Kpi label="Sent" value={kpis.sent} />
        </div>
      </div>

      {/* Saved view tabs */}
      <div className="border-b border-border bg-bg/40">
        <div className="px-8 max-w-[2400px] mx-auto flex items-center gap-1 overflow-x-auto kanban-scroll">
          {SAVED_VIEWS.map(v => {
            const active = savedView === v.id
            const count = savedViewCounts[v.id]
            return (
              <button
                key={v.id}
                onClick={() => setSavedView(v.id)}
                className={`relative inline-flex items-center gap-2 px-3 py-3 text-[13px] font-medium whitespace-nowrap transition-colors ${
                  active ? 'text-fg' : 'text-fg-muted hover:text-fg'
                }`}
              >
                <span className={`size-1.5 rounded-full ${active ? 'bg-fg' : 'bg-fg-subtle'}`} aria-hidden />
                <span>{v.label}</span>
                <span className={`font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded ${
                  active ? 'bg-fg text-bg' : 'bg-bg text-fg-subtle'
                }`}>
                  {count}
                </span>
                {active && <span className="absolute bottom-0 left-2 right-2 h-px bg-fg" />}
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
              placeholder="Search by title…"
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

          <div className="flex items-center gap-3 ml-auto text-[12px] text-fg-muted">
            <span className="font-mono tabular-nums">
              <span className="font-semibold text-fg">{filtered.length}</span>
              <span className="text-fg-subtle"> / {jobs.length}</span>
            </span>
            {activeFilters > 0 && (
              <button onClick={clearAll} className="text-fg-muted hover:text-fg transition-colors font-medium">
                Clear ({activeFilters})
              </button>
            )}

            {/* View switcher */}
            <div className="inline-flex items-center bg-bg border border-border rounded-md p-0.5">
              <button
                onClick={() => setView('board')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium transition-colors ${
                  view === 'board' ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
                }`}
                title="Board view"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <rect x="1.5" y="2" width="3.5" height="12" rx="1" stroke="currentColor" strokeWidth="1.4" />
                  <rect x="6.25" y="2" width="3.5" height="9" rx="1" stroke="currentColor" strokeWidth="1.4" />
                  <rect x="11" y="2" width="3.5" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                Board
              </button>
              <button
                onClick={() => setView('table')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium transition-colors ${
                  view === 'table' ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg'
                }`}
                title="Table view"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <rect x="1.5" y="2.5" width="13" height="11" rx="1" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M1.5 6.5h13M1.5 10h13M5.5 2.5v11" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                Table
              </button>
            </div>
          </div>
        </div>
      </div>

      {view === 'board' ? (
        <div className="kanban-scroll overflow-x-auto px-8 py-8">
          <div className="flex gap-6 min-w-max">
            {COLUMNS.map(col => {
              const items = byStatus.get(col.status) ?? []
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
                      <div className="text-[11px] text-fg-subtle/70 px-3 py-8 text-center font-mono">
                        empty
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
          <JobTable jobs={filtered} buNames={buNames} />
        </div>
      )}
    </>
  )
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface border border-border/60 rounded-lg px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.1em] text-fg-muted font-semibold">{label}</div>
      <div className="text-2xl font-bold tabular-nums tracking-tight mt-1 text-fg">
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
