import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/discard
 *
 * Descarte manual desde la UI ("tachito").
 * - new / prequalified / qualified  → 'discarded'
 * - proposal_drafted / ready_to_send → 'discarded_review' (ya tenían trabajo invertido)
 * Usa el RPC brain_transition_job para mantener el audit consistente.
 */
const TO_DISCARDED = new Set(['new', 'prequalified', 'qualified'])
const TO_REVIEW = new Set(['proposal_drafted', 'ready_to_send'])

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = getServerClient()

  const { data: job, error: fetchErr } = await supabase
    .from('jobs')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchErr || !job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }

  const to = TO_DISCARDED.has(job.status)
    ? 'discarded'
    : TO_REVIEW.has(job.status)
    ? 'discarded_review'
    : null

  if (!to) {
    return NextResponse.json(
      { error: `job in status '${job.status}' cannot be discarded from UI` },
      { status: 409 },
    )
  }

  const { error: tErr } = await supabase.rpc('brain_transition_job', {
    p_job_id: id,
    p_to_status: to,
    p_actor: 'human',
    p_actor_detail: 'ui_discard',
    p_reason: 'user discarded from UI',
  })
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, id, status: to })
}
