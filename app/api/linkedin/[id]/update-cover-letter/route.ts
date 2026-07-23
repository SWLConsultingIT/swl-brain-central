import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/linkedin/[id]/update-cover-letter  { cover_letter }
 * Edita la nota de aplicación a mano. Solo en proposal_drafted / ready_to_send.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  let text = ''
  try {
    const body = await request.json()
    text = typeof body?.cover_letter === 'string' ? body.cover_letter : ''
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { data: job, error: fetchErr } = await supabase.from('linkedin_jobs').select('id, status').eq('id', id).single()
  if (fetchErr || !job) return NextResponse.json({ error: 'job not found' }, { status: 404 })
  if (!['proposal_drafted', 'ready_to_send'].includes(job.status)) {
    return NextResponse.json({ error: `no editable en estado '${job.status}'` }, { status: 409 })
  }

  const { error } = await supabase.from('linkedin_jobs').update({ cover_letter_draft: text }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id })
}
