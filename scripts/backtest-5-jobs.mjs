// Backtest: clasifica 5 jobs históricos (que hoy salieron con score=0 / reason vacío)
// usando el MISMO system prompt + user prompt que el workflow n8n + el parser ROBUSTO.
// Resultado: ver si el bug ya está arreglado.
//
// NO escribe a Supabase. Solo lee + llama Anthropic + muestra en consola.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_KEY) { console.error('Falta ANTHROPIC_API_KEY'); process.exit(1) }

// ─── 1. Cargar 8 BU cards activas ───
const { data: bus } = await supabase
  .from('business_units')
  .select('id, name, description, scopes, keywords, good_fit_signals, red_flags, decision_logic')
  .eq('is_active', true)

console.log(`📚 Cargué ${bus?.length} BU cards`)

// ─── 2. Cargar precedent (igual que n8n) ───
const { data: precedent } = await supabase
  .from('proposals')
  .select('business_unit_id, job_title')
  .eq('status', 'Sent')
  .not('business_unit_id', 'is', null)
  .order('sent_date', { ascending: false })
  .limit(160)

console.log(`📖 Cargué ${precedent?.length} proposals de precedent`)

// ─── 3. Buscar los 5 jobs por title (los que vimos con score=0) ───
const targetTitles = [
  'U.S. CPA needed for Delaware C-Corp tax consultation',
  'Fractional CMO for U.S. Nonprofit / Health-Tech Project',
  'Head of SAAS Sales in Healthcare industry',
  'WireGuard VPN Access Restriction',
  'Marketing Foundation Lead / Systems Architect',
]

const jobs = []
for (const title of targetTitles) {
  const { data } = await supabase
    .from('jobs')
    .select('id, title, description, industry, hourly_average')
    .ilike('title', `%${title.slice(0, 40)}%`)
    .eq('status', 'discarded')
    .order('created_at', { ascending: false })
    .limit(1)
  if (data?.[0]) jobs.push(data[0])
}
console.log(`🎯 Encontré ${jobs.length} jobs para testear\n`)

// ─── 4. Construir system prompt (idéntico al n8n) ───
const precByBU = new Map()
for (const p of precedent || []) {
  if (!p.business_unit_id) continue
  if (!precByBU.has(p.business_unit_id)) precByBU.set(p.business_unit_id, [])
  if (precByBU.get(p.business_unit_id).length < 5) precByBU.get(p.business_unit_id).push(p.job_title)
}

const buSection = bus.map(bu => {
  const prec = precByBU.get(bu.id) || []
  return [
    `## ${bu.name}`,
    bu.description,
    `Scopes: ${(bu.scopes || []).join(' · ')}`,
    `Keywords: ${(bu.keywords || []).slice(0, 30).join(', ')}`,
    `Good fit: ${bu.good_fit_signals || ''}`,
    `Red flags: ${bu.red_flags || ''}`,
    `Decision: ${bu.decision_logic || ''}`,
    prec.length > 0 ? `Recent Sent precedent: ${prec.join(' · ')}` : 'Recent Sent precedent: (none yet)',
  ].join('\n')
}).join('\n\n---\n\n')

const HARD_EXCLUSIONS = [
  'pure graphic design only',
  'physical product manufacturing',
  'legal services',
  'medical services',
  'academic writing, grant writing for non-profits',
  'civil/mechanical/electrical/aerospace/hardware engineering',
  'embedded/firmware/DSP/radar/RF/IoT hardware',
  'COACHING/TRAINING ROLES (STRICT): Coach, Trainer, Mentor, Enablement, Workshop, Bootcamp - strict',
  'MICROSOFT ECOSYSTEM (STRICT): M365, Dynamics, SharePoint, Power Platform admin. EXCEPTION: Power BI dashboarding OK',
  'SAP INTERNAL. EXCEPTION: external API pulls OK',
  'PR/MEDIA RELATIONS (STRICT)',
  'CPA TACTICAL (STRICT): US tax, IRS, Delaware C-Corp, SBA, bookkeeping',
  'TOOL-SPECIFIC (STRICT): Framer, Figma (ANY mention), Klaviyo operator, Etsy listing, Smartsheet, Shopify theme, Wix',
  'ONE-TIME TACTICAL',
  'BROKERAGE/NETWORKING without technical scope',
  'RECRUITING, CRYPTO/WEB3, 3D/VFX',
]

const buNameToId = {}
for (const bu of bus) buNameToId[bu.name] = bu.id

const systemPrompt = [
  'You are a senior qualification analyst for SWL Consulting.',
  '',
  `Below are SWL's 8 business units.`,
  '',
  buSection,
  '',
  '---',
  '',
  'HARD EXCLUSIONS (match=false, score<=10):',
  ...HARD_EXCLUSIONS.map(e => `- ${e}`),
  '',
  'BU-SPECIFIC: Power BI→PM&BI; n8n/Zapier→SI/AI&A; Meta/Google Ads→M&B; Fractional CFO/COO→F&A; Brand+strategy→M&B',
  '',
  'NEVER mention ticket/budget/hourly rate in reason. If scope fits and no hard exclusion, match=true.',
  '',
  'Return ONLY valid JSON: { "match": bool, "score": 0-100, "area": <BU name>|null, "reason": "..." }',
].join('\n')

console.log(`📐 System prompt: ${systemPrompt.length} chars (~${Math.round(systemPrompt.length/4)} tokens)\n`)

// ─── 5. Parser robusto (idéntico al fix de Pris) ───
function extractJSON(text) {
  if (!text) return null
  let s = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0, end = -1
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end < 0) return null
  const candidate = s.slice(start, end + 1)
  try { return JSON.parse(candidate) } catch { return null }
}

// ─── 6. Clasificar los 5 jobs ───
let totalCost = 0

for (const job of jobs) {
  const userPrompt = [
    `Job title: ${job.title}`,
    `Industry: ${job.industry || 'n/a'}`,
    '',
    'Description:',
    job.description || '(no description)',
  ].join('\n')

  console.log('═════════════════════════════════════════')
  console.log(`🎯 JOB: ${job.title?.slice(0, 70)}`)
  console.log('═════════════════════════════════════════')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  const ai = await res.json()
  if (!res.ok) {
    console.log(`❌ HTTP ${res.status}`, ai)
    continue
  }

  const inputTok = ai.usage?.input_tokens || 0
  const outputTok = ai.usage?.output_tokens || 0
  const callCost = (inputTok * 0.80 / 1_000_000) + (outputTok * 4 / 1_000_000)
  totalCost += callCost

  const rawText = ai.content?.[0]?.text || ''
  console.log(`📊 tokens: input=${inputTok} output=${outputTok}  costo=$${callCost.toFixed(4)}`)
  console.log(`📨 raw response (preview): ${rawText.slice(0, 200)}${rawText.length>200?'...':''}\n`)

  const parsed = extractJSON(rawText)
  if (!parsed) {
    console.log(`❌ PARSE FAILED  stop_reason=${ai.stop_reason}`)
    continue
  }

  const matchStr = parsed.match ? '✅ MATCH' : '❌ no match'
  console.log(`${matchStr}  score=${parsed.score}  area=${parsed.area || 'NULL'}`)
  console.log(`💬 reason: ${parsed.reason || '(vacío)'}`)
  console.log()
}

console.log('═════════════════════════════════════════')
console.log(`💰 COSTO TOTAL: $${totalCost.toFixed(4)}`)
console.log('═════════════════════════════════════════')
