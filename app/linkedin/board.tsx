'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LinkedInJobRow } from '@/lib/linkedin/list'

type BU = { id: string; name: string }

const VIEWS: { id: string; label: string; statuses: string[] | null }[] = [
  { id: 'check', label: 'Check Proposal', statuses: ['proposal_drafted'] },
  { id: 'qualified', label: 'Qualified', statuses: ['qualified'] },
  { id: 'pipeline', label: 'Nuevos', statuses: ['new', 'prequalified'] },
  { id: 'sent', label: 'Sent', statuses: ['sent', 'responded'] },
  { id: 'review', label: 'Para Chequear', statuses: ['discarded_review'] },
  { id: 'discarded', label: 'Discarded', statuses: ['discarded'] },
  { id: 'all', label: 'Todos', statuses: null },
]

export default function Board({ jobs, businessUnits }: { jobs: LinkedInJobRow[]; businessUnits: BU[] }) {
  const [viewId, setViewId] = useState('check')
  const [query, setQuery] = useState('')
  const [buId, setBuId] = useState('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const router = useRouter()

  const buNames = useMemo(() => {
    const m: Record<string, string> = {}
    for (const b of businessUnits) m[b.id] = b.name
    return m
  }, [businessUnits])

  const view = VIEWS.find(v => v.id === viewId) ?? VIEWS[0]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return jobs.filter(j => {
      if (view.statuses && !view.statuses.includes(j.status)) return false
      if (buId !== 'all' && j.business_unit_id !== buId) return false
      if (q) {
        const hay = `${j.title} ${j.company_name ?? ''} ${j.description ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [jobs, view, buId, query])

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const v of VIEWS) m[v.id] = jobs.filter(j => !v.statuses || v.statuses.includes(j.status)).length
    return m
  }, [jobs])

  async function act(id: string, path: string, body?: unknown) {
    setBusyId(id)
    try {
      const r = await fetch(`/api/linkedin/${id}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        alert(d.error ?? `Error en ${path}`)
      } else {
        router.refresh()
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      {/* Tabs */}
      <div className="border-b border-border bg-bg/40">
        <div className="px-8 max-w-[2400px] mx-auto flex items-center gap-1 overflow-x-auto">
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
                  {counts[v.id]}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Filtros */}
      <div className="border-b border-border bg-surface/60 sticky top-[57px] z-[9]">
        <div className="px-8 py-3 max-w-[2400px] mx-auto flex items-center gap-3 flex-wrap">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar título, empresa o descripción…"
            className="flex-1 min-w-[240px] max-w-md px-3 py-1.5 text-[13px] bg-bg border border-border rounded-md placeholder:text-fg-subtle focus:outline-none focus:border-fg"
          />
          <label className="inline-flex items-center gap-1.5 text-[12px]">
            <span className="text-fg-muted font-medium">BU</span>
            <select
              value={buId}
              onChange={e => setBuId(e.target.value)}
              className="px-2.5 py-1.5 text-[13px] bg-bg border border-border rounded-md text-fg font-medium focus:outline-none focus:border-fg cursor-pointer"
            >
              <option value="all">Todas</option>
              {businessUnits.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <span className="ml-auto text-[12px] text-fg-muted font-mono tabular-nums">
            <span className="font-semibold text-fg">{filtered.length}</span> / {jobs.length}
          </span>
        </div>
      </div>

      {/* Tabla */}
      <div className="px-8 py-6 max-w-[2400px] mx-auto overflow-x-auto">
        <table className="w-full text-[13px] border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-fg-subtle">
              {['Job', 'Empresa', 'Tipo', 'Seniority', 'Ubicación', 'BU', 'Score', 'Estado', 'Note', 'Acciones'].map(h => (
                <th key={h} className="px-3 py-2 border-b border-border font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(j => (
              <tr key={j.id} className="hover:bg-surface/60 transition-colors align-top">
                <td className="px-3 py-2.5 border-b border-border max-w-[320px]">
                  <a href={j.link ?? '#'} target="_blank" rel="noreferrer" className="font-medium text-fg hover:underline line-clamp-2">
                    {j.title}
                  </a>
                </td>
                <td className="px-3 py-2.5 border-b border-border text-fg-muted">{j.company_name ?? '—'}</td>
                <td className="px-3 py-2.5 border-b border-border">
                  {j.employment_type
                    ? <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent-fg text-[11px]">{j.employment_type}</span>
                    : '—'}
                </td>
                <td className="px-3 py-2.5 border-b border-border text-fg-muted">{j.seniority ?? '—'}</td>
                <td className="px-3 py-2.5 border-b border-border text-fg-muted">{j.location ?? j.country ?? '—'}</td>
                <td className="px-3 py-2.5 border-b border-border text-fg-muted">{j.business_unit_id ? (buNames[j.business_unit_id] ?? j.classifier_area) : (j.classifier_area ?? '—')}</td>
                <td className="px-3 py-2.5 border-b border-border font-mono tabular-nums">{j.classifier_score ?? '—'}</td>
                <td className="px-3 py-2.5 border-b border-border">
                  <span className="px-1.5 py-0.5 rounded bg-border/60 text-fg-muted text-[11px]">{j.status}</span>
                </td>
                <td className="px-3 py-2.5 border-b border-border text-center">{j.cover_letter_draft ? '📄' : '—'}</td>
                <td className="px-3 py-2.5 border-b border-border whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {['new', 'prequalified'].includes(j.status) && (
                      <ActionBtn disabled={busyId === j.id} onClick={() => act(j.id, 'classify')}>Clasificar</ActionBtn>
                    )}
                    {j.status === 'qualified' && (
                      <ActionBtn disabled={busyId === j.id} onClick={() => act(j.id, 'cover-letter')}>Generar nota</ActionBtn>
                    )}
                    {['proposal_drafted', 'ready_to_send'].includes(j.status) && (
                      <ActionBtn disabled={busyId === j.id} onClick={() => act(j.id, 'mark-sent')}>Marcar enviado</ActionBtn>
                    )}
                    {['proposal_drafted', 'ready_to_send', 'qualified'].includes(j.status) && (
                      <ActionBtn subtle disabled={busyId === j.id} onClick={() => act(j.id, 'to-review')}>A chequear</ActionBtn>
                    )}
                    <ActionBtn subtle disabled={busyId === j.id} onClick={() => act(j.id, 'discard', { reason: 'ui_discard' })}>✕</ActionBtn>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-12 text-center text-fg-subtle">Sin jobs en esta vista</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function ActionBtn({ children, onClick, disabled, subtle }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; subtle?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors disabled:opacity-40 ${
        subtle ? 'border border-border text-fg-muted hover:bg-bg' : 'bg-fg text-bg hover:bg-fg-muted'
      }`}
    >
      {children}
    </button>
  )
}
