import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** POST /api/linkedin/[id]/mark-ready — proposal_drafted → ready_to_send */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  const { data: job, error: fetchErr } = await supabase.from('linkedin_jobs').select('id, status').eq('id', id).single()
  if (fetchErr || !job) return NextResponse.json({ error: 'job not found' }, { status: 404 })
  if (job.status !== 'proposal_drafted') {
    return NextResponse.json({ error: `job debe estar en 'proposal_drafted' (actual: ${job.status})` }, { status: 409 })
  }

  const { error } = await supabase.rpc('brain_transition_linkedin_job', {
    p_job_id: id,
    p_to_status: 'ready_to_send',
    p_actor: 'human',
    p_actor_detail: 'ui_send_button',
    p_reason: 'Listo para aplicar',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id, status: 'ready_to_send' })
}
