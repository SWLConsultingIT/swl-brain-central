import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** POST /api/linkedin/[id]/notes  { notes } — UPDATE directo (sin cambio de estado). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  let notes = ''
  try {
    const body = await request.json()
    notes = typeof body?.notes === 'string' ? body.notes : ''
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { error } = await supabase.from('linkedin_jobs').update({ notes }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id })
}
