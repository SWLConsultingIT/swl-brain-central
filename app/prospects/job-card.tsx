'use client'

import { useState } from 'react'
import type { JobRow } from '@/lib/jobs/list'
import ClassifyButton from './classify-button'
import CoverLetterButton from './cover-letter-button'
import JobDetailModal from './job-detail-modal'
import { countryFlag, postedAgo, isFresh, isStale } from './job-meta'
import { isHotLead } from '@/lib/jobs/score'

function shortUpworkId(upworkId: string | null): string {
  const last5 = (upworkId ?? '').slice(-5)
  return last5 || '—'
}

function ScoreBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  const tone =
    value >= 70 ? 'bg-fg' : value >= 40 ? 'bg-fg-muted' : 'bg-border-strong'
  const toneFg =
    value >= 70 ? 'text-fg' : value >= 40 ? 'text-fg-muted' : 'text-fg-subtle'
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="relative h-1 w-12 bg-border rounded-full overflow-hidden flex-shrink-0">
        <div
          className={`absolute inset-y-0 left-0 ${tone} rounded-full transition-[width] duration-500 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`font-mono text-[11px] font-semibold tabular-nums ${toneFg}`}>
        {value}
      </span>
    </div>
  )
}

function Ticket({ value, currency }: { value: number | null; currency: string | null }) {
  if (value == null) return null
  const cur = currency ?? 'USD'
  const ok = cur === 'USD' && value >= 40
  return (
    <span
      className={`font-mono text-[11px] font-semibold tabular-nums ${
        ok ? 'text-fg' : 'text-fg-subtle'
      }`}
    >
      {cur === 'USD' ? '$' : `${cur} `}
      {value}
      {cur === 'USD' && '/h'}
    </span>
  )
}

function ProposalsBadge({ count }: { count: number }) {
  // visual signal of competition — more = colder
  const tone =
    count <= 5 ? 'text-accent-fg' : count <= 15 ? 'text-warning' : 'text-fg-subtle'
  return (
    <span className={`font-mono text-[11px] font-semibold tabular-nums ${tone}`} title="Proposals so far">
      {count}<span className="text-fg-subtle/60 ml-0.5">prop</span>
    </span>
  )
}

function Divider() {
  return <span className="text-fg-subtle/40 text-[11px]" aria-hidden>·</span>
}

export default function JobCard({ job }: { job: JobRow }) {
  const [open, setOpen] = useState(false)

  const hasCoverLetter = !!job.cover_letter_draft && job.cover_letter_draft.length > 0
  // Cualquier job se puede abrir para ver su detalle (incluidos los discarded).
  const isClickable = true

  const flag = countryFlag(job.country)
  const posted = postedAgo(job.post_date)
  const fresh = isFresh(job.post_date, 2)
  const hot = isHotLead(job)
  const stale =
    job.status === 'qualified' && !hasCoverLetter && isStale(job.classifier_run_at, 6)

  const hasMeta =
    job.ticket != null ||
    job.proposals_count != null ||
    !!job.duration

  return (
    <>
      <div
        className={`group relative bg-surface border rounded-xl p-4 shadow-card hover:shadow-card-hover transition-[box-shadow,border-color,transform] duration-200 ease-out ${
          stale
            ? 'border-orange/30 hover:border-orange/60'
            : 'border-border hover:border-border-strong'
        } ${isClickable ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default'}`}
        onClick={(e) => {
          if (!isClickable) return
          const target = e.target as HTMLElement
          if (target.closest('a, button')) return
          setOpen(true)
        }}
      >
        {fresh && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center"
            aria-label="Posted in last 2 hours"
          >
            <span className="absolute size-2.5 rounded-full bg-accent opacity-60 animate-ping" />
            <span className="relative size-2 rounded-full bg-accent ring-2 ring-surface" />
          </span>
        )}

        {isClickable && !fresh && (
          <span
            aria-hidden
            className="absolute top-3 right-3 text-fg-subtle opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 text-sm"
          >
            →
          </span>
        )}

        <div className="flex items-start gap-2 pr-5">
          {flag && <span className="text-base leading-none mt-0.5" aria-label={job.country ?? ''}>{flag}</span>}
          <h3 className="flex-1 text-[14px] font-semibold text-fg leading-snug tracking-tight line-clamp-3">
            {job.title}
          </h3>
        </div>

        {hot && (
          <div className="mt-2">
            <span
              className="text-[15px] leading-none"
              title="Fresco + score alto + poca competencia — los primeros en postularse ganan"
            >
              🔥
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-mono text-fg-subtle">
          {job.link ? (
            <a
              href={job.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-fg transition-colors"
              onClick={(e) => e.stopPropagation()}
              title={job.link}
            >
              <span>upwork</span>
              <span className="text-fg-subtle/50">/</span>
              <span>{shortUpworkId(job.upwork_id)}</span>
            </a>
          ) : (
            <span>—</span>
          )}
          {posted && (
            <>
              <Divider />
              <span className={fresh ? 'text-accent-fg font-semibold' : ''}>
                {posted} ago
              </span>
            </>
          )}
          {stale && (
            <>
              <Divider />
              <span className="text-orange font-semibold">⏱ stale</span>
            </>
          )}
        </div>

        {hasMeta && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Ticket value={job.ticket} currency={job.ticket_currency} />
            {job.ticket != null && job.proposals_count != null && <Divider />}
            {job.proposals_count != null && <ProposalsBadge count={job.proposals_count} />}
            {(job.ticket != null || job.proposals_count != null) && job.duration && <Divider />}
            {job.duration && (
              <span className="font-mono text-[11px] font-medium text-fg-muted">{job.duration}</span>
            )}
          </div>
        )}

        {job.classifier_score != null && (
          <div className="mt-3">
            <ScoreBar value={job.classifier_score} />
          </div>
        )}

        {job.classifier_area && (
          <div className="mt-2.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-bg border border-border text-[10px] font-medium text-fg-muted uppercase tracking-wide">
              {job.classifier_area}
            </span>
          </div>
        )}

        {(hasCoverLetter || job.notes) && (
          <div className="mt-2.5 flex items-center gap-1.5">
            {hasCoverLetter && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-fg text-bg text-[10px] font-semibold uppercase tracking-wide" title="Cover letter ready">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.5" />
                  <path d="M2.25 4l5.75 4.25L13.75 4" />
                </svg>
                Cover
              </span>
            )}
            {job.notes && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-warning-bg text-warning text-[10px] font-semibold"
                title={job.notes.length > 80 ? job.notes.slice(0, 80) + '…' : job.notes}
              >
                📓 Notes
              </span>
            )}
          </div>
        )}

        {job.classifier_reason && (
          <p className="text-[12px] text-fg-muted leading-relaxed mt-3 line-clamp-3">
            {job.classifier_reason}
          </p>
        )}

        {(job.status === 'new' || job.status === 'prequalified') && (
          <div className="mt-3 pt-3 border-t border-border">
            <ClassifyButton jobId={job.id} status={job.status} />
          </div>
        )}

        {job.status === 'qualified' && (
          <div className="mt-3 pt-3 border-t border-border">
            <CoverLetterButton jobId={job.id} status={job.status} />
          </div>
        )}
      </div>

      {open && <JobDetailModal job={job} onClose={() => setOpen(false)} />}
    </>
  )
}
