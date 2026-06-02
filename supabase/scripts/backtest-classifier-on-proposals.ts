// Backtest: corre el classifier del Brain sobre proposals históricas (las que SWL
// aplicó manualmente) y reporta qué hubiera descartado el Brain.
//
// NO escribe en DB. Output: JSONL en out/ con un row por proposal:
//   { proposal_id, upwork_id, job_title, sent_date, human_status,
//     brain_match, brain_score, brain_area, brain_reason }
//
// Uso:
//   node --env-file=.env.local --experimental-strip-types \
//     supabase/scripts/backtest-classifier-on-proposals.ts [limit]
//
// Default limit = 200 (más recientes Sent por sent_date desc).

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { llmClassify } from '../../lib/classifier/llm-classifier.ts'

const limit = Number(process.argv[2] ?? 200)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY
if (!url || !secret || !anthropicKey) throw new Error('env vars missing')

const supabase = createClient(url, secret, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: anthropicKey })

const startedAt = new Date().toISOString()
const stamp = startedAt.replace(/[:.]/g, '-')
mkdirSync('out', { recursive: true })
const outPath = join('out', `backtest-classifier-${stamp}.jsonl`)
writeFileSync(outPath, '')

console.log(`backtest classifier on Sent proposals — limit=${limit}`)
console.log(`output: ${outPath}`)
console.log('')

const { data: proposals, error } = await supabase
  .from('proposals')
  .select('id, upwork_id, job_title, description, ticket, status, sent_date, business_unit_id, keyword')
  .eq('status', 'Sent')
  .order('sent_date', { ascending: false })
  .limit(limit)

if (error) throw new Error(error.message)
const list = proposals ?? []
console.log(`loaded ${list.length} proposals`)
console.log('')

let qualified = 0
let discarded = 0
let errors = 0
const t0 = Date.now()

for (let i = 0; i < list.length; i++) {
  const p = list[i]
  try {
    const result = await llmClassify(
      {
        title: p.job_title,
        description: p.description,
        ticket: p.ticket,
        industry: p.keyword, // keyword sirve como hint de industria/categoría
      },
      supabase,
      anthropic,
    )

    // Misma regla override que run-brain-pipeline.ts:84-88
    const hasArea = !!result.area
    const ticketViable = (p.ticket ?? 0) >= 40
    const finalMatch = result.match || (hasArea && ticketViable)

    const row = {
      proposal_id: p.id,
      upwork_id: p.upwork_id,
      job_title: p.job_title,
      sent_date: p.sent_date,
      ticket: p.ticket,
      keyword: p.keyword,
      human_status: p.status,
      brain_match_raw: result.match,
      brain_match_final: finalMatch,
      override_applied: !result.match && finalMatch,
      brain_score: result.score,
      brain_area: result.area,
      brain_reason: result.reason,
    }
    appendFileSync(outPath, JSON.stringify(row) + '\n')

    if (finalMatch) qualified++
    else discarded++

    const verdict = finalMatch ? '✓ QUAL' : '✗ DISC'
    const ov = !result.match && finalMatch ? ' [OVERRIDE]' : ''
    console.log(`[${i + 1}/${list.length}] ${verdict}${ov} score=${result.score} area=${result.area ?? '-'} | ${p.job_title.slice(0, 70)}`)
  } catch (e) {
    errors++
    console.log(`[${i + 1}/${list.length}] ERROR: ${(e as Error).message} | ${p.job_title.slice(0, 70)}`)
  }
}

const elapsed = Math.round((Date.now() - t0) / 1000)
console.log('')
console.log(`════════════════════════════════════════════════`)
console.log(`done in ${elapsed}s`)
console.log(`qualified (brain would apply): ${qualified}`)
console.log(`discarded (brain would skip):  ${discarded}`)
console.log(`errors: ${errors}`)
console.log(`output: ${outPath}`)
