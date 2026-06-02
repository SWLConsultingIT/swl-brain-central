// Genera cover letters para todos los jobs en estado 'qualified'.
// Usa la lib generateCoverLetter (Anthropic Sonnet 4.5 + BU card + precedente).
//
// Flujo por cada job:
//   1. generateCoverLetter() → texto del draft.
//   2. UPDATE jobs: cover_letter_draft, cover_letter_generated_at, status='proposal_drafted'.
//   3. INSERT job_decisions con actor='brain_cover_letter'.
//
// Run: node --env-file=.env.local --experimental-strip-types supabase/scripts/run-cover-letters.ts

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { generateCoverLetter } from '../../lib/cover-letter/generator.ts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY
if (!url || !secret || !anthropicKey) throw new Error('env vars missing')

const supabase = createClient(url, secret, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: anthropicKey })

const { data: jobs, error } = await supabase
  .from('jobs')
  .select('id, title, description, ticket, industry, country, duration, business_unit_id')
  .eq('status', 'qualified')
  .not('business_unit_id', 'is', null)

if (error) throw new Error(error.message)
const jobsList = (jobs ?? []) as any[]

console.log(`Encontrados ${jobsList.length} jobs qualified con BU asignada.\n`)

if (jobsList.length === 0) {
  console.log('Nada para hacer.')
  process.exit(0)
}

let generated = 0
const errors: string[] = []

for (const job of jobsList) {
  console.log(`\n→ ${job.title.slice(0, 70)}`)

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
      anthropic,
    )
  } catch (e) {
    console.log(`   ✗ ERROR: ${(e as Error).message}`)
    errors.push(`${job.id}: ${(e as Error).message}`)
    continue
  }

  const now = new Date().toISOString()

  const upd = await supabase
    .from('jobs')
    .update({
      cover_letter_draft: result.cover_letter,
      cover_letter_generated_at: now,
      status: 'proposal_drafted',
    })
    .eq('id', job.id)

  if (upd.error) {
    console.log(`   ✗ UPDATE failed: ${upd.error.message}`)
    errors.push(`${job.id}: UPDATE ${upd.error.message}`)
    continue
  }

  await supabase.from('job_decisions').insert({
    job_id: job.id,
    from_status: 'qualified',
    to_status: 'proposal_drafted',
    actor: 'brain_cover_letter',
    actor_detail: result.model,
    reason: `cover letter generated, ${result.precedent_count} precedent (${result.precedent_with_cl} with text)`,
  })

  console.log(`   ✓ DRAFTED (${result.cover_letter.length} chars, ${result.precedent_count} precedent)`)
  console.log(`     preview: ${result.cover_letter.slice(0, 180).replace(/\n/g, ' ')}...`)
  generated++
}

console.log(`\n──────────────────────`)
console.log(`✓ Done`)
console.log(`  drafts generados: ${generated}`)
console.log(`  errores:          ${errors.length}`)
if (errors.length > 0) for (const e of errors) console.log(`  - ${e}`)
