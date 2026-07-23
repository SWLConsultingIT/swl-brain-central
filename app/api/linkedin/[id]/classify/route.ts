import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerClient } from '@/lib/supabase/server'
import { llmClassify, CLASSIFIER_MODEL } from '@/lib/classifier/llm-classifier'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/linkedin/[id]/classify
 *
 * LinkedIn no tiene ticket filter (el scraper ya filtró Contract/Freelance + USA),
 * así que clasifica directo: new | prequalified → qualified | discarded (LLM + BU cards).
 * Reutiliza llmClassify (que solo lee business_units + proposals; no toca `jobs`).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  const { data: job, error: fetchErr } = await supabase
    .from('linkedin_jobs')
    .select('id, status, title, description, industry')
    .eq('id', id)
    .single()

  if (fetchErr || !job) return NextResponse.json({ error: 'job not found' }, { status: 404 })

  if (!['new', 'prequalified'].includes(job.status)) {
    return NextResponse.json({ error: `job status "${job.status}" not classifiable` }, { status: 409 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing in env' }, { status: 503 })
  const anthropic = new Anthropic({ apiKey })

  let llmResult
  try {
    llmResult = await llmClassify(
      { title: job.title, description: job.description, ticket: null, industry: job.industry },
      supabase,
      anthropic,
    )
  } catch (e) {
    return NextResponse.json({ error: `LLM classify failed: ${(e as Error).message}` }, { status: 500 })
  }

  const newStatus = llmResult.match ? 'qualified' : 'discarded'
  const { error: rpcErr } = await supabase.rpc('brain_transition_linkedin_job', {
    p_job_id: id,
    p_to_status: newStatus,
    p_actor: 'brain_classifier',
    p_actor_detail: CLASSIFIER_MODEL,
    p_reason: llmResult.reason,
    p_classifier_match: llmResult.match,
    p_classifier_score: llmResult.score,
    p_classifier_area: llmResult.area,
    p_business_unit_id: llmResult.business_unit_id,
  })
  if (rpcErr) return NextResponse.json({ error: `transition failed: ${rpcErr.message}` }, { status: 500 })

  return NextResponse.json({ status: newStatus, match: llmResult.match, score: llmResult.score, area: llmResult.area, reason: llmResult.reason })
}
