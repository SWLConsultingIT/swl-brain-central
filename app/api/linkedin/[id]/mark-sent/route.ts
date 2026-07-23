import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/linkedin/[id]/mark-sent
 * Marca el job como aplicado en LinkedIn. Auto-promueve proposal_drafted → ready_to_send → sent.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  const { data: job, error: fetchErr } = await supabase.from('linkedin_jobs').select('id, status').eq('id', id).single()
  if (fetchErr || !job) return NextResponse.json({ error: 'job not found' }, { status: 404 })

  // Cadena de pasos según estado actual hasta llegar a 'sent'.
  const steps: string[] = []
  if (job.status === 'proposal_drafted') steps.push('ready_to_send', 'sent')
  else if (job.status === 'ready_to_send') steps.push('sent')
  else if (job.status === 'sent') return NextResponse.json({ ok: true, id, status: 'sent' })
  else return NextResponse.json({ error: `no se puede enviar desde '${job.status}'` }, { status: 409 })

  for (const to of steps) {
    const { error } = await supabase.rpc('brain_transition_linkedin_job', {
      p_job_id: id,
      p_to_status: to,
      p_actor: 'human',
      p_actor_detail: 'ui_mark_sent',
      p_reason: 'Aplicado en LinkedIn',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id, status: 'sent' })
}
