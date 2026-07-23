'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LinkedInJobRow } from '@/lib/linkedin/list'
import { linkedinPct } from '@/lib/linkedin/score'
import { STATUS_META, countryFlag, postedAgo } from '@/app/prospects/job-meta'

export default function LinkedInDetailModal({
  job,
  buNames,
  onClose,
}: {
  job: LinkedInJobRow
  buNames: Record<string, string>
  onClose: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [cover, setCover] = useState(job.cover_letter_draft ?? '')
  const [notes, setNotes] = useState(job.notes ?? '')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  const score = linkedinPct(job)
  const flow = (job.business_unit_id ? buNames[job.business_unit_id] : null) ?? job.classifier_area
  const meta = STATUS_META[job.status]

  async function act(path: string, body?: unknown, refresh = true) {
    setBusy(path); setErr(null)
    try {
      const r = await fetch(`/api/linkedin/${job.id}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? `Error en ${path}`); return null }
      if (refresh) router.refresh()
      return d
    } finally { setBusy(null) }
  }

  const chips: [string, string | null][] = [
    ['Tipo', job.employment_type],
    ['Seniority', job.seniority],
    ['Función', job.job_function],
    ['Industry', job.industry],
    ['Applicants', job.applicants_count != null ? String(job.applicants_count) : null],
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-surface border border-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface/95 backdrop-blur border-b border-border px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {meta && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${meta.pillClass}`}>
                  <span>{meta.emoji}</span><span className="uppercase tracking-wide">{meta.label}</span>
                </span>
              )}
              {flow && <span className="text-[11px] text-fg-muted">· {flow}</span>}
              {score != null && <span className="text-[11px] font-mono text-fg-muted">· score {score}%</span>}
            </div>
            <h2 className="text-[17px] font-semibold text-fg leading-snug">{job.title}</h2>
            <div className="mt-1 flex items-center gap-2 text-[12px] text-fg-muted flex-wrap">
              {job.company_name && (
                job.company_url
                  ? <a href={job.company_url} target="_blank" rel="noreferrer" className="hover:text-fg hover:underline font-medium">{job.company_name}</a>
                  : <span className="font-medium">{job.company_name}</span>
              )}
              {(job.location || job.country) && (
                <span className="inline-flex items-center gap-1">{countryFlag(job.country)} {job.location ?? job.country}</span>
              )}
              {job.post_date && <span>· {postedAgo(job.post_date)}</span>}
              {job.matched_keyword && <span className="font-mono text-fg-subtle">· {job.matched_keyword}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-fg-subtle hover:text-fg text-[20px] leading-none shrink-0" aria-label="Cerrar">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {err && <div className="px-3 py-2 rounded-md bg-destructive-bg text-destructive text-[12px]">{err}</div>}

          {/* Chips */}
          <div className="flex flex-wrap gap-2">
            {chips.filter(([, v]) => v).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-bg border border-border text-[11px]">
                <span className="text-fg-subtle">{k}</span>
                <span className="text-fg font-medium">{v}</span>
              </span>
            ))}
            {job.link && (
              <a href={job.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-bg border border-border text-[11px] text-fg-muted hover:text-fg">
                Ver en LinkedIn ↗
              </a>
            )}
          </div>

          {/* Motivo del classifier */}
          {job.classifier_reason && (
            <div>
              <div className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-1">Análisis del classifier</div>
              <p className="text-[13px] text-fg-muted leading-relaxed">{job.classifier_reason}</p>
            </div>
          )}

          {/* Descripción */}
          {job.description && (
            <div>
              <div className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-1">Descripción</div>
              <div className="text-[13px] text-fg-muted leading-relaxed whitespace-pre-wrap max-h-[260px] overflow-y-auto rounded-md bg-bg border border-border p-3">
                {job.description}
              </div>
            </div>
          )}

          {/* Nota de aplicación */}
          {(job.cover_letter_draft || ['proposal_drafted', 'ready_to_send'].includes(job.status)) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide">Nota de aplicación</div>
                <button
                  onClick={() => { navigator.clipboard.writeText(cover); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                  className="text-[11px] text-fg-muted hover:text-fg"
                >
                  {copied ? '¡Copiada!' : 'Copiar'}
                </button>
              </div>
              <textarea
                value={cover}
                onChange={(e) => setCover(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 rounded-md border border-border bg-bg text-[13px] text-fg focus:outline-none focus:ring-1 focus:ring-accent resize-y"
              />
              <button
                onClick={() => act('update-cover-letter', { cover_letter: cover })}
                disabled={busy === 'update-cover-letter'}
                className="mt-2 px-3 py-1.5 rounded-md border border-border text-[12px] text-fg-muted hover:bg-bg disabled:opacity-50"
              >
                {busy === 'update-cover-letter' ? 'Guardando…' : 'Guardar nota'}
              </button>
            </div>
          )}

          {/* Notas humanas */}
          <div>
            <div className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide mb-1">Notas</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Notas internas…"
              className="w-full px-3 py-2 rounded-md border border-border bg-bg text-[13px] text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent resize-y"
            />
            <button
              onClick={() => act('notes', { notes }, false)}
              disabled={busy === 'notes'}
              className="mt-2 px-3 py-1.5 rounded-md border border-border text-[12px] text-fg-muted hover:bg-bg disabled:opacity-50"
            >
              {busy === 'notes' ? 'Guardando…' : 'Guardar notas'}
            </button>
          </div>
        </div>

        {/* Footer: acciones según estado */}
        <div className="sticky bottom-0 bg-surface/95 backdrop-blur border-t border-border px-6 py-3 flex items-center gap-2 flex-wrap justify-end">
          {['new', 'prequalified'].includes(job.status) && (
            <ActionBtn primary busy={busy === 'classify'} onClick={() => act('classify')}>Clasificar</ActionBtn>
          )}
          {job.status === 'qualified' && (
            <ActionBtn primary busy={busy === 'cover-letter'} onClick={() => act('cover-letter')}>Generar nota</ActionBtn>
          )}
          {['proposal_drafted', 'ready_to_send'].includes(job.status) && (
            <ActionBtn primary busy={busy === 'mark-sent'} onClick={() => act('mark-sent')}>Marcar enviado</ActionBtn>
          )}
          {['proposal_drafted', 'ready_to_send', 'qualified'].includes(job.status) && (
            <ActionBtn busy={busy === 'to-review'} onClick={() => act('to-review', {})}>A chequear</ActionBtn>
          )}
          <ActionBtn busy={busy === 'discard'} onClick={() => act('discard', { reason: 'ui_discard' })}>Descartar</ActionBtn>
        </div>
      </div>
    </div>
  )
}

function ActionBtn({ children, onClick, busy, primary }: { children: React.ReactNode; onClick: () => void; busy?: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors disabled:opacity-50 ${
        primary ? 'bg-fg text-bg hover:bg-fg-muted' : 'border border-border text-fg-muted hover:bg-bg'
      }`}
    >
      {busy ? '…' : children}
    </button>
  )
}
