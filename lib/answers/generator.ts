// Generator de respuestas a screening questions de Upwork.
// Reusa el MISMO contexto del cover letter:
//   - Master Prompt SWL (voz/reglas anti-clichés/etc.)
//   - BU card (List of Services + scopes + decision_logic)
//   - Precedente: últimas Sent en la misma BU con su cover letter real
//   - Job details
//
// Diferencia: en vez de generar 1 cover letter de 300-350 palabras,
// devuelve un array de respuestas cortas (1-3 oraciones cada una)
// a las screening questions del job.
//
// Modelo: OpenAI gpt-4o-mini (rápido y barato, ~$0.001 por job).
// Prompt caching: activado para amortizar el master prompt en llamadas frecuentes.

import OpenAI from 'openai'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'

export const ANSWER_MODEL = 'gpt-4o-mini'

const PRECEDENT_LIMIT = 3
const MAX_PRECEDENT_CL_CHARS = 400

const __dirname = dirname(fileURLToPath(import.meta.url))
// Reusamos el master prompt del cover letter — misma voz SWL, mismas reglas.
const MASTER_PROMPT = readFileSync(
  join(__dirname, '..', 'cover-letter', 'master-prompt.md'),
  'utf8',
)

export type GeneratorJob = {
  title: string
  description: string | null
  ticket: number | null
  industry: string | null
  country: string | null
  duration: string | null
}

export type ScreeningQuestion = {
  question: string
  sequenceNumber: number
}

export type AnswerResult = {
  question: string
  sequenceNumber: number
  answer: string
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

export type GenerateAnswersResult = {
  answers: AnswerResult[]
  model: string
  precedent_count: number
}

const ANSWER_INSTRUCTIONS = `
---

## Task for this call: ANSWER SCREENING QUESTIONS (not a cover letter)

The client has attached N screening questions to this Upwork job. Your job is to
generate ONE answer per question, that Juan/SWL will then send via the Upwork
proposal form.

### Rules for each answer

- **Length: 1-3 sentences. Hard cap at 4.** Upwork truncates long answers.
- **Voice & tone: identical to the Master Prompt above.** Use "I" for Juan personally
  and "we" for the SWL team when describing collective work.
- **Honesty: if the question asks about specific experience/credentials/tools, only
  claim what's evidenced in the BU card or precedent.** If Juan doesn't have direct
  experience with X, say something like: "I haven't worked with X directly, but my
  team at SWL has, and I can leverage their experience for this engagement."
  Never invent credentials or projects.
- **Reference precedent only when relevant.** If the question is generic ("describe a
  similar project"), pick the most relevant precedent. If it's specific ("rate your
  English"), answer directly.
- **No AI-cliché openers** (see Master Prompt list — same rules).
- **No em-dashes "—" or hyphens between concepts.** Same as Master Prompt.
- **No signature.** These are inline answers, not letters.

### Output format

Return a single JSON object with this exact shape:

{
  "answers": [
    { "sequenceNumber": 0, "answer": "..." },
    { "sequenceNumber": 1, "answer": "..." }
  ]
}

The "sequenceNumber" MUST match the input question's sequenceNumber.
No additional keys, no markdown, no commentary outside the JSON.
`

export async function generateAnswers(
  job: GeneratorJob,
  businessUnitId: string,
  questions: ScreeningQuestion[],
  supabase: SupabaseClient,
  openai: OpenAI,
): Promise<GenerateAnswersResult> {
  if (!questions || questions.length === 0) {
    return { answers: [], model: ANSWER_MODEL, precedent_count: 0 }
  }

  // 1. BU card (mismo loader que cover letter)
  const { data: bu, error: buErr } = await supabase
    .from('business_units')
    .select('id, name, description, scopes, keywords, good_fit_signals, decision_logic')
    .eq('id', businessUnitId)
    .single<BUCard>()

  if (buErr || !bu) throw new Error(`load BU failed: ${buErr?.message ?? 'not found'}`)

  // 2. Precedente (mismo loader que cover letter, pero limit más chico — 3 en vez de 5
  //    porque las respuestas son cortas y no necesitan tanto contexto)
  const { data: precedentRaw } = await supabase
    .from('proposals')
    .select('job_title, cover_letter, sent_date')
    .eq('status', 'Sent')
    .eq('business_unit_id', businessUnitId)
    .not('job_title', 'is', null)
    .order('sent_date', { ascending: false })
    .limit(PRECEDENT_LIMIT)

  const precedent: Precedent[] = (precedentRaw as Precedent[]) ?? []

  const precedentBlock = precedent
    .map((p, i) => {
      const header = `### Precedent ${i + 1}: ${p.job_title}`
      const cl = p.cover_letter
        ? `\n${p.cover_letter.slice(0, MAX_PRECEDENT_CL_CHARS)}${
            p.cover_letter.length > MAX_PRECEDENT_CL_CHARS ? '…' : ''
          }`
        : '\n(no cover letter text on record)'
      return header + cl
    })
    .join('\n\n')

  // 3. System prompt: master prompt + BU + precedente + instrucciones de respuestas
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
      ? `### Recent Sent precedent\n\n${precedentBlock}`
      : `### Recent Sent precedent\n(none in this BU yet)`,
    ANSWER_INSTRUCTIONS,
  ].join('\n')

  // 4. User prompt: el job + las preguntas a responder
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
    ``,
    `## SCREENING QUESTIONS (answer all)`,
    ``,
    JSON.stringify(
      questions.map((q) => ({ sequenceNumber: q.sequenceNumber, question: q.question })),
      null,
      2,
    ),
  ].join('\n')

  // 5. Llamada OpenAI con response_format JSON para garantizar shape parseable
  const response = await openai.chat.completions.create({
    model: ANSWER_MODEL,
    temperature: 0.4,
    max_tokens: 800,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })

  const text = response.choices[0]?.message?.content?.trim()
  if (!text) throw new Error('empty response from OpenAI')

  let parsed: { answers?: Array<{ sequenceNumber: number; answer: string }> }
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`OpenAI returned invalid JSON: ${text.slice(0, 300)}`)
  }

  if (!parsed.answers || !Array.isArray(parsed.answers)) {
    throw new Error(`OpenAI response missing "answers" array: ${text.slice(0, 300)}`)
  }

  // 6. Mergear con las preguntas originales (para preservar el question text)
  const answers: AnswerResult[] = questions.map((q) => {
    const match = parsed.answers!.find((a) => a.sequenceNumber === q.sequenceNumber)
    return {
      question: q.question,
      sequenceNumber: q.sequenceNumber,
      answer: match?.answer?.trim() ?? '',
    }
  })

  return {
    answers,
    model: ANSWER_MODEL,
    precedent_count: precedent.length,
  }
}
