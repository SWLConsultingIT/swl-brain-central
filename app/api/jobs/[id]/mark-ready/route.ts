import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/mark-ready
 *
 * Transition proposal_drafted -> ready_to_send.
 * Triggered by Send button when operator copies cover and opens Upwork.
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

  if (job.status === 'ready_to_send') {
    return NextResponse.json({ ok: true, id, status: 'ready_to_send', noop: true })
  }

  if (job.status !== 'proposal_drafted') {
    return NextResponse.json(
      { error: `job must be in proposal_drafted (current: ${job.status})` },
      { status: 409 },
    )
  }

  const { error: rpcErr } = await supabase.rpc('brain_transition_job', {
    p_job_id: id,
    p_to_status: 'ready_to_send',
    p_actor: 'human',
    p_actor_detail: 'ui_send_button',
    p_reason: 'operator clicked Send: cover letter copied and Upwork link opened',
  })

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id, status: 'ready_to_send' })
}
