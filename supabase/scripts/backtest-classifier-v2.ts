// Re-corre el classifier (con fix capas 1-7) sobre las MISMAS 200 proposals del
// backtest original. Output: JSONL nuevo con resultados v2 para comparar lado a lado.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { llmClassify } from '../../lib/classifier/llm-classifier.ts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY
if (!url || !secret || !anthropicKey) throw new Error('env vars missing')

const supabase = createClient(url, secret, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: anthropicKey })

// Cargar los 200 IDs del backtest original
const oldResults = readFileSync('out/backtest-classifier-2026-06-02T20-13-26-487Z.jsonl', 'utf8')
  .split('\n').filter(Boolean).map(l => JSON.parse(l))

const oldById = new Map(oldResults.map(r => [r.proposal_id, r]))
console.log(`Cargados ${oldResults.length} jobs del backtest viejo`)

const startedAt = new Date().toISOString()
const stamp = startedAt.replace(/[:.]/g, '-')
mkdirSync('out', { recursive: true })
const outPath = join('out', `backtest-classifier-v2-${stamp}.jsonl`)
writeFileSync(outPath, '')
console.log(`Output: ${outPath}\n`)

const t0 = Date.now()
let flippedToQual = 0
let flippedToDisc = 0
let unchanged = 0
let errors = 0

for (let i = 0; i < oldResults.length; i++) {
  const old = oldResults[i]
  try {
    const { data: p } = await supabase
      .from('proposals')
      .select('description, ticket, keyword')
      .eq('id', old.proposal_id)
      .single()
    if (!p) { errors++; continue }

    const result = await llmClassify(
      { title: old.job_title, description: p.description, ticket: p.ticket, industry: p.keyword },
      supabase,
      anthropic,
    )
    const ticketViable = (p.ticket ?? 0) >= 40
    const newFinalMatch = result.match || (!!result.area && ticketViable)

    const row = {
      proposal_id: old.proposal_id,
      job_title: old.job_title,
      sent_date: old.sent_date,
      ticket: p.ticket,
      keyword: p.keyword,
      old_match_final: old.brain_match_final,
      old_area: old.brain_area,
      old_score: old.brain_score,
      old_reason: old.brain_reason,
      new_match_raw: result.match,
      new_match_final: newFinalMatch,
      new_area: result.area,
      new_score: result.score,
      new_reason: result.reason,
      changed: old.brain_match_final !== newFinalMatch,
      flip_direction: old.brain_match_final !== newFinalMatch
        ? (newFinalMatch ? 'disc→qual' : 'qual→disc')
        : null,
    }
    appendFileSync(outPath, JSON.stringify(row) + '\n')

    if (old.brain_match_final !== newFinalMatch) {
      if (newFinalMatch) flippedToQual++
      else flippedToDisc++
    } else unchanged++

    const verdict = newFinalMatch ? '✓QUAL' : '✗DISC'
    const flip = old.brain_match_final !== newFinalMatch
      ? (newFinalMatch ? ' ⭐FLIP→QUAL' : ' ⚠FLIP→DISC')
      : ''
    console.log(`[${i+1}/${oldResults.length}] ${verdict}${flip} score=${result.score} area=${(result.area ?? '-').padEnd(40)} | ${old.job_title.slice(0, 50)}`)
  } catch (e) {
    errors++
    console.log(`[${i+1}/${oldResults.length}] ERROR: ${(e as Error).message}`)
  }
}

const elapsed = Math.round((Date.now() - t0) / 1000)
console.log()
console.log('═'.repeat(70))
console.log(`done in ${elapsed}s · errors: ${errors}`)
console.log()
console.log(`UNCHANGED:        ${unchanged}/${oldResults.length}`)
console.log(`FLIPPED→QUAL:     ${flippedToQual}/${oldResults.length} (recuperados — el fix los rescató)`)
console.log(`FLIPPED→DISC:     ${flippedToDisc}/${oldResults.length} (regresiones — antes pasaban, ahora no)`)
console.log()
console.log(`Output: ${outPath}`)
