'use client'

import { useMemo, useState } from 'react'
import type { LinkedInJobRow } from '@/lib/linkedin/list'
import LinkedInTable, { LINKEDIN_VIEW_COLUMNS } from './linkedin-table'
import LinkedInDetailModal from './job-detail-modal'
import { linkedinPct, isHotLead } from '@/lib/linkedin/score'
import { STATUS_META, countryFlag, postedAgo, isFresh } from '@/app/prospects/job-meta'

type BU = { id: string; name: string }

type Column = { status: string; label: string; dotClass: string; countClass: string; windowDays?: number; emptyText: string }

const COLUMNS: Column[] = [
  { status: 'new',              label: 'Nuevos',        dotClass: 'bg-slate',      countClass: 'text-slate',     emptyText: 'Sin jobs nuevos' },
  { status: 'qualified',        label: 'Qualified',     dotClass: 'bg-accent',     countClass: 'text-accent-fg', emptyText: 'Nada qualified' },
  { status: 'proposal_drafted', label: 'Proposal',      dotClass: 'bg-info',       countClass: 'text-info',      emptyText: 'Sin notas para revisar' },
  { status: 'sent',             label: 'Sent',          dotClass: 'bg-fg',         countClass: 'text-fg',        emptyText: 'Nada aplicado' },
  { status: 'discarded_review', label: 'Para Chequear', dotClass: 'bg-warning',    countClass: 'text-warning',   emptyText: 'Nada para chequear' },
  { status: 'discarded',        label: 'Discarded',     dotClass: 'bg-fg-subtle',  countClass: 'text-fg-subtle', windowDays: 3, emptyText: 'Sin descartes recientes' },
]

type View = { id: string; label: string; statuses: string[] | null; columnsKey?: keyof typeof LINKEDIN_VIEW_COLUMNS }

const VIEWS: View[] = [
  { id: 'check_proposal', label: 'Check Proposal', statuses: ['proposal_drafted'], columnsKey: 'check_proposal' },
  { id: 'qualified',      label: 'Qualified',      statuses: ['qualified'],        columnsKey: 'qualified' },
  { id: 'pipeline',       label: 'Nuevos',         statuses: ['new', 'prequalified'], columnsKey: 'pipeline' },
  { id: 'sent',           label: 'Sent',           statuses: ['sent', 'responded'], columnsKey: 'sent' },
  { id: 'review',         label: 'Para Chequear',  statuses: ['discarded_review'], columnsKey: 'review' },
  { id: 'discarded',      label: 'Discarded',      statuses: ['discarded'],        columnsKey: 'discarded' },
  { id: 'estado',         label: 'By Status',      statuses: null },
]

export default function Board({ jobs, businessUnits }: { jobs: LinkedInJobRow[]; businessUnits: BU[] }) {
  const [viewId, setViewId] = useState('check_proposal')
  const [query, setQuery] = useState('')
  const [buId, setBuId] = useState('all')
  const [country, setCountry] = useState('all')
  const [minScore, setMinScore] = useState(0)
  const [sortBy, setSortBy] = useState<'score' | 'recent'>('score')

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
    const qualified = jobs.filter(j => ['qualified', 'proposal_drafted', 'ready_to_send'].includes(j.status)).length
    const drafts = jobs.filter(j => !!j.cover_letter_draft).length
    const sent = jobs.filter(j => j.status === 'sent' || j.status === 'responded').length
    const fresh = jobs.filter(j => isFresh(j.post_date, 24)).length
    return { total: jobs.length, qualified, drafts, sent, fresh }
  }, [jobs])

  const activeView = useMemo(() => VIEWS.find(v => v.id === viewId) ?? VIEWS[0], [viewId])
  const isBoardView = activeView.statuses === null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return jobs.filter(j => {
      if (q) {
        const hay = `${j.title} ${j.company_name ?? ''} ${j.description ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (buId !== 'all' && j.business_unit_id !== buId) return false
      if (country !== 'all' && j.country !== country) return false
      if (minScore > 0 && (linkedinPct(j) ?? 0) < minScore) return false
      return true
    })
  }, [jobs, query, buId, country, minScore])

  const viewCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const v of VIEWS) {
      m[v.id] = v.statuses === null ? filtered.length : filtered.filter(j => v.statuses!.includes(j.status)).length
    }
    return m
  }, [filtered])

  const tableRows = useMemo(() => {
    if (isBoardView || !activeView.statuses) return []
    return filtered.filter(j => activeView.statuses!.includes(j.status))
  }, [filtered, isBoardView, activeView])

  const byStatus = useMemo(() => {
    const now = Date.now()
    const map = new Map<string, LinkedInJobRow[]>()
    const windows = new Map<string, number | undefined>()
    for (const c of COLUMNS) { map.set(c.status, []); windows.set(c.status, c.windowDays) }
    for (const j of filtered) {
      if (!map.has(j.status)) continue
      const windowDays = windows.get(j.status)
      if (windowDays != null) {
        const ts = j.updated_at ?? j.created_at
        if ((now - new Date(ts).getTime()) / 86400000 > windowDays) continue
      }
      map.get(j.status)!.push(j)
    }
    return map
  }, [filtered])

  const ageDays = (j: LinkedInJobRow) => j.post_date ? Math.floor((Date.now() - new Date(j.post_date).getTime()) / 86400000) : 9999
  const byDate = (a: LinkedInJobRow, b: LinkedInJobRow) => (b.post_date ?? '').localeCompare(a.post_date ?? '')
  const pct = (j: LinkedInJobRow) => linkedinPct(j) ?? -1
  const sortJobs = (arr: LinkedInJobRow[]) => [...arr].sort((a, b) =>
    sortBy === 'recent' ? byDate(a, b) : (ageDays(a) - ageDays(b)) || (pct(b) - pct(a)) || byDate(a, b))

  const activeFilters = (query.trim() ? 1 : 0) + (buId !== 'all' ? 1 : 0) + (country !== 'all' ? 1 : 0) + (minScore > 0 ? 1 : 0)
  const clearAll = () => { setQuery(''); setBuId('all'); setCountry('all'); setMinScore(0) }

  return (
    <>
      {/* Hero KPI strip */}
      <div className="px-8 pt-6 pb-2 max-w-[2400px] mx-auto">
        <div className="bg-surface border border-border rounded-xl flex flex-wrap divide-x divide-border overflow-hidden">
          <Kpi label="Total" value={kpis.total} />
          <Kpi label="Fresh 24h" value={kpis.fresh} accent="bg-warning" />
          <Kpi label="Qualified" value={kpis.qualified} accent="bg-accent" />
          <Kpi label="Drafts" value={kpis.drafts} accent="bg-violet" />
          <Kpi label="Sent" value={kpis.sent} accent="bg-fg" />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border bg-bg/40">
        <div className="px-8 max-w-[2400px] mx-auto flex items-center gap-1 overflow-x-auto kanban-scroll">
          {VIEWS.map(v => {
            const active = viewId === v.id
            return (
              <button
                key={v.id}
                onClick={() => setViewId(v.id)}
                className={`inline-flex items-center gap-2 my-2 px-3 py-1.5 text-[13px] font-medium whitespace-nowrap rounded-md transition-colors ${
                  active ? 'bg-surface text-fg border border-border shadow-sm' : 'text-fg-muted hover:text-fg hover:bg-surface/60'
                }`}
              >
                <span>{v.label}</span>
                <span className={`font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded ${active ? 'bg-fg text-bg' : 'bg-border text-fg-subtle'}`}>
                  {viewCounts[v.id]}
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
              placeholder="Buscar título, empresa o descripción…"
              className="w-full pl-8 pr-3 py-1.5 text-[13px] bg-bg border border-border rounded-md placeholder:text-fg-subtle focus:outline-none focus:border-fg focus:bg-surface transition-colors"
            />
          </div>
          <Select label="BU" value={buId} onChange={setBuId} options={[{ value: 'all', label: 'All BUs' }, ...businessUnits.map(b => ({ value: b.id, label: b.name }))]} />
          <Select label="Country" value={country} onChange={setCountry} options={[{ value: 'all', label: 'All' }, ...countries.map(c => ({ value: c, label: c }))]} />
          <Select label="Min score" value={String(minScore)} onChange={v => setMinScore(Number(v))} options={[{ value: '0', label: 'Any' }, { value: '40', label: '≥ 40' }, { value: '60', label: '≥ 60' }, { value: '70', label: '≥ 70' }, { value: '80', label: '≥ 80' }]} />
          <Select label="Sort" value={sortBy} onChange={v => setSortBy(v as 'score' | 'recent')} options={[{ value: 'score', label: 'Fresh + best' }, { value: 'recent', label: 'Newest' }]} />
          <div className="flex items-center gap-3 ml-auto text-[12px] text-fg-muted">
            <span className="font-mono tabular-nums">
              <span className="font-semibold text-fg">{isBoardView ? filtered.length : tableRows.length}</span>
              <span className="text-fg-subtle"> / {jobs.length}</span>
            </span>
            {activeFilters > 0 && (
              <button onClick={clearAll} className="text-fg-muted hover:text-fg transition-colors font-medium">Clear ({activeFilters})</button>
            )}
          </div>
        </div>
      </div>

      {isBoardView ? (
        <div className="kanban-scroll overflow-x-auto px-8 py-8">
          <div className="flex gap-6 min-w-max">
            {COLUMNS.map(col => {
              const items = sortJobs(byStatus.get(col.status) ?? [])
              return (
                <div key={col.status} className="w-[320px] flex-shrink-0">
                  <div className="px-1 pb-4 mb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`size-1.5 rounded-full ${col.dotClass}`} aria-hidden />
                        <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg">{col.label}</h2>
                        {col.windowDays != null && <span className="text-[10px] font-mono text-fg-subtle">· {col.windowDays}d</span>}
                      </div>
                      <span className={`font-mono text-[11px] tabular-nums font-semibold ${col.countClass}`}>{items.length}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {items.map(j => <KanbanCard key={j.id} job={j} buNames={buNames} />)}
                    {items.length === 0 && <div className="text-[11px] text-fg-subtle px-3 py-8 text-center">{col.emptyText}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="px-8 py-6 max-w-[2400px] mx-auto">
          <LinkedInTable jobs={tableRows} columns={activeView.columnsKey ? LINKEDIN_VIEW_COLUMNS[activeView.columnsKey] : []} buNames={buNames} sortBy={sortBy} />
        </div>
      )}
    </>
  )
}

function KanbanCard({ job, buNames }: { job: LinkedInJobRow; buNames: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const score = linkedinPct(job)
  const flow = (job.business_unit_id ? buNames[job.business_unit_id] : null) ?? job.classifier_area
  const hot = isHotLead(job)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left bg-surface border border-border rounded-lg p-3 hover:border-fg/30 hover:shadow-sm transition-all"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[13px] font-medium text-fg line-clamp-2">{job.title}</span>
          {hot && <span className="text-[12px] shrink-0" title="Aplicá ya">🔥</span>}
        </div>
        <div className="mt-1.5 text-[11px] text-fg-muted truncate">{job.company_name ?? '—'}</div>
        <div className="mt-2 flex items-center gap-2 flex-wrap text-[10px]">
          {flow && <span className="px-1.5 py-0.5 rounded bg-bg border border-border text-fg-muted">{flow}</span>}
          {job.employment_type && <span className="px-1.5 py-0.5 rounded bg-slate-bg text-fg-muted">{job.employment_type}</span>}
          {score != null && <span className="font-mono font-semibold text-fg-muted">{score}%</span>}
          {job.applicants_count != null && <span className="font-mono text-fg-subtle">{job.applicants_count} appl.</span>}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-fg-subtle">
          {countryFlag(job.country)}<span className="truncate">{job.location ?? job.country ?? ''}</span>
          {job.post_date && <span className="ml-auto font-mono">{postedAgo(job.post_date)}</span>}
        </div>
      </button>
      {open && <LinkedInDetailModal job={job} buNames={buNames} onClose={() => setOpen(false)} />}
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
      <div className="text-[24px] font-semibold tabular-nums tracking-tight text-fg leading-tight mt-1">{value.toLocaleString()}</div>
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[12px]">
      <span className="text-fg-muted font-medium">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="appearance-none pl-2.5 pr-7 py-1.5 text-[13px] bg-bg border border-border rounded-md text-fg font-medium focus:outline-none focus:border-fg focus:bg-surface transition-colors cursor-pointer"
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </label>
  )
}
