'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { JobRow } from '@/lib/jobs/list'
import { matchPct, matchDetail } from '@/lib/jobs/score'
import JobDetailModal from './job-detail-modal'
import { STATUS_META, countryFlag, postedAgo } from './job-meta'

// ── shared cells ───────────────────────────────────────────────────────────

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

// tags de colores estilo Notion, asignados por categoría
function tagColor(label: string): { bg: string; text: string } {
  const s = label.toLowerCase()
  if (/(automation|\bai\b|\bbot|workflow|\brpa\b)/.test(s)) return { bg: '#FCEFC7', text: '#8A6D1F' } // ámbar
  if (/(market|brand|growth|\bads?\b|seo|social|content)/.test(s)) return { bg: '#D9E8F5', text: '#27557F' } // azul
  if (/(sales|customer|success|outreach|\blead)/.test(s)) return { bg: '#DCEDDC', text: '#2C6A48' } // verde
  if (/(financ|advisory|capital|account|\bcfo\b|valuation|tax)/.test(s)) return { bg: '#E9DEF4', text: '#603DA0' } // violeta
  if (/(data|\bbi\b|analytics|dashboard|report)/.test(s)) return { bg: '#D3EDE9', text: '#1E6A62' } // teal
  if (/(design|product|digital|experience|\bweb\b|\bdev)/.test(s)) return { bg: '#F6DCE7', text: '#9E376C' } // rosa
  return { bg: '#EBEBE7', text: '#5E5E57' } // gris
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

// ── column definitions ─────────────────────────────────────────────────────

type Ctx = { buNames: Record<string, string> }

type Col = {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  className?: string // applied to <td> and <th> (e.g. responsive hide)
  render: (job: JobRow, ctx: Ctx) => React.ReactNode
}

function flowOf(job: JobRow, ctx: Ctx): string | null {
  return (job.business_unit_id ? ctx.buNames[job.business_unit_id] : null) ?? job.classifier_area
}

function ticketLabel(job: JobRow): React.ReactNode {
  if (job.hourly_min != null || job.hourly_max != null) {
    const lo = job.hourly_min != null ? `$${job.hourly_min}` : '—'
    const hi = job.hourly_max != null ? `$${job.hourly_max}` : '—'
    const ok = (job.hourly_max ?? job.hourly_min ?? 0) >= 40
    return (
      <span className={`font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap ${ok ? 'text-fg' : 'text-fg-subtle'}`}>
        {lo} - {hi}
      </span>
    )
  }
  if (job.ticket != null) {
    const cur = job.ticket_currency ?? 'USD'
    const ok = cur === 'USD' && job.ticket >= 40
    return (
      <span className={`font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap ${ok ? 'text-fg' : 'text-fg-subtle'}`}>
        {cur === 'USD' ? '$' : `${cur} `}{job.ticket}{cur === 'USD' && '/h'}
      </span>
    )
  }
  return <span className="text-fg-subtle">—</span>
}

function proposalsTone(n: number): string {
  return n <= 5 ? 'text-accent-fg' : n <= 15 ? 'text-warning' : 'text-fg-subtle'
}

function TitleCell({ job }: { job: JobRow }) {
  return (
    <div className="flex items-center gap-2 max-w-[440px]">
      <svg viewBox="0 0 16 16" className="size-[15px] shrink-0 text-fg-subtle" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
        <path d="M4 1.75h4.5L12.25 5.5v8.75H4z" />
        <path d="M8.5 1.75V5.5h3.75" />
      </svg>
      <span className="font-normal text-fg text-[14px] truncate">{job.title}</span>
    </div>
  )
}

function CountryCell({ job }: { job: JobRow }) {
  const flag = countryFlag(job.country)
  if (flag) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-sm">{flag}</span>
        <span className="text-[11px] text-fg-muted">{job.country}</span>
      </span>
    )
  }
  return <span className="text-[11px] text-fg-subtle">{job.country ?? '—'}</span>
}

function CoverCell({ job }: { job: JobRow }) {
  const hasCover = !!job.cover_letter_draft && job.cover_letter_draft.length > 0
  if (!hasCover) return <span className="text-fg-subtle text-[11px]">—</span>
  return (
    <span className="inline-flex items-center justify-center size-6 rounded-md bg-surface border border-border text-fg" title="Cover letter ready">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3.25 1.75h6L12.75 5v9.25h-9.5z" />
        <path d="M9 1.75V5h3.75" />
        <path d="M5.25 8h5.5M5.25 10.5h5.5M5.25 5.5h2" />
      </svg>
    </span>
  )
}

function dateLabel(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

function moneyShort(n: number | null): string {
  if (n == null) return '—'
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return `$${Math.round(n)}`
}

function PriorityCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-fg-subtle">—</span>
  const [label, cls] =
    value >= 70 ? ['Alta', 'bg-accent-bg text-accent-fg'] :
    value >= 40 ? ['Media', 'bg-warning-bg text-warning'] :
                  ['Baja', 'bg-slate-bg text-fg-subtle']
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>{label}</span>
}

// Match score determinístico → ahora vive en lib/jobs/score.ts (compartido con el kanban)

// reusable column builders
const COL = {
  title: { key: 'title', label: 'Job Title', render: (j: JobRow) => <TitleCell job={j} /> },
  flow: { key: 'flow', label: 'Flow', className: 'hidden md:table-cell', render: (j: JobRow, c: Ctx) => <AreaPill label={flowOf(j, c)} /> },
  status: { key: 'status', label: 'Status', render: (j: JobRow) => <StatusPill status={j.status} /> },
  ticket: { key: 'ticket', label: 'Ticket', align: 'right' as const, render: (j: JobRow) => ticketLabel(j) },
  proposals: { key: 'proposals', label: 'Proposals', align: 'right' as const, className: 'hidden sm:table-cell', render: (j: JobRow) => <NumCell value={j.proposals_count} tone={j.proposals_count != null ? proposalsTone(j.proposals_count) : undefined} /> },
  invites: { key: 'invites', label: 'Invites Sent', align: 'right' as const, className: 'hidden lg:table-cell', render: (j: JobRow) => <NumCell value={j.invites_sent} /> },
  prefLoc: { key: 'prefLoc', label: 'Preferred Location', className: 'hidden xl:table-cell', render: (j: JobRow) => {
    let loc: unknown = j.preferred_location
    if (typeof loc === 'string') { try { loc = JSON.parse(loc) } catch { loc = [] } }
    if (!Array.isArray(loc) || loc.length === 0) return <span className="text-fg-subtle text-[11px]">—</span>
    const text = loc.join(', ')
    return <span className="text-[11px] text-fg-muted truncate block max-w-[180px]" title={text}>{text}</span>
  } },
  country: { key: 'country', label: 'Country', className: 'hidden lg:table-cell', render: (j: JobRow) => <CountryCell job={j} /> },
  keyword: { key: 'keyword', label: 'Keyword', className: 'hidden xl:table-cell', render: (j: JobRow) => j.matched_keyword
    ? <span className="text-[11px] text-fg-muted font-mono truncate block max-w-[160px]" title={j.matched_keyword}>{j.matched_keyword}</span>
    : <span className="text-fg-subtle text-[11px]">—</span> },
  score: { key: 'score', label: 'Score', align: 'right' as const, render: (j: JobRow) => <span title={matchDetail(j)}><ScoreCell value={matchPct(j)} /></span> },
  match: { key: 'match', label: 'Match', className: 'hidden md:table-cell', render: (j: JobRow) => j.classifier_match == null
    ? <span className="text-fg-subtle">—</span>
    : <span className={`text-[11px] font-semibold ${j.classifier_match ? 'text-accent-fg' : 'text-fg-subtle'}`}>{j.classifier_match ? '✓' : '✗'}</span> },
  link: { key: 'link', label: 'Link', className: 'hidden sm:table-cell', render: (j: JobRow) => j.link
    ? <a href={j.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="font-mono text-[10px] text-fg-subtle hover:text-fg transition-colors whitespace-nowrap">open&nbsp;↗</a>
    : <span className="text-fg-subtle text-[11px]">—</span> },
  cover: { key: 'cover', label: 'Cover Letter', align: 'center' as const, render: (j: JobRow) => <CoverCell job={j} /> },
  posted: { key: 'posted', label: 'Posted', className: 'hidden lg:table-cell', render: (j: JobRow) => <span className="font-mono text-[11px] text-fg-muted">{postedAgo(j.post_date) ?? '—'}</span> },
  ready: { key: 'ready', label: 'Ready Date', className: 'hidden md:table-cell', render: (j: JobRow) => <span className="font-mono text-[10px] text-fg-muted">{dateLabel(j.cover_letter_generated_at)}</span> },
  sent: { key: 'sent', label: 'Sent', className: 'hidden md:table-cell', render: (j: JobRow) => <span className="font-mono text-[10px] text-fg-muted">{dateLabel(j.updated_at)}</span> },
  added: { key: 'added', label: 'Added', className: 'hidden xl:table-cell', render: (j: JobRow) => <span className="font-mono text-[11px] text-fg-muted">{postedAgo(j.created_at) ?? '—'}</span> },
  priority: { key: 'priority', label: 'Priority', render: (j: JobRow) => <PriorityCell value={matchPct(j)} /> },
  currentState: { key: 'currentState', label: 'Current State', className: 'hidden xl:table-cell', render: (j: JobRow) => <StatusPill status={j.status} /> },
  scrapMethod: { key: 'scrapMethod', label: 'Scrap Method', className: 'hidden xl:table-cell', render: (j: JobRow, c: Ctx) => <AreaPill label={flowOf(j, c)} /> },
  interviewing: { key: 'interviewing', label: 'Interviewing', align: 'right' as const, className: 'hidden lg:table-cell', render: (j: JobRow) => <NumCell value={j.interviewing} /> },
  unanswered: { key: 'unanswered', label: 'Unanswered', align: 'right' as const, className: 'hidden xl:table-cell', render: (j: JobRow) => <NumCell value={j.unanswered_invites} /> },
  universe: { key: 'universe', label: 'Universe', className: 'hidden xl:table-cell', render: (j: JobRow) => <AreaPill label={j.classifier_area} /> },
  declineReason: { key: 'declineReason', label: 'Decline Reason', className: 'hidden xl:table-cell', render: (j: JobRow) => j.classifier_reason
    ? <span className="text-[11px] text-fg-muted truncate block max-w-[200px]" title={j.classifier_reason}>{j.classifier_reason}</span>
    : <span className="text-fg-subtle text-[11px]">—</span> },
  viewedByClient: { key: 'viewedByClient', label: 'Viewed', align: 'right' as const, className: 'hidden xl:table-cell', render: (j: JobRow) => j.viewed_by_client == null
    ? <span className="text-fg-subtle">—</span>
    : <span className={`text-[11px] font-semibold ${j.viewed_by_client ? 'text-accent-fg' : 'text-fg-subtle'}`}>{j.viewed_by_client ? '✓' : '✗'}</span> },
  reviews: { key: 'reviews', label: 'Reviews', align: 'right' as const, className: 'hidden xl:table-cell', render: (j: JobRow) => {
    const rating = j.client_rating != null ? `${j.client_rating.toFixed(1)}★` : null
    const count = j.client_total_reviews && j.client_total_reviews > 0 ? `${j.client_total_reviews}` : null
    if (!rating && !count) return <span className="text-fg-subtle text-[11px]">—</span>
    const text = count && rating ? `${count} · ${rating}` : (rating ?? `${count} reviews`)
    return <span className="text-[11px] text-fg-muted font-mono tabular-nums whitespace-nowrap">{text}</span>
  } },
  payment: { key: 'payment', label: 'Payment', className: 'hidden xl:table-cell', render: (j: JobRow) => {
    const v = j.client_verification
    if (!v) return <span className="text-fg-subtle text-[11px]">—</span>
    const ok = /verif/i.test(v)
    return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${ok ? 'bg-accent-bg text-accent-fg' : 'bg-slate-bg text-fg-subtle'}`}>{ok ? 'Verified' : v}</span>
  } },
  totalSpent: { key: 'totalSpent', label: 'Total Spent', align: 'right' as const, className: 'hidden lg:table-cell', render: (j: JobRow) => <span className="font-mono text-[11px] text-fg-muted tabular-nums">{moneyShort(j.client_total_spent)}</span> },
  lastUpdate: { key: 'lastUpdate', label: 'Last Update', className: 'hidden xl:table-cell', render: (j: JobRow) => <span className="font-mono text-[11px] text-fg-muted">{postedAgo(j.updated_at) ?? '—'}</span> },
} satisfies Record<string, Col>

// set completo de columnas (todo lo que está en Notion)
const FULL: Col[] = [
  COL.title, COL.flow, COL.universe, COL.status,
  COL.score, COL.match, COL.priority,
  COL.ticket, COL.totalSpent, COL.proposals, COL.invites, COL.unanswered, COL.interviewing,
  COL.viewedByClient, COL.reviews, COL.payment,
  COL.prefLoc, COL.country, COL.keyword,
  COL.posted, COL.added, COL.lastUpdate, COL.declineReason, COL.link,
]

export const NOTION_VIEW_COLUMNS: Record<string, Col[]> = {
  prospectos: FULL,
  prequalified: FULL,
  qualified: FULL,
  check_proposal: [COL.title, COL.flow, COL.ticket, COL.proposals, COL.score, COL.link, COL.cover],
  ready_to_send: [COL.title, COL.flow, COL.ticket, COL.score, COL.cover, COL.ready],
  sent: [COL.title, COL.flow, COL.ticket, COL.score, COL.sent],
  discarded: FULL,
}

// ── table ───────────────────────────────────────────────────────────────────

export default function NotionTable({
  jobs,
  columns,
  buNames,
  sortBy = 'score',
}: {
  jobs: JobRow[]
  columns: Col[]
  buNames: Record<string, string>
  sortBy?: 'score' | 'recent'
}) {
  const [activeJob, setActiveJob] = useState<JobRow | null>(null)
  const [discarding, setDiscarding] = useState<string | null>(null)
  const router = useRouter()
  const ctx: Ctx = { buNames }

  // Tachito: descartar un job desde la fila (sin abrir el modal).
  async function discardJob(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Discard this job? (move it out of your list)')) return
    setDiscarding(id)
    try {
      const r = await fetch(`/api/jobs/${id}/discard`, { method: 'POST' })
      if (!r.ok) { alert('Could not discard: ' + (await r.text())); return }
      router.refresh()
    } finally {
      setDiscarding(null)
    }
  }

  // Orden elegible. byDate = más nuevos arriba. ageDays = antigüedad del post en días.
  const byDate = (a: JobRow, b: JobRow) => (b.post_date ?? '').localeCompare(a.post_date ?? '')
  const ageDays = (j: JobRow) => j.post_date ? Math.floor((Date.now() - new Date(j.post_date).getTime()) / 86400000) : 9999
  const sorted = [...jobs].sort((a, b) => {
    if (sortBy === 'recent') return byDate(a, b)
    // 'score' = FRESCO + MEJOR: día más nuevo primero, dentro del día el mejor score.
    return (ageDays(a) - ageDays(b)) || (matchPct(b) - matchPct(a)) || byDate(a, b)
  })

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
                sorted.map((job) => (
                  <tr
                    key={job.id}
                    onClick={(e) => {
                      const target = e.target as HTMLElement
                      if (target.closest('a, button')) return
                      setActiveJob(job)
                    }}
                    className="border-b border-border last:border-0 group transition-colors cursor-pointer hover:bg-bg [&:hover_td.sticky]:bg-bg"
                  >
                    {columns.map((c, i) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2 align-middle border-b border-r border-border ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''} ${
                          i === 0 ? 'sticky left-0 z-10 bg-surface pl-4 min-w-[200px] md:min-w-[300px]' : 'whitespace-nowrap'
                        } ${c.className ?? ''}`}
                      >
                        {c.render(job, ctx)}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => discardJob(job.id, e)}
                        disabled={discarding === job.id}
                        title="Discard (move to Discarded)"
                        aria-label="Discard job"
                        className="inline-flex items-center justify-center text-fg-subtle/60 hover:text-destructive hover:scale-110 transition disabled:opacity-30 cursor-pointer"
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M2.5 4h11" />
                          <path d="M5.5 4V2.75h5V4" />
                          <path d="M3.75 4l.6 9.25a1 1 0 0 0 1 .95h5.3a1 1 0 0 0 1-.95L12.25 4" />
                          <path d="M6.5 6.75v5M9.5 6.75v5" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {activeJob && <JobDetailModal job={activeJob} onClose={() => setActiveJob(null)} />}
    </>
  )
}
