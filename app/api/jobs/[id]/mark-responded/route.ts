import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/mark-responded
 *
 * Toggle whether a client replied on Upwork.
 * Body: { responded?: boolean }  (default true)
 *   true  → sent → responded
 *   false → responded → sent   (undo if marked by mistake)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = getServerClient()

  let responded = true
  try {
    const body = (await request.json()) as { responded?: unknown }
    if (typeof body?.responded === 'boolean') responded = body.responded
  } catch {
    /* sin body → marcar como respondido */
  }

  const target = responded ? 'responded' : 'sent'
  const expectedFrom = responded ? 'sent' : 'responded'

  const { data: job, error: fetchErr } = await supabase
    .from('jobs')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchErr || !job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }

  if (job.status === target) {
    return NextResponse.json({ ok: true, id, status: target, noop: true })
  }

  if (job.status !== expectedFrom) {
    return NextResponse.json(
      { error: `job must be in '${expectedFrom}' (current: ${job.status})` },
      { status: 409 },
    )
  }

  const { error: rpcErr } = await supabase.rpc('brain_transition_job', {
    p_job_id: id,
    p_to_status: target,
    p_actor: 'human',
    p_actor_detail: 'ui_toggle_responded',
    p_reason: responded
      ? 'operator marked: client replied on Upwork'
      : 'operator unmarked: no reply after all',
  })

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id, status: target })
}
