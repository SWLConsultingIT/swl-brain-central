import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Desde el pipeline temprano → discarded (duro). Desde etapas avanzadas → discarded_review
// (blando, para revisar antes de tirarlo del todo). Mismo criterio que Upwork.
const HARD = new Set(['new', 'prequalified', 'qualified'])
const SOFT = new Set(['proposal_drafted', 'ready_to_send', 'sent', 'responded'])

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  let reason = 'Descartado manualmente'
  try {
    const body = await request.json()
    if (body && typeof body.reason === 'string' && body.reason.trim()) reason = body.reason.trim()
  } catch {}

  const { data: job, error: fetchErr } = await supabase.from('linkedin_jobs').select('id, status').eq('id', id).single()
  if (fetchErr || !job) return NextResponse.json({ error: 'job not found' }, { status: 404 })

  const target = HARD.has(job.status) ? 'discarded' : SOFT.has(job.status) ? 'discarded_review' : null
  if (!target) return NextResponse.json({ error: `no se puede descartar desde '${job.status}'` }, { status: 409 })

  const { error } = await supabase.rpc('brain_transition_linkedin_job', {
    p_job_id: id,
    p_to_status: target,
    p_actor: 'human',
    p_actor_detail: 'ui_discard',
    p_reason: reason,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id, status: target })
}
