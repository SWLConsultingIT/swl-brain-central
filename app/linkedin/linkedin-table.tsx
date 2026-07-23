'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LinkedInJobRow } from '@/lib/linkedin/list'
import { linkedinPct, discardReason, isHotLead } from '@/lib/linkedin/score'
import { STATUS_META, countryFlag, postedAgo } from '@/app/prospects/job-meta'
import LinkedInDetailModal from './job-detail-modal'

// ── celdas compartidas (mismo look que la tabla de Upwork) ───────────────────

function ScoreCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-fg-subtle">—</span>
  const cls =
    value >= 70 ? 'bg-accent-bg text-accent-fg' :
    value >= 40 ? 'bg-warning-bg text-warning' :
                  'bg-slate-bg text-fg-subtle'
  return (
    <span className={`inline-flex items-center justify-center min-w-[46px] px-2 py-1 rounded-md font-mono text-[13px] font-bold tabular-nums ${cls}`}>
      {value}%
    </span>
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

function tagColor(label: string): { bg: string; text: string } {
  const s = label.toLowerCase()
  if (/(automation|\bai\b|\bbot|workflow|\brpa\b)/.test(s)) return { bg: '#FCEFC7', text: '#8A6D1F' }
  if (/(market|brand|growth|\bads?\b|seo|social|content)/.test(s)) return { bg: '#D9E8F5', text: '#27557F' }
  if (/(sales|customer|success|outreach|\blead)/.test(s)) return { bg: '#DCEDDC', text: '#2C6A48' }
  if (/(financ|advisory|capital|account|\bcfo\b|valuation|tax)/.test(s)) return { bg: '#E9DEF4', text: '#603DA0' }
  if (/(data|\bbi\b|analytics|dashboard|report)/.test(s)) return { bg: '#D3EDE9', text: '#1E6A62' }
  if (/(design|product|digital|experience|\bweb\b|\bdev)/.test(s)) return { bg: '#F6DCE7', text: '#9E376C' }
  return { bg: '#EBEBE7', text: '#5E5E57' }
}

function AreaPill({ label }: { label: string | null }) {
  if (!label) return <span className="text-fg-subtle">—</span>
  const c = tagColor(label)
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap" style={{ backgroundColor: c.bg, color: c.text }}>
      {label}
    </span>
  )
}

function NumCell({ value, tone }: { value: number | null; tone?: string }) {
  if (value == null) return <span className="text-fg-subtle">—</span>
  return <span className={`font-mono text-[11px] font-semibold tabular-nums ${tone ?? 'text-fg-muted'}`}>{value}</span>
}

// Applicants = competencia. Pocos = mejor (como "proposals" en Upwork).
function applicantsTone(n: number): string {
  return n <= 10 ? 'text-accent-fg' : n <= 50 ? 'text-warning' : 'text-fg-subtle'
}

function TitleCell({ job }: { job: LinkedInJobRow }) {
  const hot = isHotLead(job)
  return (
    <div className="flex items-center gap-2 max-w-[440px]">
      <svg viewBox="0 0 16 16" className="size-[15px] shrink-0 text-fg-subtle" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
        <path d="M4 1.75h4.5L12.25 5.5v8.75H4z" />
        <path d="M8.5 1.75V5.5h3.75" />
      </svg>
      <span className="font-normal text-fg text-[14px] truncate">{job.title}</span>
      {hot && (
        <span className="text-[13px] leading-none shrink-0" title="Fresco + score alto + poca competencia — aplicá ya">🔥</span>
      )}
    </div>
  )
}

function CompanyCell({ job }: { job: LinkedInJobRow }) {
  if (!job.company_name) return <span className="text-fg-subtle text-[11px]">—</span>
  if (job.company_url) {
    return (
      <a href={job.company_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[12px] text-fg-muted hover:text-fg hover:underline truncate block max-w-[160px]" title={job.company_name}>
        {job.company_name}
      </a>
    )
  }
  return <span className="text-[12px] text-fg-muted truncate block max-w-[160px]" title={job.company_name}>{job.company_name}</span>
}

function TypeCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-fg-subtle">—</span>
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-bg text-fg-muted text-[11px] font-medium whitespace-nowrap">{value}</span>
}

function LocationCell({ job }: { job: LinkedInJobRow }) {
  const flag = countryFlag(job.country)
  const text = job.location ?? job.country ?? '—'
  return (
    <span className="inline-flex items-center gap-1.5">
      {flag && <span className="text-sm">{flag}</span>}
      <span className="text-[11px] text-fg-muted truncate max-w-[160px]" title={text}>{text}</span>
    </span>
  )
}

function CoverCell({ job }: { job: LinkedInJobRow }) {
  if (!job.cover_letter_draft) return <span className="text-fg-subtle text-[11px]">—</span>
  return (
    <span className="inline-flex items-center justify-center size-6 rounded-md bg-surface border border-border text-fg" title="Nota lista">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3.25 1.75h6L12.75 5v9.25h-9.5z" /><path d="M9 1.75V5h3.75" /><path d="M5.25 8h5.5M5.25 10.5h5.5M5.25 5.5h2" />
      </svg>
    </span>
  )
}

// ── definición de columnas ───────────────────────────────────────────────────

type Ctx = { buNames: Record<string, string> }

type Col = {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  className?: string
  render: (job: LinkedInJobRow, ctx: Ctx) => React.ReactNode
}

function flowOf(job: LinkedInJobRow, ctx: Ctx): string | null {
  return (job.business_unit_id ? ctx.buNames[job.business_unit_id] : null) ?? job.classifier_area
}

const COL = {
  title:      { key: 'title',      label: 'Job Title',   render: (j: LinkedInJobRow) => <TitleCell job={j} /> },
  company:    { key: 'company',    label: 'Company',     render: (j: LinkedInJobRow) => <CompanyCell job={j} /> },
  flow:       { key: 'flow',       label: 'Flow',        className: 'hidden md:table-cell', render: (j: LinkedInJobRow, c: Ctx) => <AreaPill label={flowOf(j, c)} /> },
  status:     { key: 'status',     label: 'Status',      render: (j: LinkedInJobRow) => <StatusPill status={j.status} /> },
  type:       { key: 'type',       label: 'Tipo',        render: (j: LinkedInJobRow) => <TypeCell value={j.employment_type} /> },
  seniority:  { key: 'seniority',  label: 'Seniority',   className: 'hidden lg:table-cell', render: (j: LinkedInJobRow) => j.seniority ? <span className="text-[11px] text-fg-muted whitespace-nowrap">{j.seniority}</span> : <span className="text-fg-subtle">—</span> },
  applicants: { key: 'applicants', label: 'Applicants',  align: 'right' as const, render: (j: LinkedInJobRow) => <NumCell value={j.applicants_count} tone={j.applicants_count != null ? applicantsTone(j.applicants_count) : undefined} /> },
  location:   { key: 'location',   label: 'Location',    className: 'hidden lg:table-cell', render: (j: LinkedInJobRow) => <LocationCell job={j} /> },
  industry:   { key: 'industry',   label: 'Industry',    className: 'hidden xl:table-cell', render: (j: LinkedInJobRow) => j.industry ? <span className="text-[11px] text-fg-muted truncate block max-w-[180px]" title={j.industry}>{j.industry}</span> : <span className="text-fg-subtle text-[11px]">—</span> },
  jobFunction:{ key: 'jobFunction',label: 'Función',     className: 'hidden xl:table-cell', render: (j: LinkedInJobRow) => j.job_function ? <span className="text-[11px] text-fg-muted truncate block max-w-[160px]" title={j.job_function}>{j.job_function}</span> : <span className="text-fg-subtle text-[11px]">—</span> },
  score:      { key: 'score',      label: 'Score',       align: 'right' as const, render: (j: LinkedInJobRow) => <ScoreCell value={linkedinPct(j)} /> },
  posted:     { key: 'posted',     label: 'Posted',      render: (j: LinkedInJobRow) => <span className="font-mono text-[11px] text-fg-muted">{postedAgo(j.post_date) ?? '—'}</span> },
  keyword:    { key: 'keyword',    label: 'Keyword',     className: 'hidden xl:table-cell', render: (j: LinkedInJobRow) => j.matched_keyword ? <span className="text-[11px] text-fg-muted font-mono truncate block max-w-[160px]" title={j.matched_keyword}>{j.matched_keyword}</span> : <span className="text-fg-subtle text-[11px]">—</span> },
  cover:      { key: 'cover',      label: 'Nota',        align: 'center' as const, render: (j: LinkedInJobRow) => <CoverCell job={j} /> },
  link:       { key: 'link',       label: 'Link',        className: 'hidden sm:table-cell', render: (j: LinkedInJobRow) => j.link
    ? <a href={j.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="font-mono text-[10px] text-fg-subtle hover:text-fg transition-colors whitespace-nowrap">open&nbsp;↗</a>
    : <span className="text-fg-subtle text-[11px]">—</span> },
  sentDate:   { key: 'sentDate',   label: 'Enviado',     className: 'hidden md:table-cell', render: (j: LinkedInJobRow) => <span className="font-mono text-[10px] text-fg-muted">{j.updated_at ? new Date(j.updated_at).toLocaleDateString('es-AR', { dateStyle: 'short' }) : '—'}</span> },
  declineReason: { key: 'declineReason', label: 'Motivo', render: (j: LinkedInJobRow) => {
    const full = discardReason(j)
    const words = full.split(/\s+/)
    const short = words.slice(0, 7).join(' ') + (words.length > 7 ? '…' : '')
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-bg text-fg-muted text-[11px] max-w-[280px] truncate" title={full}>{short}</span>
  } },
} satisfies Record<string, Col>

// Sets de columnas por vista (espejo del layout de Upwork, con datos de LinkedIn).
export const LINKEDIN_VIEW_COLUMNS: Record<string, Col[]> = {
  check_proposal: [COL.title, COL.company, COL.flow, COL.status, COL.type, COL.seniority, COL.applicants, COL.location, COL.industry, COL.jobFunction, COL.score, COL.posted, COL.keyword, COL.cover, COL.link],
  qualified:      [COL.title, COL.company, COL.flow, COL.status, COL.type, COL.seniority, COL.applicants, COL.location, COL.industry, COL.score, COL.posted, COL.keyword, COL.link],
  pipeline:       [COL.title, COL.company, COL.flow, COL.status, COL.type, COL.seniority, COL.applicants, COL.location, COL.industry, COL.score, COL.posted, COL.keyword, COL.link],
  sent:           [COL.title, COL.company, COL.flow, COL.type, COL.score, COL.location, COL.link, COL.sentDate],
  review:         [COL.title, COL.company, COL.flow, COL.declineReason, COL.applicants, COL.score, COL.type, COL.location, COL.posted, COL.link],
  discarded:      [COL.title, COL.company, COL.keyword, COL.declineReason, COL.status, COL.score, COL.type, COL.location, COL.link],
}

// ── tabla ─────────────────────────────────────────────────────────────────────

export default function LinkedInTable({
  jobs,
  columns,
  buNames,
  sortBy = 'score',
}: {
  jobs: LinkedInJobRow[]
  columns: Col[]
  buNames: Record<string, string>
  sortBy?: 'score' | 'recent'
}) {
  const [activeJob, setActiveJob] = useState<LinkedInJobRow | null>(null)
  const [discarding, setDiscarding] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const router = useRouter()
  const ctx: Ctx = { buNames }

  async function discardJob(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('¿Descartar este job? (lo saca de la lista)')) return
    setDiscarding(id)
    try {
      const r = await fetch(`/api/linkedin/${id}/discard`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'ui_discard' }) })
      if (!r.ok) { alert('No se pudo descartar: ' + (await r.text())); return }
      router.refresh()
    } finally { setDiscarding(null) }
  }

  async function sendToReview(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const comment = prompt('Mandar a "Para Chequear". Comentario (opcional):')
    if (comment === null) return
    setReviewing(id)
    try {
      const r = await fetch(`/api/linkedin/${id}/to-review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comment }) })
      if (!r.ok) { alert('No se pudo mandar a chequear: ' + (await r.text())); return }
      router.refresh()
    } finally { setReviewing(null) }
  }

  const canReview = (s: string) => s === 'proposal_drafted' || s === 'ready_to_send' || s === 'qualified'

  const byDate = (a: LinkedInJobRow, b: LinkedInJobRow) => (b.post_date ?? '').localeCompare(a.post_date ?? '')
  const ageDays = (j: LinkedInJobRow) => j.post_date ? Math.floor((Date.now() - new Date(j.post_date).getTime()) / 86400000) : 9999
  const pct = (j: LinkedInJobRow) => linkedinPct(j) ?? -1
  const sorted = [...jobs].sort((a, b) =>
    sortBy === 'recent' ? byDate(a, b) : (ageDays(a) - ageDays(b)) || (pct(b) - pct(a)) || byDate(a, b),
  )

  return (
    <>
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-230px)]">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="border-b border-border">
                {columns.map((c, i) => (
                  <th
                    key={c.key}
                    className={`font-medium text-fg-muted text-[12px] px-3 py-2.5 bg-bg sticky top-0 z-20 border-b border-r border-border whitespace-nowrap ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'} ${
                      i === 0 ? 'sticky left-0 z-30 pl-4 min-w-[200px] md:min-w-[300px] border-r' : ''
                    } ${c.className ?? ''}`}
                  >
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-3 w-8 bg-bg sticky top-0 z-20" />
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-fg-subtle font-mono text-[12px]">
                    no jobs match these filters
                  </td>
                </tr>
              ) : (
                sorted.map((job) => {
                  const manualDiscard = false
                  const rowClass = 'hover:bg-bg [&:hover_td.sticky]:bg-bg'
                  const stickyBg = 'bg-surface'
                  return (
                    <tr
                      key={job.id}
                      onClick={(e) => {
                        const target = e.target as HTMLElement
                        if (target.closest('a, button, label, input')) return
                        setActiveJob(job)
                      }}
                      className={`border-b border-border last:border-0 group transition-colors cursor-pointer ${rowClass}`}
                    >
                      {columns.map((c, i) => (
                        <td
                          key={c.key}
                          className={`px-3 py-2 align-middle border-b border-r border-border ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''} ${
                            i === 0 ? `sticky left-0 z-10 pl-4 min-w-[200px] md:min-w-[300px] ${stickyBg}` : 'whitespace-nowrap'
                          } ${c.className ?? ''}`}
                        >
                          {c.render(job, ctx)}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2.5">
                          {canReview(job.status) && (
                            <button
                              onClick={(e) => sendToReview(job.id, e)}
                              disabled={reviewing === job.id}
                              title='Mandar a "Para Chequear"'
                              aria-label="Mandar a Para Chequear"
                              className="inline-flex items-center justify-center text-fg-subtle/60 hover:text-warning hover:scale-110 transition disabled:opacity-30 cursor-pointer"
                            >
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M3 2.25v11.5" /><path d="M3 2.75h8.5l-1.5 2.25 1.5 2.25H3" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={(e) => discardJob(job.id, e)}
                            disabled={discarding === job.id}
                            title="Descartar (lo saca de la lista)"
                            aria-label="Descartar job"
                            className="inline-flex items-center justify-center text-fg-subtle/60 hover:text-destructive hover:scale-110 transition disabled:opacity-30 cursor-pointer"
                          >
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M2.5 4h11" /><path d="M5.5 4V2.75h5V4" /><path d="M3.75 4l.6 9.25a1 1 0 0 0 1 .95h5.3a1 1 0 0 0 1-.95L12.25 4" /><path d="M6.5 6.75v5M9.5 6.75v5" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {activeJob && <LinkedInDetailModal job={activeJob} buNames={buNames} onClose={() => setActiveJob(null)} />}
    </>
  )
}
