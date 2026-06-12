import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/mark-responded
 *
 * Transition sent -> responded when a client replies on Upwork.
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

  if (job.status === 'responded') {
    return NextResponse.json({ ok: true, id, status: 'responded', noop: true })
  }

  if (job.status !== 'sent') {
    return NextResponse.json(
      { error: `job must be in 'sent' (current: ${job.status})` },
      { status: 409 },
    )
  }

  const { error: rpcErr } = await supabase.rpc('brain_transition_job', {
    p_job_id: id,
    p_to_status: 'responded',
    p_actor: 'human',
    p_actor_detail: 'ui_mark_responded',
    p_reason: 'operator marked: client replied on Upwork',
  })

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id, status: 'responded' })
}
