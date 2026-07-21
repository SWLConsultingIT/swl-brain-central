import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/delete-invite
 *
 * Saca un invite de la solapa Invites.
 * - Si es un placeholder que creamos (título "⏳ Invite…"): borra la fila.
 * - Si es un job real que se marcó como invite: solo quita is_invite (lo deja como job normal).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  const { data: job } = await supabase.from('jobs').select('id, title, is_invite').eq('id', id).maybeSingle()
  if (!job) return NextResponse.json({ error: 'job not found' }, { status: 404 })

  const isPlaceholder = typeof job.title === 'string' && job.title.startsWith('⏳')

  if (isPlaceholder) {
    // limpiar decisiones asociadas primero (FK) y borrar la fila
    await supabase.from('job_decisions').delete().eq('job_id', id)
    const { error } = await supabase.from('jobs').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: true })
  }

  const { error } = await supabase.from('jobs').update({ is_invite: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, unflagged: true })
}
