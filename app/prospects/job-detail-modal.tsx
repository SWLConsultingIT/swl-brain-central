'use client'

import { useEffect, useRef, useState } from 'react'
import type { JobRow } from '@/lib/jobs/list'

type Props = {
  job: JobRow
  onClose: () => void
}

export default function JobDetailModal({ job, onClose }: Props) {
  const original = job.cover_letter_draft ?? ''
  const originalNotes = job.notes ?? ''
  const [draft, setDraft] = useState(original)
  const [savedDraft, setSavedDraft] = useState(original)
  const [notes, setNotes] = useState(originalNotes)
  const [savedNotes, setSavedNotes] = useState(originalNotes)
  const [saving, setSaving] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [sending, setSending] = useState(false)
  const [marking, setMarking] = useState(false)
  const [responding, setResponding] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDirty = draft !== savedDraft
  const notesDirty = notes !== savedNotes
  const canEdit = job.status === 'proposal_drafted' || job.status === 'ready_to_send'

  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && canEdit && isDirty) {
        e.preventDefault()
        saveDraft()
      }
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, canEdit, isDirty, draft])

  const saveDraft = async () => {
    if (!isDirty) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/jobs/${job.id}/update-cover-letter`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draft }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed')
      setSavedDraft(draft)
      showToast('✓ Saved')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const saveNotes = async () => {
    if (!notesDirty) return
    setSavingNotes(true); setError(null)
    try {
      const res = await fetch(`/api/jobs/${job.id}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save notes failed')
      setSavedNotes(notes)
      showToast('✓ Notes saved')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSavingNotes(false)
    }
  }

  const markResponded = async () => {
    if (!confirm('Mark as Responded? (Client replied on Upwork)')) return
    setResponding(true); setError(null)
    try {
      const res = await fetch(`/api/jobs/${job.id}/mark-responded`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'mark-responded failed')
      onClose()
      window.location.reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setResponding(false)
    }
  }

  const copyCoverLetter = async () => {
    try {
      await navigator.clipboard.writeText(draft)
      showToast('✓ Copied to clipboard')
    } catch {
      setError('No se pudo copiar al portapapeles')
    }
  }

  const sendToUpwork = async () => {
    if (!job.link) {
      setError('Job has no Upwork link')
      return
    }
    setSending(true); setError(null)
    try {
      // 1. Persist any unsaved edit first
      if (isDirty) {
        const saveRes = await fetch(`/api/jobs/${job.id}/update-cover-letter`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ draft }),
        })
        if (!saveRes.ok) throw new Error((await saveRes.json()).error ?? 'Save failed')
        setSavedDraft(draft)
      }
      // 2. Copy to clipboard
      await navigator.clipboard.writeText(draft)
      // 3. Mark as ready_to_send (if currently proposal_drafted)
      if (job.status === 'proposal_drafted') {
        const markRes = await fetch(`/api/jobs/${job.id}/mark-ready`, { method: 'POST' })
        if (!markRes.ok) throw new Error((await markRes.json()).error ?? 'mark-ready failed')
      }
      // 4. Open Upwork in new tab
      window.open(job.link, '_blank', 'noopener')
      showToast('✓ Copied + ready. Paste in Upwork, then click Mark Sent')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const markAsSent = async () => {
    if (!confirm('Mark as Sent? (Confirms you already submitted on Upwork)')) return
    setMarking(true); setError(null)
    try {
      const res = await fetch(`/api/jobs/${job.id}/mark-sent`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.text()) || 'Error')
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
      className="fixed inset-0 z-50 bg-fg/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl shadow-card-hover w-full max-w-3xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-border flex items-start justify-between gap-4 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-fg leading-snug tracking-tight mb-1.5">{job.title}</h2>
            <div className="flex items-center gap-2 flex-wrap text-xs text-fg-muted font-mono">
              {job.classifier_area && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-bg border border-border text-fg-muted font-sans font-medium">
                  {job.classifier_area}
                </span>
              )}
              {job.classifier_score != null && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-sans font-semibold tabular-nums ${
                  job.classifier_score >= 70 ? 'bg-accent-bg text-accent-fg'
                  : job.classifier_score >= 40 ? 'bg-warning-bg text-warning'
                  : 'bg-bg border border-border text-fg-subtle'
                }`}>
                  {job.classifier_score}
                </span>
              )}
              {job.hourly_average != null && <span className="text-fg-muted">${job.hourly_average}/h</span>}
              {job.duration && <span className="text-fg-subtle">· {job.duration}</span>}
              {job.country && <span className="text-fg-subtle">· {job.country}</span>}
              {job.proposals_count != null && <span className="text-fg-subtle">· {job.proposals_count} props</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-fg-subtle hover:text-fg transition text-xl leading-none p-1"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {job.classifier_reason && (
            <section>
              <h3 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg-muted mb-2">
                Classifier reasoning
              </h3>
              <p className="text-sm text-fg-muted leading-relaxed italic border-l-2 border-border-strong pl-3">
                {job.classifier_reason}
              </p>
            </section>
          )}

          {job.description && (
            <section>
              <details className="group">
                <summary className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg-muted mb-2 cursor-pointer list-none flex items-center gap-1.5">
                  <span className="group-open:rotate-90 transition-transform">▶</span>
                  Job description
                </summary>
                <p className="text-sm text-fg-muted leading-relaxed whitespace-pre-wrap mt-2 max-h-60 overflow-y-auto">
                  {job.description}
                </p>
              </details>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg-muted">
                Cover letter draft
                {isDirty && <span className="ml-2 text-warning normal-case tracking-normal">· unsaved changes</span>}
              </h3>
              <div className="flex items-center gap-3 text-[10px] text-fg-subtle font-mono">
                {job.cover_letter_generated_at && (
                  <span>generated {new Date(job.cover_letter_generated_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                )}
                <span>{draft.length} chars</span>
              </div>
            </div>
            {original ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!canEdit}
                className={`w-full min-h-[300px] text-sm text-fg bg-bg border rounded-lg p-3 leading-relaxed font-sans resize-y focus:outline-none focus:border-border-focus transition-colors ${
                  isDirty ? 'border-warning/40' : 'border-border'
                } disabled:opacity-60 disabled:cursor-not-allowed`}
                placeholder="Cover letter draft..."
                spellCheck
              />
            ) : (
              <div className="text-sm text-fg-subtle italic border border-dashed border-border rounded-lg p-6 text-center">
                No cover letter generated for this job yet.
              </div>
            )}
            {canEdit && (
              <div className="mt-1.5 text-[10px] text-fg-subtle font-mono">
                ⌘+S to save · ESC to close
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg-muted">
                📓 Notes
                {notesDirty && <span className="ml-2 text-warning normal-case tracking-normal">· unsaved</span>}
              </h3>
              <button
                onClick={saveNotes}
                disabled={!notesDirty || savingNotes}
                className={`text-[11px] font-semibold px-2 py-0.5 rounded transition ${
                  notesDirty
                    ? 'bg-warning-bg text-warning hover:bg-warning/10'
                    : 'text-fg-subtle cursor-not-allowed opacity-60'
                }`}
              >
                {savingNotes ? 'Saving…' : notesDirty ? '💾 Save notes' : '✓ Saved'}
              </button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add comments about this job: sent at X, client viewed, follow-up sent, etc..."
              className={`w-full min-h-[100px] text-sm text-fg bg-bg border rounded-lg p-3 leading-relaxed font-sans resize-y focus:outline-none focus:border-border-focus transition-colors ${
                notesDirty ? 'border-warning/40' : 'border-border'
              }`}
              spellCheck
            />
          </section>

          {error && (
            <div className="text-sm text-destructive bg-destructive-bg border border-destructive/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-border flex items-center gap-2 justify-end flex-wrap flex-shrink-0 relative">
          {toast && (
            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-[12px] text-accent-fg bg-accent-bg border border-accent/20 px-3 py-1.5 rounded-md font-medium animate-in fade-in slide-in-from-left-2 duration-200">
              {toast}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[13px] font-medium text-fg-muted hover:text-fg transition rounded-lg"
            >
              Close
            </button>

            {canEdit && draft && (
              <button
                onClick={saveDraft}
                disabled={!isDirty || saving}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold rounded-lg border transition ${
                  isDirty
                    ? 'bg-warning-bg text-warning border-warning/30 hover:bg-warning/10'
                    : 'bg-bg text-fg-subtle border-border cursor-not-allowed opacity-60'
                }`}
                title="⌘+S"
              >
                {saving ? 'Saving…' : isDirty ? '💾 Save' : '✓ Saved'}
              </button>
            )}

            {draft && (
              <button
                onClick={copyCoverLetter}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-fg bg-surface hover:bg-bg border border-border rounded-lg transition"
              >
                📋 Copy
              </button>
            )}

            {draft && job.link && (job.status === 'proposal_drafted' || job.status === 'ready_to_send') && (
              <button
                onClick={sendToUpwork}
                disabled={sending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-bg bg-fg hover:opacity-90 rounded-lg transition disabled:opacity-50"
                title="Save + Copy + Mark Ready + Open Upwork"
              >
                {sending ? 'Sending…' : '🚀 Send to Upwork'}
              </button>
            )}

            {(job.status === 'proposal_drafted' || job.status === 'ready_to_send') && (
              <button
                onClick={markAsSent}
                disabled={marking}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-accent-fg bg-accent-bg hover:bg-accent/10 border border-accent/30 rounded-lg transition disabled:opacity-50"
              >
                {marking ? 'Marking…' : '✓ Mark Sent'}
              </button>
            )}

            {job.status === 'sent' && (
              <button
                onClick={markResponded}
                disabled={responding}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-accent-fg bg-accent-bg hover:bg-accent/10 border border-accent/30 rounded-lg transition disabled:opacity-50"
              >
                {responding ? 'Marking…' : '🟢 Mark Responded'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
