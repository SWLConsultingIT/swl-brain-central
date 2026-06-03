// Valida el fix del classifier (capas 1-7) re-clasificando 10 jobs que
// el backtest viejo descartó por "ticket bajo". Output: comparación side-by-side.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { llmClassify } from '../../lib/classifier/llm-classifier.ts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY
if (!url || !secret || !anthropicKey) throw new Error('env vars missing')

const supabase = createClient(url, secret, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: anthropicKey })

// Cargar resultados del backtest viejo
const oldResults = readFileSync('out/backtest-classifier-2026-06-02T20-13-26-487Z.jsonl', 'utf8')
  .split('\n').filter(Boolean).map(l => JSON.parse(l))

// Filtrar jobs que el viejo classifier descartó con razones de budget/ticket
const BUDGET_KEYWORDS = /below.*minimum|below.*threshold|budget.*insufficient|budget.*non.?viable|ticket.*low|far.*below|too\s+low|engagement\s+minimum|severely\s+underpriced/i
const candidates = oldResults.filter(r =>
  !r.brain_match_final &&
  BUDGET_KEYWORDS.test(r.brain_reason ?? '')
)

console.log(`Candidatos descartados por budget/ticket: ${candidates.length}`)
const sample = candidates.slice(0, 10)
console.log(`Tomando muestra de ${sample.length} para re-clasificar`)
console.log()

// Para cada uno, traer description completa de proposals + re-clasificar
let flipped = 0
let stillDiscarded = 0
for (let i = 0; i < sample.length; i++) {
  const old = sample[i]
  const { data: p } = await supabase
    .from('proposals')
    .select('description, ticket, keyword')
    .eq('id', old.proposal_id)
    .single()
  if (!p) { console.log(`[${i+1}/10] SKIP — proposal ${old.proposal_id} not found`); continue }

  const result = await llmClassify(
    { title: old.job_title, description: p.description, ticket: p.ticket, industry: p.keyword },
    supabase,
    anthropic,
  )

  const ticketViable = (p.ticket ?? 0) >= 40
  const newFinalMatch = result.match || (!!result.area && ticketViable)
  const verdict = newFinalMatch ? '✓ QUALIFIED' : '✗ DISCARDED'
  const change = old.brain_match_final === newFinalMatch ? '(igual)' : (newFinalMatch ? '⭐ FLIPPED to QUAL' : '(sigue DISC)')

  console.log('━'.repeat(90))
  console.log(`[${i+1}/10] ${old.job_title.slice(0, 70)}`)
  console.log(`  Ticket: $${p.ticket}  Keyword: ${p.keyword}`)
  console.log()
  console.log(`  VIEJO: ✗ DISCARDED (area=${old.brain_area ?? 'null'}, score=${old.brain_score})`)
  console.log(`  reason: ${(old.brain_reason ?? '').slice(0, 150)}`)
  console.log()
  console.log(`  NUEVO: ${verdict} ${change}  (area=${result.area ?? 'null'}, score=${result.score})`)
  console.log(`  reason: ${(result.reason ?? '').slice(0, 150)}`)
  console.log()
  if (newFinalMatch && !old.brain_match_final) flipped++
  else if (!newFinalMatch) stillDiscarded++
}

console.log('═'.repeat(90))
console.log(`RESUMEN: ${flipped}/${sample.length} flipped a QUALIFIED · ${stillDiscarded}/${sample.length} siguen DISCARDED`)
