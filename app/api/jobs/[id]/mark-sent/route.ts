import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/mark-sent
 *
 * Marca un job como Sent. Requiere status='proposal_drafted' o 'ready_to_send'.
 * Hace la transición via RPC brain_transition_job para mantener audit consistente.
 */
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

  if (job.status === 'proposal_drafted') {
    const { error: t1 } = await supabase.rpc('brain_transition_job', {
      p_job_id: id,
      p_to_status: 'ready_to_send',
      p_actor: 'human',
      p_actor_detail: 'ui_mark_sent',
      p_reason: 'user marked as sent from UI (auto-promoted to ready_to_send first)',
    })
    if (t1) return NextResponse.json({ error: t1.message }, { status: 500 })
  } else if (job.status !== 'ready_to_send') {
    return NextResponse.json(
      { error: `job must be in proposal_drafted or ready_to_send (current: ${job.status})` },
      { status: 409 },
    )
  }

  const { error: t2 } = await supabase.rpc('brain_transition_job', {
    p_job_id: id,
    p_to_status: 'sent',
    p_actor: 'human',
    p_actor_detail: 'ui_mark_sent',
    p_reason: 'user marked as sent from UI',
  })
  if (t2) return NextResponse.json({ error: t2.message }, { status: 500 })

  return NextResponse.json({ ok: true, id, status: 'sent' })
}
