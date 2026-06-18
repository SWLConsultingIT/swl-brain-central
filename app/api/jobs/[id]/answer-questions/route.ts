import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getServerClient } from '@/lib/supabase/server'
import { generateAnswers, type ScreeningQuestion } from '@/lib/answers/generator'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/answer-questions
 *
 * Genera respuestas automáticas a las screening questions de un job.
 * Requiere: jobs.questions IS NOT NULL AND length > 0 AND business_unit_id != null.
 * Idempotente: si ya hay questions_answers no regenera (a menos que se mande
 *              { force: true } en el body).
 * Side effects: actualiza jobs.questions_answers (sin cambiar status).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = getServerClient()

  let force = false
  try {
    const body = await request.json().catch(() => ({}))
    force = !!body?.force
  } catch {}

  const { data: job, error: fetchErr } = await supabase
    .from('jobs')
    .select(
      'id, status, title, description, ticket, industry, country, duration, business_unit_id, questions, questions_answers',
    )
    .eq('id', id)
    .single()

  if (fetchErr || !job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }

  const questions = (job.questions ?? []) as ScreeningQuestion[]
  if (!Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json(
      { ok: true, reason: 'job has no screening questions', answers: [] },
      { status: 200 },
    )
  }

  if (!job.business_unit_id) {
    return NextResponse.json(
      { error: 'job has no business_unit_id — run the classifier first' },
      { status: 409 },
    )
  }

  // Idempotencia: si ya hay respuestas y no se pidió force, devolverlas tal cual
  if (!force && Array.isArray(job.questions_answers) && job.questions_answers.length > 0) {
    return NextResponse.json({
      ok: true,
      cached: true,
      answers: job.questions_answers,
    })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY missing in env' }, { status: 503 })
  }
  const openai = new OpenAI({ apiKey })

  let result
  try {
    result = await generateAnswers(
      {
        title: job.title,
        description: job.description,
        ticket: job.ticket,
        industry: job.industry,
        country: job.country,
        duration: job.duration,
      },
      job.business_unit_id,
      questions,
      supabase,
      openai,
    )
  } catch (e) {
    return NextResponse.json(
      { error: `answer generation failed: ${(e as Error).message}` },
      { status: 500 },
    )
  }

  // Persist: { question, answer, edited_at } shape. edited_at queda null en auto-generadas.
  const toStore = result.answers.map((a) => ({
    question: a.question,
    sequenceNumber: a.sequenceNumber,
    answer: a.answer,
    edited_at: null,
  }))

  const { error: updateErr } = await supabase
    .from('jobs')
    .update({ questions_answers: toStore })
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json(
      { error: `db update failed: ${updateErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    cached: false,
    model: result.model,
    precedent_count: result.precedent_count,
    answers: toStore,
  })
}
