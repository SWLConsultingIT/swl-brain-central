import { NextResponse } from 'next/server'
import OpenAI from 'openai'
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

    const upd = await supabase.from('jobs').update({ status: newStatus }).eq('id', id)
    if (upd.error) {
      return NextResponse.json({ error: `update failed: ${upd.error.message}` }, { status: 500 })
    }

    await supabase.from('job_decisions').insert({
      job_id: id,
      from_status: 'new',
      to_status: newStatus,
      actor: 'brain_ticket_filter',
      actor_detail: 'v1',
      reason: result.reason,
    })

    return NextResponse.json({ stage: 'ticket', status: newStatus, reason: result.reason })
  }

  // ── Stage 2: LLM classifier (prequalified → qualified | discarded) ─────
  if (job.status === 'prequalified') {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY missing in env' },
        { status: 503 },
      )
    }
    const openai = new OpenAI({ apiKey })

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
        openai,
      )
    } catch (e) {
      return NextResponse.json(
        { error: `LLM classify failed: ${(e as Error).message}` },
        { status: 500 },
      )
    }

    const newStatus = llmResult.match ? 'qualified' : 'discarded'
    const now = new Date().toISOString()

    const upd = await supabase
      .from('jobs')
      .update({
        status: newStatus,
        classifier_match: llmResult.match,
        classifier_score: llmResult.score,
        classifier_area: llmResult.area,
        classifier_reason: llmResult.reason,
        classifier_run_at: now,
        business_unit_id: llmResult.business_unit_id,
      })
      .eq('id', id)

    if (upd.error) {
      return NextResponse.json({ error: `update failed: ${upd.error.message}` }, { status: 500 })
    }

    await supabase.from('job_decisions').insert({
      job_id: id,
      from_status: 'prequalified',
      to_status: newStatus,
      actor: 'brain_classifier',
      actor_detail: CLASSIFIER_MODEL,
      reason: llmResult.reason,
      classifier_match: llmResult.match,
      classifier_score: llmResult.score,
      classifier_area: llmResult.area,
    })

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
