import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerClient } from '@/lib/supabase/server'
import { ticketFilter } from '@/lib/classifier/ticket-filter'
import { llmClassify, CLASSIFIER_MODEL } from '@/lib/classifier/llm-classifier'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/classify
 *
 * State machine que avanza el job según su status actual:
 *   new          → prequalified | discarded   (ticket filter, no LLM)
 *   prequalified → qualified    | discarded   (LLM + BU cards + precedent)
 *   else         → 409
 *
 * Cada transición se escribe en job_decisions como audit trail.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = getServerClient()

  const { data: job, error: fetchErr } = await supabase
    .from('jobs')
    .select('id, status, title, description, ticket, ticket_currency, industry')
    .eq('id', id)
    .single()

  if (fetchErr || !job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }

  // ── Stage 1: ticket filter (new → prequalified | discarded) ────────────
  if (job.status === 'new') {
    const result = ticketFilter({ ticket: job.ticket, ticket_currency: job.ticket_currency })
    const newStatus = result.passes ? 'prequalified' : 'discarded'

    const { error: rpcErr } = await supabase.rpc('brain_transition_job', {
      p_job_id: id,
      p_to_status: newStatus,
      p_actor: 'brain_ticket_filter',
      p_actor_detail: 'v1',
      p_reason: result.reason,
    })
    if (rpcErr) {
      return NextResponse.json({ error: `transition failed: ${rpcErr.message}` }, { status: 500 })
    }

    return NextResponse.json({ stage: 'ticket', status: newStatus, reason: result.reason })
  }

  // ── Stage 2: LLM classifier (prequalified → qualified | discarded) ─────
  if (job.status === 'prequalified') {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY missing in env' },
        { status: 503 },
      )
    }
    const anthropic = new Anthropic({ apiKey })

    let llmResult
    try {
      llmResult = await llmClassify(
        {
          title: job.title,
          description: job.description,
          ticket: job.ticket,
          industry: job.industry,
        },
        supabase,
        anthropic,
      )
    } catch (e) {
      return NextResponse.json(
        { error: `LLM classify failed: ${(e as Error).message}` },
        { status: 500 },
      )
    }

    const newStatus = llmResult.match ? 'qualified' : 'discarded'

    const { error: rpcErr } = await supabase.rpc('brain_transition_job', {
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
    if (rpcErr) {
      return NextResponse.json({ error: `transition failed: ${rpcErr.message}` }, { status: 500 })
    }

    return NextResponse.json({
      stage: 'llm',
      status: newStatus,
      match: llmResult.match,
      score: llmResult.score,
      area: llmResult.area,
      reason: llmResult.reason,
    })
  }

  return NextResponse.json(
    { error: `job status "${job.status}" not classifiable` },
    { status: 409 },
  )
}
