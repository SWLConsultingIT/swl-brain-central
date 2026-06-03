// Pipeline completo del Brain: classifier + cover letter en una sola corrida.
// Se ejecuta automáticamente vía launchd (macOS) después de que los scrapers
// terminan (10:45 AM). Cron sugerido: 11:00 AM diario.
//
// Uso manual:
//   node --env-file=.env.local --experimental-strip-types supabase/scripts/run-brain-pipeline.ts
//
// Lo que hace:
//   1. Busca jobs status='prequalified' → corre classifier (Haiku 4.5).
//      Aplica regla override: ticket≥$40 + area asignada → qualified.
//   2. Busca jobs status='qualified' → corre cover letter (Sonnet 4.5).
//      Pasa a 'proposal_drafted' con cover_letter_draft.
//
// Output: log a stdout + a un archivo en out/brain-pipeline-<timestamp>.log
// para que se pueda auditar después.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { llmClassify, CLASSIFIER_MODEL } from '../../lib/classifier/llm-classifier.ts'
import { generateCoverLetter, COVER_LETTER_MODEL } from '../../lib/cover-letter/generator.ts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY
if (!url || !secret || !anthropicKey) throw new Error('env vars missing')

const supabase = createClient(url, secret, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: anthropicKey })

const startedAt = new Date().toISOString()
const logLines: string[] = []
const log = (line: string) => {
  console.log(line)
  logLines.push(line)
}

log(`══════════════════════════════════════════════════════════════`)
log(`  BRAIN PIPELINE — started at ${startedAt}`)
log(`══════════════════════════════════════════════════════════════`)
log(``)

// ── ETAPA 1: Classifier sobre prequalified ────────────────────────
log(`[1/2] Classifier — buscando jobs status='prequalified'...`)

const { data: prequalified, error: errPre } = await supabase
  .from('jobs')
  .select('id, title, description, ticket, industry')
  .eq('status', 'prequalified')

if (errPre) {
  log(`  ✗ ERROR loading prequalified: ${errPre.message}`)
  process.exit(1)
}

const preList = (prequalified ?? []) as Array<{
  id: string
  title: string
  description: string | null
  ticket: number | null
  industry: string | null
}>

log(`  ${preList.length} prequalified encontrados.`)

let classifierQualified = 0
let classifierDiscarded = 0
let classifierErrors = 0

for (const job of preList) {
  try {
    const result = await llmClassify(
      {
        title: job.title,
        description: job.description,
        ticket: job.ticket,
        industry: job.industry,
      },
      supabase,
      anthropic,
    )

    // Regla override: ticket≥$40 + area asignada → qualified
    const hasArea = !!result.area
    const ticketViable = (job.ticket ?? 0) >= 40
    const finalMatch = result.match || (hasArea && ticketViable)
    const newStatus = finalMatch ? 'qualified' : 'discarded'
    const reasonText = finalMatch && !result.match
      ? `[override: ticket $${job.ticket}+ area ${result.area}] ${result.reason}`
      : result.reason

    const { error: rpcErr } = await supabase.rpc('brain_transition_job', {
      p_job_id: job.id,
      p_to_status: newStatus,
      p_actor: 'brain_classifier',
      p_actor_detail: CLASSIFIER_MODEL,
      p_reason: reasonText,
      p_classifier_match: finalMatch,
      p_classifier_score: result.score,
      p_classifier_area: result.area,
      p_business_unit_id: result.business_unit_id,
    })
    if (rpcErr) throw new Error(`transition failed: ${rpcErr.message}`)

    log(`  ${finalMatch ? '✓ QUALIFIED' : '✗ DISCARDED'} (score=${result.score}, area=${result.area ?? 'null'}) — ${job.title.slice(0, 60)}`)
    if (finalMatch) classifierQualified++
    else classifierDiscarded++
  } catch (e) {
    log(`  ✗ ERROR classifier ${job.id}: ${(e as Error).message}`)
    classifierErrors++
  }
}

log(``)
log(`  classifier: qualified=${classifierQualified} discarded=${classifierDiscarded} errors=${classifierErrors}`)
log(``)

// ── ETAPA 2: Cover letter sobre qualified ─────────────────────────
log(`[2/2] Cover letter — buscando jobs status='qualified'...`)

const { data: qualified, error: errQ } = await supabase
  .from('jobs')
  .select('id, title, description, ticket, industry, country, duration, business_unit_id')
  .eq('status', 'qualified')
  .not('business_unit_id', 'is', null)
  .is('cover_letter_draft', null)

if (errQ) {
  log(`  ✗ ERROR loading qualified: ${errQ.message}`)
  process.exit(1)
}

const qList = (qualified ?? []) as Array<{
  id: string
  title: string
  description: string | null
  ticket: number | null
  industry: string | null
  country: string | null
  duration: string | null
  business_unit_id: string
}>

log(`  ${qList.length} qualified encontrados.`)

let coverDrafted = 0
let coverErrors = 0

for (const job of qList) {
  try {
    const result = await generateCoverLetter(
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
      anthropic,
    )

    const { error: rpcErr } = await supabase.rpc('brain_transition_job', {
      p_job_id: job.id,
      p_to_status: 'proposal_drafted',
      p_actor: 'brain_cover_letter',
      p_actor_detail: COVER_LETTER_MODEL,
      p_reason: `cover letter drafted (${result.cover_letter.length} chars, ${result.precedent_count} precedent)`,
      p_cover_letter_draft: result.cover_letter,
    })
    if (rpcErr) throw new Error(`transition failed: ${rpcErr.message}`)

    log(`  ✓ DRAFTED (${result.cover_letter.length} chars) — ${job.title.slice(0, 60)}`)
    coverDrafted++
  } catch (e) {
    log(`  ✗ ERROR cover letter ${job.id}: ${(e as Error).message}`)
    coverErrors++
  }
}

log(``)
log(`  cover letter: drafted=${coverDrafted} errors=${coverErrors}`)
log(``)

const finishedAt = new Date().toISOString()
log(`══════════════════════════════════════════════════════════════`)
log(`  DONE at ${finishedAt}`)
log(`══════════════════════════════════════════════════════════════`)

// Guardar log a archivo para auditoría
try {
  mkdirSync('out', { recursive: true })
  const stamp = startedAt.replace(/[:.]/g, '-')
  writeFileSync(join('out', `brain-pipeline-${stamp}.log`), logLines.join('\n'))
} catch {
  // no romper si no podemos escribir el log
}
