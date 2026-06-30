import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/to-review
 *
 * Mandar manualmente un job del pipeline a "Para Chequear" (discarded_review).
 * Lo usa el botoncito de la fila en Check Proposal cuando querés sacar un job
 * del pipeline para revisarlo después (sin descartarlo del todo).
 */
const ALLOWED = new Set(['proposal_drafted', 'ready_to_send', 'qualified'])

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = getServerClient()

  // Comentario opcional del usuario (queda como motivo, visible en Para Chequear).
  let comment = ''
  try {
    const body = await request.json()
    if (body && typeof body.comment === 'string') comment = body.comment.trim()
  } catch {
    // sin body / body inválido → comentario vacío, usamos el motivo por defecto
  }

  const { data: job, error: fetchErr } = await supabase
    .from('jobs')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchErr || !job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }

  if (!ALLOWED.has(job.status)) {
    return NextResponse.json(
      { error: `job en estado '${job.status}' no se puede mandar a chequear` },
      { status: 409 },
    )
  }

  const reason = comment ? `A chequear: ${comment}` : 'Marcado para chequear manualmente'

  const { error: tErr } = await supabase.rpc('brain_transition_job', {
    p_job_id: id,
    p_to_status: 'discarded_review',
    p_actor: 'human',
    p_actor_detail: 'ui_to_review',
    p_reason: reason,
  })
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, id, status: 'discarded_review' })
}
