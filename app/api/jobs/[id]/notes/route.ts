import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/notes
 * Body: { notes: string }
 *
 * Persists operator notes for a job (free-form text). Empty string clears notes.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { notes?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 })
  }

  const notes = (body.notes ?? '').toString()
  const value = notes.trim().length === 0 ? null : notes

  const supabase = getServerClient()
  const { error } = await supabase.from('jobs').update({ notes: value }).eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id, length: notes.length })
}
