// Curador BU en TypeScript — análogo al flujo n8n pero corre local con Anthropic
// y full control.
//
// Qué hace:
//   1. Lee las 8 BU cards de Supabase (system prompt context).
//   2. Lee proposals con sent_date >= 2026-04-02 (últimos 60 días).
//   3. Para cada proposal hace UNA llamada a Sonnet 4.5:
//      - System prompt: descripción de SWL + las 8 BU cards.
//      - User prompt: job_title + status + keyword Notion + ai_summary + tools.
//   4. Parsea el JSON { business_unit_name, new_scope, new_keywords, confidence }.
//   5. Loggea a consola + persiste a out/curator-run-<timestamp>.jsonl.
//   6. NO escribe a Supabase (read-only para validar primero).
//
// Run:
//   node --env-file=.env.local supabase/scripts/curator-bu.ts            # primeros 20 (validación)
//   node --env-file=.env.local supabase/scripts/curator-bu.ts --all      # las 518
//   node --env-file=.env.local supabase/scripts/curator-bu.ts --limit 50 # custom

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ── Args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const allFlag = argv.includes('--all')
const limitArg = argv.includes('--limit') ? parseInt(argv[argv.indexOf('--limit') + 1] ?? '', 10) : NaN
const offsetArg = argv.includes('--offset') ? parseInt(argv[argv.indexOf('--offset') + 1] ?? '', 10) : NaN
const skipDoneFlag = argv.includes('--skip-done')
const LIMIT = allFlag ? Number.MAX_SAFE_INTEGER : Number.isFinite(limitArg) ? limitArg : 20
const OFFSET = Number.isFinite(offsetArg) ? offsetArg : 0
const SINCE = '2026-04-02' // últimos 60 días

// Set de proposal_ids ya procesados en JSONLs anteriores (cuando --skip-done).
const alreadyDone = new Set<string>()
if (skipDoneFlag) {
  try {
    const files = readdirSync('out').filter(f => f.startsWith('curator-run-') && f.endsWith('.jsonl'))
    for (const f of files) {
      const content = readFileSync(join('out', f), 'utf8')
      for (const line of content.split('\n').filter(Boolean)) {
        try {
          const row = JSON.parse(line)
          if (row.proposal_id) alreadyDone.add(row.proposal_id)
        } catch {}
      }
    }
    console.log(`Saltando ${alreadyDone.size} proposals ya procesados en JSONLs previos.`)
  } catch (e) {
    console.log(`(--skip-done sin out/ existente — skipping nothing)`)
  }
}

const MODEL = 'claude-sonnet-4-5'
const CONCURRENCY = 4 // paralelo razonable sin pegarle al rate limit

const BU_NAMES = [
  'AI & Automation',
  'Business Operations & Back-Office',
  'Digital Experience & Product Development',
  'Finance & Accounting',
  'Marketing & Brand',
  'Project Management & BI',
  'Sales & Customer Success',
  'System Integrations',
] as const
type BUName = (typeof BU_NAMES)[number]

// ── Setup ──────────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY
if (!url || !secret) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY missing')
if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY missing in .env.local')

const supabase = createClient(url, secret, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: anthropicKey })

const runTs = new Date().toISOString().replace(/[:.]/g, '-')
const outDir = 'out'
mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, `curator-run-${runTs}.jsonl`)
writeFileSync(outFile, '')

// ── 1. Cargar BU cards ─────────────────────────────────────────────────
console.log('Cargando 8 BU cards...')
const { data: bus, error: buErr } = await supabase
  .from('business_units')
  .select('id, name, description, scopes, keywords, good_fit_signals, red_flags, decision_logic')
  .eq('is_active', true)
  .order('name')

if (buErr || !bus) throw new Error('cannot load BUs: ' + (buErr?.message ?? 'empty'))

const buNameToId = new Map<string, string>()
const buSection = bus
  .map((bu: any) => {
    buNameToId.set(bu.name, bu.id)
    return [
      `## ${bu.name}`,
      bu.description,
      `Scopes: ${(bu.scopes ?? []).join(' · ')}`,
      `Keywords (existing): ${(bu.keywords ?? []).slice(0, 30).join(', ')}`,
      `Good fit: ${bu.good_fit_signals ?? '(n/a)'}`,
      `Red flags: ${bu.red_flags ?? '(n/a)'}`,
      `Decision: ${bu.decision_logic ?? '(n/a)'}`,
    ].join('\n')
  })
  .join('\n\n---\n\n')

console.log(`  ${bus.length} BU cards cargadas.`)

// ── 2. Cargar proposals últimos 60 días ────────────────────────────────
console.log(`\nCargando proposals con sent_date >= ${SINCE}...`)
// Cuando --skip-done, fetcheamos pool amplio y filtramos los ya hechos hasta
// llenar LIMIT. Si no, range directo con OFFSET/LIMIT.
let proposals: any[] = []
if (skipDoneFlag) {
  const pool = Math.max(LIMIT + alreadyDone.size + 50, 500)
  const { data, error } = await supabase
    .from('proposals')
    .select('id, upwork_id, job_title, status, keyword, ai_summary, tools, business_unit_id')
    .gte('sent_date', SINCE)
    .not('job_title', 'is', null)
    .order('sent_date', { ascending: false })
    .order('id', { ascending: true })
    .range(0, pool - 1)
  if (error || !data) throw new Error('cannot load proposals: ' + (error?.message ?? 'empty'))
  proposals = (data as any[]).filter(p => !alreadyDone.has(p.id)).slice(0, LIMIT)
} else {
  const rangeEnd =
    LIMIT === Number.MAX_SAFE_INTEGER ? OFFSET + 9999 : OFFSET + LIMIT - 1
  const { data, error } = await supabase
    .from('proposals')
    .select('id, upwork_id, job_title, status, keyword, ai_summary, tools, business_unit_id')
    .gte('sent_date', SINCE)
    .not('job_title', 'is', null)
    .order('sent_date', { ascending: false })
    .order('id', { ascending: true })
    .range(OFFSET, rangeEnd)
  if (error || !data) throw new Error('cannot load proposals: ' + (error?.message ?? 'empty'))
  proposals = data as any[]
}
console.log(`  ${proposals.length} proposals cargadas.`)

// ── 3. Prompt builder ──────────────────────────────────────────────────
const systemPrompt = [
  `You are the curator of "Brain Central", SWL Consulting's internal system that classifies historical Upwork proposals into SWL's business units (BUs) and extracts enriched scope + keywords from them.`,
  ``,
  `Below are SWL's 8 BUs with their current scope, keywords, and decision criteria. Use them as the universe of valid classifications.`,
  ``,
  buSection,
  ``,
  `---`,
  ``,
  `For each proposal, do 4 things:`,
  `1. business_unit_name: pick exactly ONE BU name from the 8 above that best fits the job. If clearly none, use null.`,
  `2. new_scope: 1 sentence summarizing the concrete scope of THIS job in terms of what SWL would deliver (e.g. "Fractional CFO support for SaaS fundraising with model review and investor reporting"). Specific, not generic.`,
  `3. new_keywords: 3-6 specific technical/scope keywords drawn FROM THIS JOB (e.g. "ARR forecast", "investor reporting", "Series A model"). NOT generic words like "consulting" or "business". NO bleed-over from unrelated domains.`,
  `4. confidence: float 0.0-1.0 — how sure you are this classification is correct.`,
  ``,
  `OUTPUT FORMAT (strict):`,
  `Respond with ONLY a JSON object. No markdown fences, no prose before or after, no "output" wrapper.`,
  `Exact shape:`,
  `{"business_unit_name":"<one of the 8 names or null>","new_scope":"<sentence>","new_keywords":["kw1","kw2","kw3"],"confidence":0.XX}`,
].join('\n')

function buildUserPrompt(p: any): string {
  const toolsText = Array.isArray(p.tools) ? p.tools.join(' · ') : (p.tools ?? '(n/a)')
  return [
    `Job title: ${p.job_title}`,
    `Status (SWL pipeline outcome): ${p.status ?? 'n/a'}`,
    `Notion keyword (origin scrape tag): ${p.keyword ?? 'n/a'}`,
    `AI summary (when available): ${p.ai_summary ?? '(none)'}`,
    `Tools/categories: ${toolsText}`,
  ].join('\n')
}

type CuratorResult = {
  proposal_id: string
  upwork_id: string | null
  job_title: string
  status: string | null
  previous_bu_id: string | null
  bu_name: BUName | null
  bu_id: string | null
  new_scope: string | null
  new_keywords: string[]
  confidence: number | null
  would_skip: boolean
  parse_error: string | null
  raw: string | null
  elapsed_ms: number
}

async function classifyOne(p: any): Promise<CuratorResult> {
  const t0 = Date.now()
  let raw = ''
  let parseError: string | null = null
  let buName: BUName | null = null
  let newScope: string | null = null
  let newKeywords: string[] = []
  let confidence: number | null = null

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: buildUserPrompt(p) }],
    })
    const block = response.content.find(b => b.type === 'text')
    raw = block && block.type === 'text' ? block.text : ''

    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/g, '')
      .trim()

    const parsed = JSON.parse(cleaned)
    const candidateName = typeof parsed.business_unit_name === 'string' ? parsed.business_unit_name : null
    buName = candidateName && (BU_NAMES as readonly string[]).includes(candidateName) ? (candidateName as BUName) : null
    newScope = typeof parsed.new_scope === 'string' ? parsed.new_scope : null
    newKeywords = Array.isArray(parsed.new_keywords) ? parsed.new_keywords.filter((k: any) => typeof k === 'string') : []
    confidence = typeof parsed.confidence === 'number' ? parsed.confidence : null
  } catch (e) {
    parseError = (e as Error).message
  }

  const elapsed = Date.now() - t0
  return {
    proposal_id: p.id,
    upwork_id: p.upwork_id,
    job_title: p.job_title,
    status: p.status,
    previous_bu_id: p.business_unit_id,
    bu_name: buName,
    bu_id: buName ? (buNameToId.get(buName) ?? null) : null,
    new_scope: newScope,
    new_keywords: newKeywords,
    confidence,
    would_skip: (confidence ?? 0) < 0.7,
    parse_error: parseError,
    raw: parseError ? raw.slice(0, 500) : null,
    elapsed_ms: elapsed,
  }
}

// ── 4. Run con concurrency limitada ────────────────────────────────────
console.log(`\nClasificando ${proposals.length} proposals con ${MODEL} (concurrency=${CONCURRENCY})...\n`)

let processed = 0
let errors = 0
let skipped = 0
const buCounts = new Map<string, number>()
const t0 = Date.now()

async function runBatch(items: any[]): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const p = queue.shift()
      if (!p) break
      const result = await classifyOne(p)
      appendFileSync(outFile, JSON.stringify(result) + '\n')
      processed++
      if (result.parse_error) errors++
      if (result.would_skip) skipped++
      if (result.bu_name) buCounts.set(result.bu_name, (buCounts.get(result.bu_name) ?? 0) + 1)

      const tag = result.parse_error
        ? `✗ ${result.parse_error.slice(0, 40)}`
        : result.would_skip
          ? `~ skip (${result.confidence?.toFixed(2)})`
          : `✓ ${result.bu_name} (${result.confidence?.toFixed(2)})`
      console.log(`  [${processed}/${proposals.length}] ${tag} — ${result.job_title.slice(0, 60)}`)
    }
  })
  await Promise.all(workers)
}

await runBatch(proposals)

// ── 5. Resumen ─────────────────────────────────────────────────────────
const elapsedTotal = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`\n✓ Done en ${elapsedTotal}s`)
console.log(`  procesados: ${processed}`)
console.log(`  asignados:  ${processed - errors - skipped}`)
console.log(`  skip<0.7:   ${skipped}`)
console.log(`  errores:    ${errors}`)
console.log(`\nBreakdown por BU:`)
for (const [name, n] of [...buCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${name}`)
}
console.log(`\nOutput JSONL: ${outFile}`)
