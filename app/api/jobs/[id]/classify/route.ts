import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { ticketFilter } from '@/lib/classifier/ticket-filter'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/classify
 *
 * Corre el classifier v1 (ticket filter only) sobre el job.
 * Transición: new → prequalified (si pasa) o new → discarded (si no).
 * Loggea la decisión en job_decisions.
 *
 * Devuelve: { status, reason } o { error } con HTTP 4xx/5xx.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = getServerClient()

  const { data: job, error: fetchErr } = await supabase
    .from('jobs')
    .select('id, status, ticket, ticket_currency')
    .eq('id', id)
    .single()

  if (fetchErr || !job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }

  if (job.status !== 'new') {
    return NextResponse.json(
      { error: `job already classified — status is "${job.status}"` },
      { status: 409 },
    )
  }

  const result = ticketFilter({ ticket: job.ticket, ticket_currency: job.ticket_currency })
  const newStatus = result.passes ? 'prequalified' : 'discarded'

  // Update job status
  const { error: updateErr } = await supabase
    .from('jobs')
    .update({ status: newStatus })
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: `update failed: ${updateErr.message}` }, { status: 500 })
  }

  // Audit trail
  const { error: decisionErr } = await supabase.from('job_decisions').insert({
    job_id: id,
    from_status: 'new',
    to_status: newStatus,
    actor: 'brain_ticket_filter',
    actor_detail: 'v1',
    reason: result.reason,
  })

  if (decisionErr) {
    return NextResponse.json(
      { error: `decision log failed: ${decisionErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ status: newStatus, reason: result.reason })
}
