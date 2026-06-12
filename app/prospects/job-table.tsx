'use client'

import { useState } from 'react'
import type { JobRow } from '@/lib/jobs/list'
import JobDetailModal from './job-detail-modal'
import { STATUS_META, countryFlag, postedAgo } from './job-meta'

function ScoreCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-fg-subtle">—</span>
  const pct = Math.max(0, Math.min(100, value))
  const tone =
    value >= 70 ? 'bg-accent' : value >= 40 ? 'bg-warning' : 'bg-fg-subtle'
  const toneFg =
    value >= 70 ? 'text-accent-fg' : value >= 40 ? 'text-warning' : 'text-fg-subtle'
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <div className="relative h-1 w-10 bg-border rounded-full overflow-hidden">
        <div className={`absolute inset-y-0 left-0 ${tone} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`font-mono text-[11px] font-semibold tabular-nums ${toneFg} w-6 text-right`}>
        {value}
      </span>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status]
  if (!meta) return <span className="text-fg-subtle text-xs">{status}</span>
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${meta.pillClass}`}>
      <span>{meta.emoji}</span>
      <span className="uppercase tracking-wide">{meta.label}</span>
    </span>
  )
}

export default function JobTable({ jobs, buNames }: { jobs: JobRow[]; buNames: Record<string, string> }) {
  const [activeJob, setActiveJob] = useState<JobRow | null>(null)

  return (
    <>
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/60">
                <th className="text-left font-medium text-fg-muted text-[10px] uppercase tracking-[0.08em] px-4 py-2.5">Title</th>
                <th className="text-left font-medium text-fg-muted text-[10px] uppercase tracking-[0.08em] px-3 py-2.5 hidden md:table-cell">BU / Area</th>
                <th className="text-left font-medium text-fg-muted text-[10px] uppercase tracking-[0.08em] px-3 py-2.5 hidden lg:table-cell">Country</th>
                <th className="text-right font-medium text-fg-muted text-[10px] uppercase tracking-[0.08em] px-3 py-2.5">Ticket</th>
                <th className="text-right font-medium text-fg-muted text-[10px] uppercase tracking-[0.08em] px-3 py-2.5 hidden md:table-cell">Props</th>
                <th className="text-right font-medium text-fg-muted text-[10px] uppercase tracking-[0.08em] px-3 py-2.5">Score</th>
                <th className="text-left font-medium text-fg-muted text-[10px] uppercase tracking-[0.08em] px-3 py-2.5 hidden lg:table-cell">Age</th>
                <th className="text-left font-medium text-fg-muted text-[10px] uppercase tracking-[0.08em] px-3 py-2.5">Status</th>
                <th className="text-left font-medium text-fg-muted text-[10px] uppercase tracking-[0.08em] px-3 py-2.5 hidden xl:table-cell">Notes</th>
                <th className="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-fg-subtle font-mono text-[12px]">
                    no jobs match these filters
                  </td>
                </tr>
              ) : (
                jobs.map(job => {
                  const flag = countryFlag(job.country)
                  const posted = postedAgo(job.post_date)
                  const bu = job.business_unit_id ? buNames[job.business_unit_id] : null
                  const area = bu ?? job.classifier_area
                  const hasCover = !!job.cover_letter_draft && job.cover_letter_draft.length > 0
                  const cur = job.ticket_currency ?? 'USD'
                  const ticketOk = cur === 'USD' && (job.ticket ?? 0) >= 40
                  const isClickable =
                    hasCover ||
                    job.status === 'proposal_drafted' ||
                    job.status === 'ready_to_send' ||
                    job.status === 'sent' ||
                    job.status === 'responded' ||
                    !!job.classifier_reason

                  return (
                    <tr
                      key={job.id}
                      onClick={(e) => {
                        if (!isClickable) return
                        const target = e.target as HTMLElement
                        if (target.closest('a, button')) return
                        setActiveJob(job)
                      }}
                      className={`border-b border-border last:border-0 group transition-colors ${
                        isClickable ? 'cursor-pointer hover:bg-bg/80' : 'hover:bg-bg/40'
                      }`}
                    >
                      <td className="px-4 py-2.5 max-w-[420px]">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-fg text-[13px] truncate">{job.title}</span>
                          {hasCover && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-fg text-bg flex-shrink-0" title="Cover letter ready">
                              Draft
                            </span>
                          )}
                        </div>
                        {job.link && (
                          <a
                            href={job.link}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-[10px] text-fg-subtle hover:text-fg transition-colors"
                          >
                            upwork/{(job.upwork_id ?? '').slice(-5) || '—'}
                          </a>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        {area ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-bg border border-border text-[10px] font-medium text-fg-muted uppercase tracking-wide">
                            {area}
                          </span>
                        ) : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        {flag ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-sm">{flag}</span>
                            <span className="text-[11px] text-fg-muted">{job.country}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-fg-subtle">{job.country ?? '—'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {job.ticket != null ? (
                          <span className={`font-mono text-[11px] font-semibold tabular-nums ${ticketOk ? 'text-fg' : 'text-fg-subtle'}`}>
                            {cur === 'USD' ? '$' : `${cur} `}{job.ticket}{cur === 'USD' && '/h'}
                          </span>
                        ) : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right hidden md:table-cell">
                        {job.proposals_count != null ? (
                          <span className={`font-mono text-[11px] font-semibold tabular-nums ${
                            job.proposals_count <= 5 ? 'text-accent-fg' : job.proposals_count <= 15 ? 'text-warning' : 'text-fg-subtle'
                          }`}>
                            {job.proposals_count}
                          </span>
                        ) : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <ScoreCell value={job.classifier_score} />
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        <span className="font-mono text-[11px] text-fg-muted">
                          {posted ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill status={job.status} />
                      </td>
                      <td className="px-3 py-2.5 hidden xl:table-cell max-w-[200px]">
                        {job.notes ? (
                          <span className="text-[11px] text-fg-muted truncate block" title={job.notes}>
                            📓 {job.notes.slice(0, 50)}{job.notes.length > 50 && '…'}
                          </span>
                        ) : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {isClickable && (
                          <span className="text-fg-subtle opacity-0 group-hover:opacity-100 transition-opacity text-sm" aria-hidden>→</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {activeJob && <JobDetailModal job={activeJob} onClose={() => setActiveJob(null)} />}
    </>
  )
}
