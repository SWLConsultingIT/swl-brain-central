import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Modelo LinkedIn: TODOS los scrapeados están en Check Proposal. "Descartar" a mano =
// el humano lo saca de la lista → discarded_review (solapa "Descartados"). No usamos
// 'discarded' para descartes humanos (ese estado lo pone el classifier = bajo score).
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
  if (job.status === 'discarded_review') return NextResponse.json({ ok: true, id, status: 'discarded_review' })

  const { error } = await supabase.rpc('brain_transition_linkedin_job', {
    p_job_id: id,
    p_to_status: 'discarded_review',
    p_actor: 'human',
    p_actor_detail: 'ui_discard',
    p_reason: reason,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id, status: 'discarded_review' })
}
