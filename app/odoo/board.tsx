'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OdooLead } from '@/lib/odoo-leads/list'
import { countryFlag } from '@/app/prospects/job-meta'

const STATUS_LABEL: Record<string, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  interested: 'Interesado',
  discarded: 'Descartado',
}

const STATUS_PILL: Record<string, string> = {
  new: 'bg-accent-bg text-accent-fg',
  contacted: 'bg-slate-bg text-fg-muted',
  interested: 'bg-violet-bg text-violet',
  discarded: 'bg-slate-bg text-fg-subtle',
}

type View = { id: string; label: string; statuses: string[] | null }

const VIEWS: View[] = [
  { id: 'new', label: 'Nuevos', statuses: ['new'] },
  { id: 'contacted', label: 'Contactados', statuses: ['contacted'] },
  { id: 'interested', label: 'Interesados', statuses: ['interested'] },
  { id: 'discarded', label: 'Descartados', statuses: ['discarded'] },
  { id: 'all', label: 'Todos', statuses: null },
]

export default function Board({ leads }: { leads: OdooLead[] }) {
  const [viewId, setViewId] = useState('new')
  const [query, setQuery] = useState('')

  const kpis = useMemo(() => {
    const by = (s: string) => leads.filter((l) => l.status === s).length
    return { total: leads.length, nuevos: by('new'), contactados: by('contacted'), interesados: by('interested') }
  }, [leads])

  const activeView = useMemo(() => VIEWS.find((v) => v.id === viewId) ?? VIEWS[0], [viewId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return leads.filter((l) => {
      if (q) {
        const hay = `${l.name ?? ''} ${l.company ?? ''} ${l.email ?? ''} ${l.country ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [leads, query])

  const viewCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const v of VIEWS) m[v.id] = v.statuses === null ? filtered.length : filtered.filter((l) => v.statuses!.includes(l.status)).length
    return m
  }, [filtered])

  const rows = useMemo(
    () => (activeView.statuses === null ? filtered : filtered.filter((l) => activeView.statuses!.includes(l.status))),
    [filtered, activeView],
  )

  return (
    <>
      {/* KPI strip */}
      <div className="px-8 pt-6 pb-2 max-w-[2400px] mx-auto">
        <div className="bg-surface border border-border rounded-xl flex flex-wrap divide-x divide-border overflow-hidden">
          <Kpi label="Total" value={kpis.total} />
          <Kpi label="Nuevos" value={kpis.nuevos} accent="bg-accent" />
          <Kpi label="Contactados" value={kpis.contactados} accent="bg-fg" />
          <Kpi label="Interesados" value={kpis.interesados} accent="bg-violet" />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border bg-bg/40">
        <div className="px-8 max-w-[2400px] mx-auto flex items-center gap-1 overflow-x-auto">
          {VIEWS.map((v) => {
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

      {/* Search */}
      <div className="border-b border-border bg-surface/60 sticky top-[57px] z-[9]">
        <div className="px-8 py-3 max-w-[2400px] mx-auto flex items-center gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nombre, empresa, email o país…"
            className="w-full max-w-md px-3 py-1.5 text-[13px] bg-bg border border-border rounded-md placeholder:text-fg-subtle focus:outline-none focus:border-fg focus:bg-surface transition-colors"
          />
          <span className="ml-auto text-[12px] text-fg-muted font-mono tabular-nums">
            <span className="font-semibold text-fg">{rows.length}</span>
            <span className="text-fg-subtle"> / {leads.length}</span>
          </span>
        </div>
      </div>

      <div className="px-8 py-6 max-w-[2400px] mx-auto">
        <Table leads={rows} />
      </div>
    </>
  )
}

function Table({ leads }: { leads: OdooLead[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function setStatus(id: string, status: string) {
    setBusy(id)
    try {
      const r = await fetch(`/api/odoo-leads/${id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!r.ok) { alert('No se pudo actualizar: ' + (await r.text())); return }
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  if (leads.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl px-4 py-12 text-center text-fg-subtle font-mono text-[12px]">
        no hay leads acá
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-260px)]">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              {['Nombre', 'Empresa', 'País', 'Email', 'Teléfono', 'Recibido', 'Estado', ''].map((h, i) => (
                <th
                  key={h || i}
                  className={`font-medium text-fg-muted text-[12px] px-3 py-2.5 bg-bg sticky top-0 z-20 border-b border-r border-border whitespace-nowrap text-left ${
                    i === 0 ? 'sticky left-0 z-30 pl-4' : ''
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0 hover:bg-bg group transition-colors">
                <td className="px-3 py-2 pl-4 align-middle border-b border-r border-border sticky left-0 z-10 bg-surface group-hover:bg-bg min-w-[160px]">
                  <span className="font-medium text-fg text-[13px]">{l.name ?? '—'}</span>
                </td>
                <td className="px-3 py-2 align-middle border-b border-r border-border whitespace-nowrap">
                  <span className="text-[12px] text-fg-muted">{l.company ?? '—'}</span>
                </td>
                <td className="px-3 py-2 align-middle border-b border-r border-border whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted">
                    {countryFlag(l.country) && <span className="text-sm">{countryFlag(l.country)}</span>}
                    {l.country ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2 align-middle border-b border-r border-border whitespace-nowrap">
                  {l.email ? (
                    <a href={`mailto:${l.email}`} onClick={(e) => e.stopPropagation()} className="text-[12px] text-accent-fg hover:underline">{l.email}</a>
                  ) : <span className="text-fg-subtle">—</span>}
                </td>
                <td className="px-3 py-2 align-middle border-b border-r border-border whitespace-nowrap">
                  {l.phone ? (
                    <a href={`tel:${l.phone}`} onClick={(e) => e.stopPropagation()} className="text-[12px] text-fg-muted hover:text-fg">{l.phone}</a>
                  ) : <span className="text-fg-subtle">—</span>}
                </td>
                <td className="px-3 py-2 align-middle border-b border-r border-border whitespace-nowrap">
                  <span className="font-mono text-[10px] text-fg-muted">
                    {l.email_received_at ? new Date(l.email_received_at).toLocaleDateString('es-AR', { dateStyle: 'short' }) : '—'}
                  </span>
                </td>
                <td className="px-3 py-2 align-middle border-b border-r border-border whitespace-nowrap">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_PILL[l.status] ?? 'bg-slate-bg text-fg-muted'}`}>
                    {STATUS_LABEL[l.status] ?? l.status}
                  </span>
                </td>
                <td className="px-3 py-2 align-middle whitespace-nowrap text-right">
                  <div className="inline-flex items-center gap-1.5">
                    {l.portal_link && (
                      <a href={l.portal_link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="font-mono text-[10px] text-fg-subtle hover:text-fg whitespace-nowrap" title="Portal del contacto en Odoo">portal ↗</a>
                    )}
                    {l.status !== 'contacted' && (
                      <StatusBtn label="Contactado" onClick={() => setStatus(l.id, 'contacted')} disabled={busy === l.id} />
                    )}
                    {l.status !== 'interested' && (
                      <StatusBtn label="Interesado" onClick={() => setStatus(l.id, 'interested')} disabled={busy === l.id} />
                    )}
                    {l.status !== 'discarded' && (
                      <StatusBtn label="Descartar" tone="danger" onClick={() => setStatus(l.id, 'discarded')} disabled={busy === l.id} />
                    )}
                    {l.status === 'discarded' && (
                      <StatusBtn label="Reactivar" onClick={() => setStatus(l.id, 'new')} disabled={busy === l.id} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusBtn({ label, onClick, disabled, tone }: { label: string; onClick: () => void; disabled?: boolean; tone?: 'danger' }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      disabled={disabled}
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer disabled:opacity-40 whitespace-nowrap ${
        tone === 'danger' ? 'border-border text-fg-muted hover:text-destructive hover:border-destructive/40' : 'border-border text-fg hover:bg-bg'
      }`}
    >
      {label}
    </button>
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
