'use client'

import { useState } from 'react'
import type { JobRow } from '@/lib/jobs/list'
import ClassifyButton from './classify-button'
import CoverLetterButton from './cover-letter-button'
import JobDetailModal from './job-detail-modal'

function shortUpworkUrl(link: string | null, upworkId: string | null): string {
  if (!link) return ''
  const last5 = (upworkId ?? '').slice(-5)
  return last5 ? `upwork.com/fre…${last5}/` : 'upwork.com/…'
}

function Ticket({ value, currency }: { value: number | null; currency: string | null }) {
  if (value == null) return null
  const cur = currency ?? 'USD'
  const ok = cur === 'USD' && value >= 40
  return (
    <span
      className={`inline-flex items-center text-xs font-semibold tabular-nums px-2 py-0.5 rounded-md ${
        ok ? 'bg-accent-bg text-accent-fg' : 'bg-bg text-fg-subtle border border-border'
      }`}
    >
      {cur === 'USD' ? '$' : `${cur} `}
      {value}
    </span>
  )
}

function ScoreBadge({ value }: { value: number }) {
  const tone =
    value >= 70
      ? 'bg-accent-bg text-accent-fg'
      : value >= 40
        ? 'bg-warning-bg text-warning'
        : 'bg-bg text-fg-subtle border border-border'
  return (
    <span className={`text-xs font-semibold tabular-nums px-2 py-0.5 rounded-md ${tone}`}>
      {value}
    </span>
  )
}

function AreaBadge({ name }: { name: string }) {
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-info-bg text-info">{name}</span>
  )
}

export default function JobCard({ job }: { job: JobRow }) {
  const [open, setOpen] = useState(false)

  const hasCoverLetter = !!job.cover_letter_draft && job.cover_letter_draft.length > 0
  const isClickable =
    hasCoverLetter ||
    job.status === 'proposal_drafted' ||
    job.status === 'ready_to_send' ||
    job.status === 'sent' ||
    !!job.classifier_reason

  return (
    <>
      <div
        className={`group bg-surface hover:bg-surface-hover border border-border hover:border-border-strong rounded-xl p-4 shadow-soft hover:shadow-soft-hover transition-all duration-150 ${
          isClickable ? 'cursor-pointer' : 'cursor-default'
        }`}
        onClick={(e) => {
          // Don't open modal when clicking interactive children (buttons, links)
          if (!isClickable) return
          const target = e.target as HTMLElement
          if (target.closest('a, button')) return
          setOpen(true)
        }}
      >
        <h3 className="text-[14px] font-semibold text-fg leading-snug line-clamp-3 mb-2">
          {job.title}
        </h3>

        {job.link && (
          <a
            href={job.link}
            target="_blank"
            rel="noreferrer"
            className="block text-[11px] font-mono text-fg-subtle hover:text-fg-muted transition truncate mb-3"
            onClick={(e) => e.stopPropagation()}
          >
            {shortUpworkUrl(job.link, job.upwork_id)}
          </a>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          <Ticket value={job.ticket} currency={job.ticket_currency} />
          {job.classifier_score != null && <ScoreBadge value={job.classifier_score} />}
          {job.classifier_area && <AreaBadge name={job.classifier_area} />}
          {hasCoverLetter && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-violet-bg text-violet">
              ✉ Draft
            </span>
          )}
        </div>

        {job.classifier_reason && (
          <blockquote className="text-[12px] text-fg-muted leading-relaxed mt-3 pl-2.5 border-l-2 border-border-strong italic line-clamp-3">
            {job.classifier_reason}
          </blockquote>
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

        {isClickable && (
          <div className="mt-3 pt-3 border-t border-border text-[11px] text-fg-subtle text-center group-hover:text-fg-muted transition">
            Click para ver detalle
          </div>
        )}
      </div>

      {open && <JobDetailModal job={job} onClose={() => setOpen(false)} />}
    </>
  )
}
