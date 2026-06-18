import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/update-answers
 *
 * Persiste las respuestas editadas por el usuario en jobs.questions_answers.
 * No regenera nada — solo guarda el array que viene del frontend.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = getServerClient()

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (!Array.isArray(body?.answers)) {
    return NextResponse.json({ error: 'expected { answers: [...] }' }, { status: 400 })
  }

  // Sanitizar: solo guardamos campos esperados, evitamos pasar basura al jsonb
  const sanitized = body.answers
    .filter((a: any) => a && typeof a.question === 'string' && typeof a.answer === 'string')
    .map((a: any) => ({
      question: a.question,
      sequenceNumber: typeof a.sequenceNumber === 'number' ? a.sequenceNumber : 0,
      answer: a.answer,
      edited_at: new Date().toISOString(),
    }))

  const { error } = await supabase
    .from('jobs')
    .update({ questions_answers: sanitized })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: sanitized.length })
}
