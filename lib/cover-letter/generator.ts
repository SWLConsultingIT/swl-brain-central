// Cover letter generator — Paso 7
// Genera una propuesta personalizada para un job qualified usando:
//   - El job (title, description, industry, ticket, country, duration)
//   - La BU card (scope, decision_logic, keywords) = "List of Services" para esa BU
//   - Precedente histórico: hasta N proposals Sent en la misma BU con su
//     cover_letter real (cuando exista) — sino solo títulos.
//   - El Master Prompt fijo (./master-prompt.md) — estructura + voz + autoridad.
//
// El generator NO escribe a Supabase. Eso es responsabilidad del route/script.

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'

export const COVER_LETTER_MODEL = 'claude-sonnet-4-5'

const PRECEDENT_LIMIT = 5
const MAX_PRECEDENT_CL_CHARS = 600

// Master prompt cargado en build-time (no depende del cwd del runtime).
const __dirname = dirname(fileURLToPath(import.meta.url))
const MASTER_PROMPT = readFileSync(join(__dirname, 'master-prompt.md'), 'utf8')

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
  anthropic: Anthropic,
): Promise<CoverLetterResult> {
  // 1. Cargar BU card (sirve como "List of Services" para esta BU)
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

  const precedentBlock = precedent
    .map((p, i) => {
      const header = `### Precedent ${i + 1}: ${p.job_title}`
      const cl = p.cover_letter
        ? `\n${p.cover_letter.slice(0, MAX_PRECEDENT_CL_CHARS)}${p.cover_letter.length > MAX_PRECEDENT_CL_CHARS ? '…' : ''}`
        : '\n(no cover letter text on record — use as title-level inspiration only)'
      return header + cl
    })
    .join('\n\n')

  // 3. System prompt: master prompt verbatim + contexto BU + precedente
  const systemPrompt = [
    MASTER_PROMPT,
    ``,
    `---`,
    ``,
    `## Context for this specific job`,
    ``,
    `### LIST OF SERVICES (the SWL "${bu.name}" business unit)`,
    bu.description,
    ``,
    `Relevant scopes: ${bu.scopes.join(' · ')}`,
    `Relevant tools/keywords: ${bu.keywords.slice(0, 25).join(', ')}`,
    `Good-fit signals: ${bu.good_fit_signals}`,
    `Decision logic: ${bu.decision_logic}`,
    ``,
    precedent.length > 0
      ? `### Recent Sent precedent (${precedent.length} similar SWL applications${
          withCL > 0 ? `, ${withCL} with full cover letter text` : ''
        })\n\nUse these as reference for tone, depth, and what worked in similar pitches. Do not copy verbatim.\n\n${precedentBlock}`
      : `### Recent Sent precedent\n(none in this BU yet — rely on the master prompt structure)`,
    ``,
    `### Specific Comments for the Job Post`,
    `(none provided)`,
  ].join('\n')

  // 4. User prompt: el job concreto
  const userPrompt = [
    `## JOB POST`,
    ``,
    `Title: ${job.title}`,
    `Industry: ${job.industry ?? 'n/a'}`,
    `Client location: ${job.country ?? 'n/a'}`,
    `Duration: ${job.duration ?? 'n/a'}`,
    `Ticket: ${job.ticket != null ? '$' + job.ticket + ' USD' : 'n/a'}`,
    ``,
    `Description:`,
    job.description ?? '(no description)',
  ].join('\n')

  // 5. Llamada al LLM
  // max_tokens más alto porque ahora apuntamos a 300-350 palabras (~500-600 tokens).
  const response = await anthropic.messages.create({
    model: COVER_LETTER_MODEL,
    max_tokens: 1200,
    temperature: 0.5,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const block = response.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('empty response from Anthropic')
  const text = block.text.trim()

  return {
    cover_letter: text,
    model: COVER_LETTER_MODEL,
    precedent_count: precedent.length,
    precedent_with_cl: withCL,
  }
}
