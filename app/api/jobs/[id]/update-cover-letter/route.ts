import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/update-cover-letter
 * Body: { draft: string }
 *
 * Persiste edits manuales del operador al cover letter. No cambia status.
 * Solo permitido en proposal_drafted / ready_to_send (jobs ya con draft).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { draft?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 })
  }

  const draft = (body.draft ?? '').toString()
  if (draft.trim().length < 10) {
    return NextResponse.json({ error: 'draft too short' }, { status: 400 })
  }

  const supabase = getServerClient()

  const { data: job, error: fetchErr } = await supabase
    .from('jobs')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchErr || !job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }

  if (job.status !== 'proposal_drafted' && job.status !== 'ready_to_send') {
    return NextResponse.json(
      { error: `cannot edit cover letter in status '${job.status}'` },
      { status: 409 },
    )
  }

  const { error: updErr } = await supabase
    .from('jobs')
    .update({ cover_letter_draft: draft })
    .eq('id', id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id, length: draft.length })
}
