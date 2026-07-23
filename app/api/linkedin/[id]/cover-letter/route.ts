import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerClient } from '@/lib/supabase/server'
import { generateCoverLetter } from '@/lib/cover-letter/generator'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/linkedin/[id]/cover-letter
 *
 * Genera la nota de aplicación (pitch) para un LinkedIn job qualified.
 * Requiere status='qualified' + business_unit_id. qualified → proposal_drafted.
 * Reutiliza generateCoverLetter (lee business_units + proposals; no toca `jobs`).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  const { data: job, error: fetchErr } = await supabase
    .from('linkedin_jobs')
    .select('id, status, title, description, industry, country, employment_type, business_unit_id')
    .eq('id', id)
    .single()

  if (fetchErr || !job) return NextResponse.json({ error: 'job not found' }, { status: 404 })
  if (job.status !== 'qualified') {
    return NextResponse.json({ error: `job must be 'qualified' (current: ${job.status})` }, { status: 409 })
  }
  if (!job.business_unit_id) {
    return NextResponse.json({ error: 'job has no business_unit_id — run the classifier first' }, { status: 409 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing in env' }, { status: 503 })
  const anthropic = new Anthropic({ apiKey })

  let result
  try {
    result = await generateCoverLetter(
      {
        title: job.title,
        description: job.description,
        ticket: null,
        industry: job.industry,
        country: job.country,
        duration: job.employment_type, // LinkedIn: pasamos el tipo (Contract/Freelance) como "duration"
      },
      job.business_unit_id,
      supabase,
      anthropic,
    )
  } catch (e) {
    return NextResponse.json({ error: `note generation failed: ${(e as Error).message}` }, { status: 500 })
  }

  const { error: rpcErr } = await supabase.rpc('brain_transition_linkedin_job', {
    p_job_id: id,
    p_to_status: 'proposal_drafted',
    p_actor: 'brain_cover_letter',
    p_actor_detail: result.model,
    p_reason: `application note generated (${result.precedent_count} precedent)`,
    p_cover_letter_draft: result.cover_letter,
  })
  if (rpcErr) return NextResponse.json({ error: `transition failed: ${rpcErr.message}` }, { status: 500 })

  return NextResponse.json({ status: 'proposal_drafted', cover_letter: result.cover_letter, model: result.model })
}
