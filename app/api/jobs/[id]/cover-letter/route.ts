import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getServerClient } from '@/lib/supabase/server'
import { generateCoverLetter } from '@/lib/cover-letter/generator'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/cover-letter
 *
 * Genera la cover letter para un job qualified.
 * Requiere: status='qualified' AND business_unit_id != null.
 * Side effects: actualiza jobs.cover_letter_draft + status='proposal_drafted',
 *               escribe job_decisions con actor='brain_cover_letter'.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = getServerClient()

  const { data: job, error: fetchErr } = await supabase
    .from('jobs')
    .select(
      'id, status, title, description, ticket, industry, country, duration, business_unit_id',
    )
    .eq('id', id)
    .single()

  if (fetchErr || !job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }

  if (job.status !== 'qualified') {
    return NextResponse.json(
      { error: `job must be in 'qualified' status to draft cover letter (current: ${job.status})` },
      { status: 409 },
    )
  }

  if (!job.business_unit_id) {
    return NextResponse.json(
      { error: 'job has no business_unit_id — run the classifier first' },
      { status: 409 },
    )
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY missing in env' }, { status: 503 })
  }
  const openai = new OpenAI({ apiKey })

  let result
  try {
    result = await generateCoverLetter(
      {
        title: job.title,
        description: job.description,
        ticket: job.ticket,
        industry: job.industry,
        country: job.country,
        duration: job.duration,
      },
      job.business_unit_id,
      supabase,
      openai,
    )
  } catch (e) {
    return NextResponse.json(
      { error: `cover letter generation failed: ${(e as Error).message}` },
      { status: 500 },
    )
  }

  const now = new Date().toISOString()

  // Persistir el draft + avanzar status
  const upd = await supabase
    .from('jobs')
    .update({
      cover_letter_draft: result.cover_letter,
      cover_letter_generated_at: now,
      status: 'proposal_drafted',
    })
    .eq('id', id)

  if (upd.error) {
    return NextResponse.json({ error: `update failed: ${upd.error.message}` }, { status: 500 })
  }

  // Audit trail
  await supabase.from('job_decisions').insert({
    job_id: id,
    from_status: 'qualified',
    to_status: 'proposal_drafted',
    actor: 'brain_cover_letter',
    actor_detail: result.model,
    reason: `cover letter generated using BU card + ${result.precedent_count} precedent (${result.precedent_with_cl} with full text)`,
  })

  return NextResponse.json({
    status: 'proposal_drafted',
    cover_letter: result.cover_letter,
    model: result.model,
    precedent_count: result.precedent_count,
    precedent_with_cl: result.precedent_with_cl,
  })
}
