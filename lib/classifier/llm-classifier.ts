// LLM classifier — segundo gate después del ticket filter.
// Inputs: job + 8 BU cards de Supabase + precedente histórico (proposals Sent).
// Output: match (bool), score (0-100), area (BU name | null), reason.

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

// Haiku 4.5 para clasificación: 3x más barato que Sonnet ($0.004 vs $0.013/call),
// suficiente precisión para elegir 1 BU + score. Cover letter sigue en Sonnet
// (lib/cover-letter/generator.ts) — calidad del texto importa para ganar el job.
export const CLASSIFIER_MODEL = 'claude-haiku-4-5'

// Hard exclusions removed (decisión dirección 2026-06-19): el classifier ya no
// descarta jobs por dominio/scope. Toda calificación pasa por el scoring de fit.

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
    `HARD EXCLUSIONS: NONE. Do not reject any job on domain or scope grounds — evaluate every job purely on fit with the 8 business units. If scope fits, match=true.`,
    ``,
    `CRITICAL — TICKET POLICY:`,
    `Jobs reach you ONLY after passing the official SQL filter: ticket ≥ $40 USD, posted ≤ 48h, ≤ 50 existing proposals. These thresholds are validated by SWL leadership. DO NOT apply your own intuition about "engagement minimums", "below market rates", or "budget insufficient". Even $40-$200 tickets are viable for SWL — don't reject them on budget grounds. Your job is scope fit, not budget.`,
    ``,
    `CRITICAL — AREA ASSIGNMENT:`,
    `Whenever the job scope plausibly fits one of the 8 BUs, set "area" to that BU name (exactly as listed above), EVEN IF you set match=false for other reasons. Only return area=null when the scope clearly fits NONE of the 8 BUs.`,
    ``,
    `Decision protocol:`,
    `1. Read job title + description.`,
    `2. Identify which BU (if any) fits → set "area" accordingly.`,
    `3. Weigh good-fit signals, red flags, decision logic, and precedent.`,
    `4. Decide match=true when there is a clear scope fit + realistic precedent.`,
    `5. Assign score: 0=clear miss · 30=weak/no precedent · 60=plausible · 85+=strong fit with precedent.`,
    `6. reason ≤ 25 words, concrete, cite signals or precedent. NEVER cite ticket/budget as the reason — that's not your call.`,
    ``,
    `Return ONLY valid JSON, no markdown fences, no prose: { "match": bool, "score": 0-100, "area": <one of the BU names above> | null, "reason": "..." }`,
  ].join('\n')

  // 5. Llamada al LLM — INTENCIONALMENTE NO le pasamos el ticket.
  //    El ticket lo decide el SQL filter upstream ($40 USD) y el override rule
  //    downstream (ticket≥$40 + area). El LLM solo decide scope fit.
  //    Si le mostramos el ticket, inventa thresholds ("$60 es bajo para CFO")
  //    aunque el prompt le diga que no. Best defense: que no vea el número.
  const userPrompt = [
    `Job title: ${job.title}`,
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
  let match = !!parsed.match
  let score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 0
  let reason = typeof parsed.reason === 'string' ? parsed.reason : ''

  // ── Capa 7: budget-reject override ───────────────────────────────────
  // Si el LLM rechazó pero la razón menciona presupuesto/ticket Y el area
  // está asignada Y el ticket pasa el threshold real ($40), revertir a
  // match=true. El LLM no tiene autoridad sobre el ticket — eso ya lo
  // decidió el SQL filter.
  const BUDGET_REJECT_PHRASES = [
    /below\s+(swl|the|its)?\s*(minimum|engagement|threshold|viable)/i,
    /budget\s+(insufficient|non.?viable|prohibitive|incompatible|too\s+low)/i,
    /ticket\s+(too\s+low|below|insufficient|non.?viable)/i,
    /far\s+below/i,
    /too\s+low\s+for/i,
    /unrealistic\s+budget/i,
    /severely\s+underpriced/i,
    /engagement\s+minimum/i,
    /\$\d+\s+(USD)?\s*(is|far)\s+below/i,
  ]
  const ticketViable = (job.ticket ?? 0) >= 40
  if (!match && area && ticketViable && BUDGET_REJECT_PHRASES.some(re => re.test(reason))) {
    match = true
    reason = `[layer7: budget-reject override] originally: ${reason}`
    if (score < 30) score = 30
  }

  return {
    match,
    score,
    area,
    business_unit_id: area ? (buNameToId.get(area) ?? null) : null,
    reason,
  }
}
