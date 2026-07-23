import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ALLOWED = new Set(['proposal_drafted', 'ready_to_send', 'qualified'])

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  let comment = ''
  try {
    const body = await request.json()
    if (body && typeof body.comment === 'string') comment = body.comment.trim()
  } catch {}

  const { data: job, error: fetchErr } = await supabase.from('linkedin_jobs').select('id, status').eq('id', id).single()
  if (fetchErr || !job) return NextResponse.json({ error: 'job not found' }, { status: 404 })
  if (!ALLOWED.has(job.status)) {
    return NextResponse.json({ error: `job en estado '${job.status}' no se puede mandar a chequear` }, { status: 409 })
  }

  const reason = comment ? `A chequear: ${comment}` : 'Marcado para chequear manualmente'
  const { error } = await supabase.rpc('brain_transition_linkedin_job', {
    p_job_id: id,
    p_to_status: 'discarded_review',
    p_actor: 'human',
    p_actor_detail: 'ui_to_review',
    p_reason: reason,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id, status: 'discarded_review' })
}
