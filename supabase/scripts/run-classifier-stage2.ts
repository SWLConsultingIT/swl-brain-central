// Corre el LLM Classifier Stage 2 sobre todos los jobs en estado 'prequalified'.
// Usa la misma lógica que la API route POST /api/jobs/[id]/classify pero como
// script standalone para correr local sin levantar el dev server.
//
// Flujo por cada job:
//   1. llmClassify() — Sonnet 4.5 + 8 BU cards + precedente Sent.
//   2. UPDATE jobs: status, classifier_*, business_unit_id.
//   3. INSERT job_decisions con actor='brain_classifier'.
//
// Run: node --env-file=.env.local supabase/scripts/run-classifier-stage2.ts

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { llmClassify, CLASSIFIER_MODEL } from '../../lib/classifier/llm-classifier.ts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY
if (!url || !secret || !anthropicKey) throw new Error('env vars missing')

const supabase = createClient(url, secret, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: anthropicKey })

// 1) Levantar todos los prequalified
const { data: jobs, error } = await supabase
  .from('jobs')
  .select('id, title, description, ticket, industry')
  .eq('status', 'prequalified')

if (error) throw new Error(error.message)
const jobsList = (jobs ?? []) as Array<{
  id: string
  title: string
  description: string | null
  ticket: number | null
  industry: string | null
}>

console.log(`Encontrados ${jobsList.length} jobs en estado prequalified.\n`)

if (jobsList.length === 0) {
  console.log('Nada para hacer.')
  process.exit(0)
}

let qualified = 0
let discarded = 0
const errors: string[] = []

for (const job of jobsList) {
  console.log(`\n→ ${job.title.slice(0, 70)}`)

  let result
  try {
    result = await llmClassify(
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
    console.log(`   ✗ ERROR: ${(e as Error).message}`)
    errors.push(`${job.id}: ${(e as Error).message}`)
    continue
  }

  // Regla de negocio (decidida 2026-06-02): si el job pasó el prefilter (ticket ≥$40)
  // y el classifier le asignó una BU (area != null), va a qualified independiente del
  // score/match del LLM. El prefilter ya garantiza ticket viable, el match con BU
  // confirma scope. Razonamiento de "ticket bajo para seniority" del LLM se ignora.
  const hasArea = !!result.area
  const ticketViable = (job.ticket ?? 0) >= 40
  const finalMatch = result.match || (hasArea && ticketViable)
  const newStatus = finalMatch ? 'qualified' : 'discarded'
  const now = new Date().toISOString()

  const upd = await supabase
    .from('jobs')
    .update({
      status: newStatus,
      classifier_match: finalMatch,
      classifier_score: result.score,
      classifier_area: result.area,
      classifier_reason: result.reason,
      classifier_run_at: now,
      business_unit_id: result.business_unit_id,
    })
    .eq('id', job.id)

  if (upd.error) {
    console.log(`   ✗ UPDATE failed: ${upd.error.message}`)
    errors.push(`${job.id}: UPDATE ${upd.error.message}`)
    continue
  }

  const dec = await supabase.from('job_decisions').insert({
    job_id: job.id,
    from_status: 'prequalified',
    to_status: newStatus,
    actor: 'brain_classifier',
    actor_detail: CLASSIFIER_MODEL,
    reason: finalMatch && !result.match
      ? `[override: ticket $${job.ticket}+ area ${result.area}] ${result.reason}`
      : result.reason,
    classifier_match: finalMatch,
    classifier_score: result.score,
    classifier_area: result.area,
  })

  if (dec.error) {
    console.log(`   ⚠ decision insert failed: ${dec.error.message}`)
  }

  const overrideMark = finalMatch && !result.match ? ' [overridden]' : ''
  console.log(`   ${finalMatch ? '✓ QUALIFIED' : '✗ DISCARDED'}${overrideMark} (score=${result.score})`)
  console.log(`     area: ${result.area ?? 'null'}`)
  console.log(`     reason: ${result.reason}`)

  if (finalMatch) qualified++
  else discarded++
}

console.log(`\n──────────────────────`)
console.log(`✓ Done`)
console.log(`  qualified:  ${qualified}`)
console.log(`  discarded:  ${discarded}`)
console.log(`  errores:    ${errors.length}`)
if (errors.length > 0) {
  for (const e of errors) console.log(`  - ${e}`)
}
