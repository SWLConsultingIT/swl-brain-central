'use client'

import { useEffect, useState } from 'react'
import type { JobRow } from '@/lib/jobs/list'

type Props = {
  job: JobRow
  onClose: () => void
}

export default function JobDetailModal({ job, onClose }: Props) {
  const [draft, setDraft] = useState(job.cover_letter_draft ?? '')
  const [copied, setCopied] = useState(false)
  const [marking, setMarking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onEsc)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const copyCoverLetter = async () => {
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch (e) {
      setError('No se pudo copiar al portapapeles')
    }
  }

  const markAsSent = async () => {
    if (!confirm('¿Marcar como Sent? (Asume que ya enviaste la cover letter desde Upwork)')) return
    setMarking(true)
    setError(null)
    try {
      const res = await fetch(`/api/jobs/${job.id}/mark-sent`, { method: 'POST' })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || 'Error')
      }
      onClose()
      window.location.reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setMarking(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-fg leading-snug mb-1.5">{job.title}</h2>
            <div className="flex items-center gap-2 flex-wrap text-xs text-fg-muted">
              {job.classifier_area && (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-info-bg text-info font-medium">
                  {job.classifier_area}
                </span>
              )}
              {job.classifier_score != null && (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-accent-bg text-accent-fg font-semibold tabular-nums">
                  Score {job.classifier_score}
                </span>
              )}
              {job.hourly_average != null && (
                <span className="text-fg-muted">${job.hourly_average}/h</span>
              )}
              {job.duration && <span className="text-fg-subtle">· {job.duration}</span>}
              {job.country && <span className="text-fg-subtle">· {job.country}</span>}
              {job.proposals_count != null && (
                <span className="text-fg-subtle">· {job.proposals_count} props</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-fg-subtle hover:text-fg transition text-xl leading-none p-1"
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {job.classifier_reason && (
            <section>
              <h3 className="text-[11px] font-bold tracking-wide uppercase text-fg-muted mb-2">
                Razón del classifier
              </h3>
              <p className="text-sm text-fg leading-relaxed italic border-l-2 border-border-strong pl-3">
                {job.classifier_reason}
              </p>
            </section>
          )}

          {job.description && (
            <section>
              <details className="group">
                <summary className="text-[11px] font-bold tracking-wide uppercase text-fg-muted mb-2 cursor-pointer list-none flex items-center gap-1.5">
                  <span className="group-open:rotate-90 transition-transform">▶</span>
                  Descripción del job
                </summary>
                <p className="text-sm text-fg-muted leading-relaxed whitespace-pre-wrap mt-2 max-h-60 overflow-y-auto">
                  {job.description}
                </p>
              </details>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-bold tracking-wide uppercase text-fg-muted">
                Cover letter draft
              </h3>
              {job.cover_letter_generated_at && (
                <span className="text-[10px] text-fg-subtle">
                  Generada {new Date(job.cover_letter_generated_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              )}
            </div>
            {draft ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full min-h-[300px] text-sm text-fg bg-bg border border-border rounded-lg p-3 leading-relaxed font-sans resize-y focus:outline-none focus:border-border-strong"
                placeholder="Cover letter draft..."
              />
            ) : (
              <div className="text-sm text-fg-subtle italic border border-dashed border-border rounded-lg p-6 text-center">
                Todavía no se generó cover letter para este job.
              </div>
            )}
          </section>

          {error && (
            <div className="text-sm text-destructive bg-destructive-bg border border-destructive/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-border flex items-center gap-2 justify-end flex-wrap flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium text-fg-muted hover:text-fg transition rounded-lg"
          >
            Cerrar
          </button>
          {draft && (
            <button
              onClick={copyCoverLetter}
              className="px-3 py-1.5 text-sm font-semibold text-fg bg-surface-hover hover:bg-bg border border-border rounded-lg transition tabular-nums"
            >
              {copied ? '✓ Copiada' : '📋 Copiar cover letter'}
            </button>
          )}
          {job.link && (
            <a
              href={job.link}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 text-sm font-semibold text-info hover:bg-info-bg border border-info/30 rounded-lg transition"
            >
              ↗ Abrir en Upwork
            </a>
          )}
          {(job.status === 'proposal_drafted' || job.status === 'ready_to_send') && (
            <button
              onClick={markAsSent}
              disabled={marking}
              className="px-3 py-1.5 text-sm font-semibold text-bg bg-fg hover:opacity-90 rounded-lg transition disabled:opacity-50"
            >
              {marking ? 'Marcando…' : '✓ Marcar Sent'}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
