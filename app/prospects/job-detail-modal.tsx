'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { JobRow } from '@/lib/jobs/list'
import { CRITERIA, matchPct, discardReason } from '@/lib/jobs/score'
import { extractQuestions } from '@/lib/jobs/extract-questions'

type Props = {
  job: JobRow
  onClose: () => void
}

export default function JobDetailModal({ job, onClose }: Props) {
  const router = useRouter()
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
  const [discarding, setDiscarding] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDirty = draft !== savedDraft
  const notesDirty = notes !== savedNotes
  const canEdit = job.status === 'proposal_drafted' || job.status === 'ready_to_send'

  // Preguntas estructuradas (desde Upwork API). Si no las hay, fallback al extractor de description.
  const structuredQuestions = useMemo(() => {
    if (job.questions && job.questions.length > 0) {
      return job.questions.slice().sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0))
    }
    return null
  }, [job.questions])

  const fallbackQuestionTexts = useMemo(() => {
    if (structuredQuestions) return null
    return extractQuestions(job.description)
  }, [structuredQuestions, job.description])

  // State para las respuestas (editables, persistidas)
  type AnswerRow = { question: string; sequenceNumber: number; answer: string; edited_at: string | null }
  const initialAnswers: AnswerRow[] = (job.questions_answers ?? []) as AnswerRow[]
  const [answers, setAnswers] = useState<AnswerRow[]>(initialAnswers)
  const answersRef = useRef<AnswerRow[]>(initialAnswers)
  useEffect(() => { answersRef.current = answers }, [answers])
  const [generatingAnswers, setGeneratingAnswers] = useState(false)
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null)
  const answersSaveTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  // Auto-trigger lazy: si el job tiene preguntas estructuradas pero NO tiene respuestas guardadas, generarlas.
  // Solo se dispara para jobs qualified+ con BU asignada.
  useEffect(() => {
    const hasQuestions = structuredQuestions && structuredQuestions.length > 0
    const hasAnswers = initialAnswers.length > 0
    const eligibleStatus = ['qualified', 'proposal_drafted', 'ready_to_send', 'sent', 'responded'].includes(job.status)
    if (!hasQuestions || hasAnswers || !eligibleStatus || !job.business_unit_id) return

    let cancelled = false
    setGeneratingAnswers(true)
    fetch(`/api/jobs/${job.id}/answer-questions`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data?.answers && Array.isArray(data.answers)) {
          setAnswers(data.answers)
          if (!data.cached) showToast('✓ Answers generated')
        } else if (data?.error) {
          setError(`Answers: ${data.error}`)
        }
      })
      .catch((e) => !cancelled && setError(`Answers fetch failed: ${(e as Error).message}`))
      .finally(() => !cancelled && setGeneratingAnswers(false))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id])

  const saveAnswer = (idx: number, nextAnswer: string) => {
    setAnswers((prev) => {
      const copy = prev.slice()
      if (copy[idx]) copy[idx] = { ...copy[idx], answer: nextAnswer, edited_at: new Date().toISOString() }
      return copy
    })
    // debounce: 1.2s después de dejar de tipear
    if (answersSaveTimers.current.get(idx)) clearTimeout(answersSaveTimers.current.get(idx)!)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}/update-answers`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ answers: answersRef.current }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed')
        showToast('✓ Answer saved')
      } catch (e) {
        setError((e as Error).message)
      }
    }, 1200)
    answersSaveTimers.current.set(idx, timer)
  }

  const regenerateAnswer = async (idx: number) => {
    setRegeneratingIdx(idx); setError(null)
    try {
      const res = await fetch(`/api/jobs/${job.id}/answer-questions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Regenerate failed')
      if (data?.answers && Array.isArray(data.answers)) {
        setAnswers(data.answers)
        showToast('✓ Regenerated')
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRegeneratingIdx(null)
    }
  }

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
      router.refresh()
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
      // 3. Open Upwork in new tab. NO cambiamos el status: el job se queda en
      //    Check Proposal hasta que toques "Mark Sent" (ya no pasa por Ready to Send).
      window.open(job.link, '_blank', 'noopener')
      showToast('✓ Copiado. Pegá en Upwork y después tocá Mark Sent')
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
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setMarking(false)
    }
  }

  const discardJob = async () => {
    if (!confirm('Discard this job? (move it out of your list)')) return
    setDiscarding(true); setError(null)
    try {
      const res = await fetch(`/api/jobs/${job.id}/discard`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.text()) || 'Error')
      onClose()
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDiscarding(false)
    }
  }

  // "No me gusta" → manda el job a Para Chequear (discarded_review) sin descartarlo del todo.
  const sendToReview = async () => {
    if (!confirm('¿Mandar este job a "Para Chequear"?')) return
    setReviewing(true); setError(null)
    try {
      const res = await fetch(`/api/jobs/${job.id}/to-review`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.text()) || 'Error')
      onClose()
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setReviewing(false)
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
          {(job.status === 'discarded' || job.status === 'discarded_review') ? (
            <section>
              <h3 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-destructive mb-2">
                Por qué se descartó
              </h3>
              <p className="text-sm text-fg-muted leading-relaxed border-l-2 border-destructive pl-3">
                {discardReason(job)}
              </p>
            </section>
          ) : job.classifier_reason && (
            <section>
              <h3 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg-muted mb-2">
                Classifier reasoning
              </h3>
              <p className="text-sm text-fg-muted leading-relaxed italic border-l-2 border-border-strong pl-3">
                {job.classifier_reason}
              </p>
            </section>
          )}

          {/* Score breakdown — desglose determinístico (por qué tiene ese score) */}
          {(() => {
            const pct = matchPct(job)
            const met = CRITERIA.filter((c) => c.test(job)).length
            return (
              <section>
                <h3 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg-muted mb-3 flex items-center gap-2">
                  <span>Score breakdown</span>
                  <span className="text-fg-subtle normal-case tracking-normal font-mono">· {met}/{CRITERIA.length} → {pct}%</span>
                </h3>
                <ul className="space-y-1.5">
                  {CRITERIA.map((c, i) => {
                    const ok = c.test(job)
                    return (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <span className={`font-mono ${ok ? 'text-accent-fg' : 'text-fg-subtle'}`}>{ok ? '✓' : '✗'}</span>
                        <span className={ok ? 'text-fg' : 'text-fg-subtle'}>{c.label}</span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })()}

          {/* Client & activity — todos los datos scrapeados del cliente y del job */}
          {(() => {
            const fmtMoney = (n: number | null) =>
              n == null ? null : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`
            const rate =
              job.hourly_min != null || job.hourly_max != null
                ? `$${job.hourly_min ?? '?'}–$${job.hourly_max ?? '?'}/h`
                : job.hourly_average != null
                ? `$${job.hourly_average}/h`
                : null
            const payment =
              job.client_verification && /verif/i.test(job.client_verification)
                ? 'Verified'
                : job.client_verification ?? null
            const stats: [string, string | number | null][] = [
              ['Total spent', fmtMoney(job.client_total_spent)],
              ['Client hires', job.client_total_hires],
              ['Rating', job.client_rating != null ? `${job.client_rating.toFixed(1)}★` : null],
              ['Payment', payment],
              ['Rate', rate],
              ['Proposals', job.proposals_count],
              ['Invites sent', job.invites_sent],
              ['Interviewing', job.interviewing],
              ['Unanswered', job.unanswered_invites],
              ['Keyword', job.matched_keyword],
            ]
            let loc: unknown = job.preferred_location
            if (typeof loc === 'string') { try { loc = JSON.parse(loc) } catch { loc = [] } }
            const prefLoc = Array.isArray(loc) && loc.length > 0 ? loc.join(', ') : null
            let sk: unknown = job.skills
            if (typeof sk === 'string') { try { sk = JSON.parse(sk) } catch { sk = [] } }
            const skills = Array.isArray(sk)
              ? sk.map((s) => (typeof s === 'string' ? s : (s?.name ?? s?.prettyName ?? ''))).filter(Boolean)
              : []
            return (
              <section>
                <h3 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg-muted mb-3">
                  Client &amp; activity
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                  {stats.map(([label, value]) => (
                    <div key={label}>
                      <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-mono">{label}</div>
                      <div className="text-sm text-fg font-medium tabular-nums">
                        {value != null && value !== '' ? value : '—'}
                      </div>
                    </div>
                  ))}
                  {prefLoc && (
                    <div className="col-span-2 sm:col-span-3">
                      <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-mono">Preferred location</div>
                      <div className="text-sm text-fg font-medium">{prefLoc}</div>
                    </div>
                  )}
                </div>
                {skills.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {skills.slice(0, 14).map((s, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-md bg-bg border border-border text-[11px] text-fg-muted">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            )
          })()}

          {/* Screening questions — con respuestas auto-generadas editables si están */}
          {structuredQuestions && structuredQuestions.length > 0 && (
            <section className="border border-border-strong rounded-lg p-4 bg-surface">
              <h3 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg mb-3 flex items-center gap-2">
                <span>Screening questions</span>
                <span className="text-fg-subtle normal-case tracking-normal font-mono">· {structuredQuestions.length}</span>
                {generatingAnswers && (
                  <span className="ml-auto text-fg-subtle normal-case tracking-normal text-[10px] font-mono animate-pulse">
                    generating answers…
                  </span>
                )}
              </h3>
              <ol className="space-y-4 text-sm text-fg leading-relaxed list-decimal pl-5 marker:text-fg-subtle marker:font-mono">
                {structuredQuestions.map((q) => {
                  const ans = answers.find((a) => a.sequenceNumber === q.sequenceNumber)
                  const idx = answers.findIndex((a) => a.sequenceNumber === q.sequenceNumber)
                  return (
                    <li key={q.sequenceNumber} className="pl-1">
                      <div className="font-medium mb-1.5">{q.question}</div>
                      {ans ? (
                        <>
                          <textarea
                            value={ans.answer}
                            onChange={(e) => saveAnswer(idx, e.target.value)}
                            className="w-full min-h-[80px] text-sm text-fg bg-bg border border-border rounded-md p-2.5 leading-relaxed font-sans resize-y focus:outline-none focus:border-border-focus transition-colors"
                            placeholder="Answer..."
                            spellCheck
                          />
                          <div className="mt-1 flex items-center justify-between text-[10px] text-fg-subtle font-mono">
                            <span>{ans.answer.length} chars</span>
                            <button
                              onClick={() => regenerateAnswer(idx)}
                              disabled={regeneratingIdx !== null}
                              className="text-fg-subtle hover:text-fg disabled:opacity-50 transition-colors"
                            >
                              {regeneratingIdx === idx ? 'regenerating…' : '↻ regenerate'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="text-[11px] text-fg-subtle italic">
                          {generatingAnswers ? 'generating…' : 'no answer yet'}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </section>
          )}

          {/* Fallback: jobs sin questions estructuradas pero con preguntas embebidas en la description */}
          {!structuredQuestions && fallbackQuestionTexts && fallbackQuestionTexts.length > 0 && (
            <section className="border border-border-strong rounded-lg p-4 bg-surface">
              <h3 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-fg mb-3 flex items-center gap-2">
                <span>Screening questions</span>
                <span className="text-fg-subtle normal-case tracking-normal font-mono">· {fallbackQuestionTexts.length}</span>
              </h3>
              <ol className="space-y-2.5 text-sm text-fg leading-relaxed list-decimal pl-5 marker:text-fg-subtle marker:font-mono">
                {fallbackQuestionTexts.map((q, i) => (
                  <li key={i} className="pl-1">{q}</li>
                ))}
              </ol>
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

            <button
              onClick={discardJob}
              disabled={discarding}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-fg-subtle hover:text-destructive border border-border rounded-lg transition disabled:opacity-40"
              title="Discard this job"
            >
              {discarding ? 'Discarding…' : '🗑️ Discard'}
            </button>

            {(job.status === 'proposal_drafted' || job.status === 'ready_to_send' || job.status === 'qualified') && (
              <button
                onClick={sendToReview}
                disabled={reviewing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-fg-subtle hover:text-warning border border-border rounded-lg transition disabled:opacity-40"
                title='No me gusta → mandar a "Para Chequear"'
              >
                {reviewing ? 'Enviando…' : '🔍 A chequear'}
              </button>
            )}

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
