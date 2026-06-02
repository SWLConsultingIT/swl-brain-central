// LLM classifier — segundo gate después del ticket filter.
// Inputs: job + 8 BU cards de Supabase + precedente histórico (proposals Sent).
// Output: match (bool), score (0-100), area (BU name | null), reason.

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

// Haiku 4.5 para clasificación: 3x más barato que Sonnet ($0.004 vs $0.013/call),
// suficiente precisión para elegir 1 BU + score. Cover letter sigue en Sonnet
// (lib/cover-letter/generator.ts) — calidad del texto importa para ganar el job.
export const CLASSIFIER_MODEL = 'claude-haiku-4-5'

const HARD_EXCLUSIONS = [
  'pure graphic design only',
  'physical product manufacturing',
  'legal services',
  'medical services',
  'academic writing',
  'civil / mechanical / electrical engineering',
]

const PRECEDENT_PER_BU = 5
const PRECEDENT_TOTAL = 40

export type Job = {
  title: string
  description: string | null
  ticket: number | null
  industry: string | null
}

type BUCard = {
  id: string
  name: string
  description: string
  scopes: string[]
  keywords: string[]
  good_fit_signals: string
  red_flags: string
  decision_logic: string
}

export type LLMClassifierResult = {
  match: boolean
  score: number
  area: string | null
  business_unit_id: string | null
  reason: string
}

export async function llmClassify(
  job: Job,
  supabase: SupabaseClient,
  anthropic: Anthropic,
): Promise<LLMClassifierResult> {
  // 1. Cargar las 8 BU cards activas
  const { data: bus, error: buErr } = await supabase
    .from('business_units')
    .select('id, name, description, scopes, keywords, good_fit_signals, red_flags, decision_logic')
    .eq('is_active', true)

  if (buErr) throw new Error(`load business_units failed: ${buErr.message}`)
  if (!bus || bus.length === 0) throw new Error('no active business units')

  // 2. Precedente histórico: últimas proposals Sent agrupadas por BU
  const { data: precedent } = await supabase
    .from('proposals')
    .select('business_unit_id, job_title')
    .eq('status', 'Sent')
    .not('job_title', 'is', null)
    .not('business_unit_id', 'is', null)
    .order('sent_date', { ascending: false })
    .limit(PRECEDENT_TOTAL * 4)

  const precedentByBU = new Map<string, string[]>()
  for (const p of precedent ?? []) {
    if (!p.business_unit_id) continue
    const list = precedentByBU.get(p.business_unit_id) ?? []
    if (list.length < PRECEDENT_PER_BU) {
      list.push(p.job_title)
      precedentByBU.set(p.business_unit_id, list)
    }
  }

  // 3. Build BU section + name → id index for the response
  const buNameToId = new Map<string, string>()
  const buSection = (bus as BUCard[])
    .map(bu => {
      buNameToId.set(bu.name, bu.id)
      const prec = precedentByBU.get(bu.id)
      return [
        `## ${bu.name}`,
        bu.description,
        `Scopes: ${bu.scopes.join(' · ')}`,
        `Keywords: ${bu.keywords.join(', ')}`,
        `Good fit: ${bu.good_fit_signals}`,
        `Red flags: ${bu.red_flags}`,
        `Decision: ${bu.decision_logic}`,
        prec ? `Recent Sent precedent: ${prec.join(' · ')}` : 'Recent Sent precedent: (none yet)',
      ].join('\n')
    })
    .join('\n\n---\n\n')

  // 4. System prompt
  const systemPrompt = [
    `You are a senior qualification analyst for SWL Consulting, an AI-native consulting firm.`,
    ``,
    `Your job: decide if an incoming Upwork job is a MATCH for SWL.`,
    ``,
    `Below are SWL's 8 business units. Each card includes scope, keywords, good-fit signals, red flags, decision logic, and recent precedent (real proposals SWL has sent).`,
    ``,
    buSection,
    ``,
    `---`,
    ``,
    `HARD EXCLUSIONS (always match=false, score≤10): ${HARD_EXCLUSIONS.join(' · ')}.`,
    ``,
    `Decision protocol:`,
    `1. Read job title + description.`,
    `2. Identify which BU (if any) fits.`,
    `3. Weigh against good-fit signals, red flags, decision logic, and precedent.`,
    `4. Decide match=true ONLY when there is a clear scope fit + realistic precedent.`,
    `5. Assign score: 0=clear miss · 30=weak/no precedent · 60=plausible · 85+=strong fit with precedent.`,
    `6. reason ≤ 25 words, concrete, cite signals or precedent.`,
    ``,
    `Return ONLY valid JSON, no markdown fences, no prose: { "match": bool, "score": 0-100, "area": <one of the BU names above> | null, "reason": "..." }`,
  ].join('\n')

  // 5. Llamada al LLM
  const userPrompt = [
    `Job title: ${job.title}`,
    `Ticket: ${job.ticket != null ? '$' + job.ticket + ' USD' : 'n/a'}`,
    `Industry: ${job.industry ?? 'n/a'}`,
    ``,
    `Description:`,
    job.description ?? '(no description)',
  ].join('\n')

  const response = await anthropic.messages.create({
    model: CLASSIFIER_MODEL,
    max_tokens: 1024,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const block = response.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('empty response from Anthropic')
  const raw = block.text

  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/g, '')
    .trim()

  let parsed: any
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`invalid JSON from Anthropic: ${raw.slice(0, 200)}`)
  }

  const area = typeof parsed.area === 'string' && parsed.area.length > 0 ? parsed.area : null
  return {
    match: !!parsed.match,
    score: typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 0,
    area,
    business_unit_id: area ? (buNameToId.get(area) ?? null) : null,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  }
}
