// Cover letter generator — Paso 7
// Genera una propuesta personalizada para un job qualified usando:
//   - El job (title, description, industry, ticket)
//   - La BU card (scope, decision_logic, keywords)
//   - Precedente histórico: hasta N proposals Sent en la misma BU con su
//     cover_letter real (cuando exista) — sino solo títulos.
//
// El generator NO escribe a Supabase. Eso es responsabilidad del route.

import OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'

export const COVER_LETTER_MODEL = 'gpt-4o-mini'

const PRECEDENT_LIMIT = 5
const MAX_PRECEDENT_CL_CHARS = 600 // truncamos cartas históricas para no inflar prompt

export type GeneratorJob = {
  title: string
  description: string | null
  ticket: number | null
  industry: string | null
  country: string | null
  duration: string | null
}

type BUCard = {
  id: string
  name: string
  description: string
  scopes: string[]
  keywords: string[]
  good_fit_signals: string
  decision_logic: string
}

type Precedent = {
  job_title: string
  cover_letter: string | null
  sent_date: string | null
}

export type CoverLetterResult = {
  cover_letter: string
  model: string
  precedent_count: number
  precedent_with_cl: number
}

export async function generateCoverLetter(
  job: GeneratorJob,
  businessUnitId: string,
  supabase: SupabaseClient,
  openai: OpenAI,
): Promise<CoverLetterResult> {
  // 1. Cargar BU card
  const { data: bu, error: buErr } = await supabase
    .from('business_units')
    .select('id, name, description, scopes, keywords, good_fit_signals, decision_logic')
    .eq('id', businessUnitId)
    .single<BUCard>()

  if (buErr || !bu) throw new Error(`load BU failed: ${buErr?.message ?? 'not found'}`)

  // 2. Cargar precedente: últimas Sent en la misma BU
  const { data: precedentRaw } = await supabase
    .from('proposals')
    .select('job_title, cover_letter, sent_date')
    .eq('status', 'Sent')
    .eq('business_unit_id', businessUnitId)
    .not('job_title', 'is', null)
    .order('sent_date', { ascending: false })
    .limit(PRECEDENT_LIMIT)

  const precedent: Precedent[] = (precedentRaw as Precedent[]) ?? []
  const withCL = precedent.filter(p => !!p.cover_letter).length

  // 3. Bloque de precedente para el prompt
  const precedentBlock = precedent
    .map((p, i) => {
      const header = `### Precedent ${i + 1}: ${p.job_title}`
      const cl = p.cover_letter
        ? `\n${p.cover_letter.slice(0, MAX_PRECEDENT_CL_CHARS)}${p.cover_letter.length > MAX_PRECEDENT_CL_CHARS ? '…' : ''}`
        : '\n(no cover letter text on record — use as title-level inspiration only)'
      return header + cl
    })
    .join('\n\n')

  // 4. System prompt — la "voz SWL" + instrucciones de estructura
  const systemPrompt = [
    `You are SWL Consulting's senior proposal writer. Generate a tailored Upwork cover letter for the job below.`,
    ``,
    `About SWL Consulting:`,
    `- 120+ projects delivered across SaaS, Real Estate, Healthcare, Home Services, E-commerce, Private Equity, Financial Services.`,
    `- Tagline: "Bigger Businesses, Stronger Teams."`,
    `- Philosophy: "Ideas created by people. Systems powered by AI."`,
    ``,
    `Voice & tone:`,
    `- Professional but warm. First-person plural ("we", "our team").`,
    `- Concrete: name specific tools, methods, deliverables. No generic claims.`,
    `- Brief: 150-220 words MAX. Clients skim — don't waste their time.`,
    `- No filler ("I am writing to express my interest…"), no over-promising ("guaranteed results"), no emojis.`,
    `- Structure: (1) Hook — 1-2 sentences acknowledging the client's specific need. (2) Approach — 2-3 sentences on how SWL would tackle it, citing relevant tools/methods. (3) Proof — 1-2 sentences referencing similar precedent or SWL's track record. (4) CTA — invite to a short call.`,
    ``,
    `This proposal belongs to SWL's "${bu.name}" business unit:`,
    bu.description,
    ``,
    `Relevant scopes: ${bu.scopes.join(' · ')}`,
    `Relevant tools/keywords: ${bu.keywords.slice(0, 25).join(', ')}`,
    `Good-fit signals: ${bu.good_fit_signals}`,
    `Decision logic: ${bu.decision_logic}`,
    ``,
    precedent.length > 0
      ? `## Recent Sent precedent (${precedent.length} similar jobs SWL applied to${withCL > 0 ? `, ${withCL} with cover letter text` : ''}):\n\n${precedentBlock}`
      : `## Recent Sent precedent\n(none in this BU yet)`,
    ``,
    `Output: ONLY the cover letter text (Markdown). No preamble, no "Here's a draft:", no closing tags.`,
  ].join('\n')

  // 5. User prompt — el job concreto
  const userPrompt = [
    `Job title: ${job.title}`,
    `Industry: ${job.industry ?? 'n/a'}`,
    `Client location: ${job.country ?? 'n/a'}`,
    `Duration: ${job.duration ?? 'n/a'}`,
    `Ticket: ${job.ticket != null ? '$' + job.ticket + ' USD' : 'n/a'}`,
    ``,
    `Description:`,
    job.description ?? '(no description)',
  ].join('\n')

  // 6. Llamada al LLM
  const completion = await openai.chat.completions.create({
    model: COVER_LETTER_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.6, // un poco de variedad pero sin alucinar
    max_tokens: 500,
  })

  const text = completion.choices[0]?.message?.content?.trim()
  if (!text) throw new Error('empty response from OpenAI')

  return {
    cover_letter: text,
    model: COVER_LETTER_MODEL,
    precedent_count: precedent.length,
    precedent_with_cl: withCL,
  }
}
