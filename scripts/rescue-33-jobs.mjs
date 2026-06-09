// Rescue script — re-clasifica los 33 jobs perdidos por bug + genera cover letters para los matches
//
// Diseño robusto:
// 1. Cost cap: HARD STOP a $0.55 (margen seguro vs $0.60 autorizado por Pris)
// 2. Idempotencia: no re-procesa si ya tiene cover_letter_draft válido
// 3. Tolerancia a fallas: si 1 job falla, sigue con los siguientes (no aborta todo)
// 4. Parser robusto: el mismo que aplicamos en n8n (no puede repetirse el bug)
// 5. Logging detallado: por cada job, qué pasó (match/no, score, area, cost acumulado)
// 6. Update atómico a Supabase con TODOS los fields esperados
// 7. Reporte final + HTML

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, readFileSync } from 'node:fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_KEY) { console.error('Falta ANTHROPIC_API_KEY'); process.exit(1) }

const HARD_COST_CAP = 0.55  // Stop antes de llegar a $0.60 autorizado

let totalCost = 0
const checkBudget = (op) => {
  if (totalCost >= HARD_COST_CAP) {
    console.log(`\n🛑 HARD COST CAP alcanzado ($${totalCost.toFixed(4)} >= $${HARD_COST_CAP}). Aborto antes de "${op}".`)
    return false
  }
  return true
}

// ─── 1. Cargar los jobs rotos por bug ───
console.log('🔍 Buscando jobs rotos por bug (score=0, reason="", classifier_run_at no nulo)...')
const { data: brokenJobs } = await supabase
  .from('jobs')
  .select('id, title, description, industry, country, duration, hourly_average, ticket, status, classifier_run_at, classifier_reason, classifier_score, cover_letter_draft, business_unit_id')
  .gte('created_at', '2026-06-05T00:00:00Z')
  .lte('created_at', '2026-06-08T23:59:59Z')
  .not('classifier_run_at', 'is', null)
  .eq('classifier_score', 0)
  .order('created_at')

const buggyJobs = (brokenJobs || []).filter(j => !j.classifier_reason || j.classifier_reason.trim() === '')

console.log(`📋 Encontré ${buggyJobs.length} jobs rotos por bug`)

// Filter out any that already have a valid cover letter (idempotencia)
const toProcess = buggyJobs.filter(j => !j.cover_letter_draft || j.cover_letter_draft.length < 50)
console.log(`🎯 A re-procesar: ${toProcess.length} jobs (skip ${buggyJobs.length - toProcess.length} con cover letter ya OK)`)

if (toProcess.length === 0) {
  console.log('Nada que hacer. Salgo.')
  process.exit(0)
}

// ─── 2. Cargar BU cards + precedent (igual que n8n) ───
console.log('📚 Cargando 8 BU cards + 160 precedent...')
const { data: bus } = await supabase
  .from('business_units')
  .select('id, name, description, scopes, keywords, good_fit_signals, red_flags, decision_logic')
  .eq('is_active', true)
const { data: precedent } = await supabase
  .from('proposals')
  .select('business_unit_id, job_title')
  .eq('status', 'Sent')
  .not('business_unit_id', 'is', null)
  .order('sent_date', { ascending: false })
  .limit(160)

const buById = Object.fromEntries(bus.map(b => [b.id, b]))
const buNameToId = Object.fromEntries(bus.map(b => [b.name, b.id]))
const precByBU = new Map()
for (const p of precedent || []) {
  if (!p.business_unit_id) continue
  if (!precByBU.has(p.business_unit_id)) precByBU.set(p.business_unit_id, [])
  if (precByBU.get(p.business_unit_id).length < 5) precByBU.get(p.business_unit_id).push(p.job_title)
}

// ─── 3. System prompt classifier (idéntico al de n8n) ───
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
  'pure graphic design only', 'physical product manufacturing', 'legal services',
  'medical services', 'academic writing, grant writing for non-profits',
  'civil/mechanical/electrical/aerospace/hardware engineering',
  'embedded/firmware/DSP/radar/RF/IoT hardware',
  'COACHING/TRAINING ROLES (STRICT): Coach, Trainer, Mentor, Enablement, Workshop, Bootcamp - strict',
  'MICROSOFT ECOSYSTEM (STRICT): M365, Dynamics, SharePoint, Power Platform admin. EXCEPTION: Power BI dashboarding OK',
  'SAP INTERNAL. EXCEPTION: external API pulls OK', 'PR/MEDIA RELATIONS (STRICT)',
  'CPA TACTICAL (STRICT): US tax, IRS, Delaware C-Corp, SBA, bookkeeping',
  'TOOL-SPECIFIC (STRICT): Framer, Figma (ANY mention), Klaviyo operator, Etsy listing, Smartsheet, Shopify theme, Wix',
  'ONE-TIME TACTICAL', 'BROKERAGE/NETWORKING without technical scope',
  'RECRUITING, CRYPTO/WEB3, 3D/VFX',
]

const classifierSystemPrompt = [
  'You are a senior qualification analyst for SWL Consulting.',
  '', `Below are SWL's 8 business units.`, '', buSection, '', '---', '',
  'HARD EXCLUSIONS (match=false, score<=10):',
  ...HARD_EXCLUSIONS.map(e => `- ${e}`), '',
  'BU-SPECIFIC: Power BI→PM&BI; n8n/Zapier→SI/AI&A; Meta/Google Ads→M&B; Fractional CFO/COO→F&A; Brand+strategy→M&B', '',
  'NEVER mention ticket/budget/hourly rate in reason. If scope fits and no hard exclusion, match=true.', '',
  'Return ONLY valid JSON: { "match": bool, "score": 0-100, "area": <BU name>|null, "reason": "..." }',
].join('\n')

// ─── 4. Parser robusto (idéntico al fix de n8n) ───
function extractJSON(text) {
  if (!text) return null
  let s = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0, end = -1
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end < 0) return null
  try { return JSON.parse(s.slice(start, end + 1)) } catch { return null }
}

function parseClassifier(rawText, stopReason) {
  const parsed = extractJSON(rawText)
  if (!parsed) {
    return {
      match: false, score: 0, area: null, businessUnitId: null,
      reason: `parse_failed: stop_reason=${stopReason}, raw="${(rawText||'').slice(0, 150)}"`,
      newStatus: 'discarded_review'
    }
  }
  const area = (typeof parsed.area === 'string' && parsed.area.length > 0) ? parsed.area : null
  let score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 0
  let match = !!parsed.match
  let reason = (typeof parsed.reason === 'string' && parsed.reason.trim().length > 0)
    ? parsed.reason.trim()
    : `no_reason_returned: match=${match} score=${score} area=${area}`
  const businessUnitId = area ? (buNameToId[area] || null) : null

  // Forbidden-phrase rescue
  const FORBIDDEN = [/\bticket\b/i, /\bbudget\b/i, /\bunderpriced\b/i, /\bfar\s+below\b/i, /\btoo\s+low\b/i, /\bengagement\s+minimum/i, /\bhourly\s+rate/i, /\$[0-9]+\s*(USD|hour|hr)/i]
  if (!match && area && FORBIDDEN.some(re => re.test(reason))) {
    match = true
    reason = '[forbidden-phrase rescue] ' + reason.slice(0, 120)
    if (score < 50) score = 50
  }

  return { match, score, area, businessUnitId, reason, newStatus: match ? 'qualified' : 'discarded' }
}

// ─── 5. Master prompt para cover letter (lee del repo) ───
const masterPromptMd = readFileSync('lib/cover-letter/master-prompt.md', 'utf8')

// ─── 6. Loop principal ───
const results = []

for (let i = 0; i < toProcess.length; i++) {
  const job = toProcess[i]
  console.log(`\n─── ${i+1}/${toProcess.length}: ${(job.title||'').slice(0,70)} ───`)

  // === Cost gate antes de cada classifier call
  if (!checkBudget(`classify job ${i+1}`)) break

  // 1) Re-clasificar con Haiku
  const userPrompt = `Job title: ${job.title}\nIndustry: ${job.industry || 'n/a'}\n\nDescription:\n${job.description || '(no description)'}`

  let classifierRes
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5', max_tokens: 1024,
        system: classifierSystemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    const ai = await res.json()
    if (!res.ok) {
      console.log(`  ❌ Classifier HTTP ${res.status}:`, ai.error?.message || ai)
      results.push({ job, error: `classifier_${res.status}`, cost: 0 })
      continue
    }
    const inputTok = ai.usage?.input_tokens || 0
    const outputTok = ai.usage?.output_tokens || 0
    const callCost = (inputTok * 0.80 / 1_000_000) + (outputTok * 4 / 1_000_000)
    totalCost += callCost
    const rawText = ai.content?.[0]?.text || ''
    classifierRes = parseClassifier(rawText, ai.stop_reason)
    classifierRes.cost = callCost
    console.log(`  🤖 Classifier: ${classifierRes.match ? '✅ MATCH' : '❌ no match'} score=${classifierRes.score} area=${classifierRes.area || 'NULL'} ($${callCost.toFixed(4)})`)
  } catch (e) {
    console.log(`  ❌ Classifier error:`, e.message)
    results.push({ job, error: e.message, cost: 0 })
    continue
  }

  // 2) Si match, generar cover letter con Sonnet
  let coverLetter = null
  let coverCost = 0
  if (classifierRes.match && classifierRes.businessUnitId) {
    if (!checkBudget(`generate cover letter for job ${i+1}`)) {
      console.log(`  ⏭️  Skip cover letter (budget cap)`)
    } else {
      const bu = buById[classifierRes.businessUnitId]
      // Cargar precedent específico de la BU
      const { data: bpData } = await supabase
        .from('proposals')
        .select('job_title, cover_letter')
        .eq('status', 'Sent')
        .eq('business_unit_id', classifierRes.businessUnitId)
        .order('sent_date', { ascending: false })
        .limit(5)
      const MAX = 600
      const precedentBlock = (bpData || []).map((p, idx) => {
        const cl = p.cover_letter ? '\n' + p.cover_letter.slice(0, MAX) + (p.cover_letter.length > MAX ? '…' : '') : '\n(no text)'
        return `### Precedent ${idx+1}: ${p.job_title}` + cl
      }).join('\n\n')

      const coverSystemPrompt = [
        masterPromptMd, '', '---', '',
        `## SWL Business Unit context: ${bu.name}`,
        bu.description || '',
        `Scopes: ${(bu.scopes || []).join(' · ')}`,
        `Keywords: ${(bu.keywords || []).slice(0, 25).join(', ')}`,
        `Good-fit signals: ${bu.good_fit_signals || ''}`,
        '',
        bpData?.length ? `## Recent Sent precedent\n\n${precedentBlock}` : '## Recent Sent precedent\n(none yet)',
      ].join('\n')
      const coverUserPrompt = [
        '## JOB POST',
        `Title: ${job.title}`,
        `Industry: ${job.industry || 'n/a'}`,
        `Client location: ${job.country || 'n/a'}`,
        `Duration: ${job.duration || 'n/a'}`,
        `Hourly rate: $${job.hourly_average}/h`,
        '', 'Description:', job.description || '(no description)',
      ].join('\n')

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5', max_tokens: 1500,
            system: coverSystemPrompt,
            messages: [{ role: 'user', content: coverUserPrompt }],
          }),
        })
        const ai = await res.json()
        if (!res.ok) {
          console.log(`  ⚠️  Cover letter HTTP ${res.status}:`, ai.error?.message || ai)
        } else {
          const inputTok = ai.usage?.input_tokens || 0
          const outputTok = ai.usage?.output_tokens || 0
          coverCost = (inputTok * 3 / 1_000_000) + (outputTok * 15 / 1_000_000)
          totalCost += coverCost
          coverLetter = ai.content?.[0]?.text || null
          console.log(`  ✉️  Cover letter generada (${coverLetter?.length} chars, $${coverCost.toFixed(4)})`)
        }
      } catch (e) {
        console.log(`  ⚠️  Cover letter error:`, e.message)
      }
    }
  }

  // 3) Update Supabase
  const updateFields = {
    status: classifierRes.newStatus,
    classifier_match: classifierRes.match,
    classifier_score: classifierRes.score,
    classifier_area: classifierRes.area,
    classifier_reason: classifierRes.reason,
    classifier_run_at: new Date().toISOString(),
    business_unit_id: classifierRes.businessUnitId,
  }
  if (coverLetter) {
    updateFields.cover_letter_draft = coverLetter
    updateFields.cover_letter_generated_at = new Date().toISOString()
    updateFields.status = 'proposal_drafted'
  }

  const { error: updErr } = await supabase.from('jobs').update(updateFields).eq('id', job.id)
  if (updErr) {
    console.log(`  ❌ Supabase update failed:`, updErr.message)
    results.push({ job, classifier: classifierRes, coverLetter, coverCost, updError: updErr.message })
  } else {
    console.log(`  💾 Supabase actualizado (status=${updateFields.status})`)
    results.push({ job, classifier: classifierRes, coverLetter, coverCost })
  }

  console.log(`  📊 Acumulado: $${totalCost.toFixed(4)} / $${HARD_COST_CAP}`)
}

// ─── 7. Reporte final ───
console.log('\n\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║                    RESCATE COMPLETADO                          ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

const processed = results.length
const matches = results.filter(r => r.classifier?.match)
const coversGenerated = results.filter(r => r.coverLetter)
const errors = results.filter(r => r.error || r.updError)

console.log(`📊 Jobs procesados:           ${processed} / ${toProcess.length}`)
console.log(`✅ Matches:                   ${matches.length}`)
console.log(`✉️  Cover letters generadas:  ${coversGenerated.length}`)
console.log(`❌ Errores:                   ${errors.length}`)
console.log(`💰 Costo total real:          $${totalCost.toFixed(4)} (cap era $${HARD_COST_CAP})`)

console.log(`\n📋 BU coverage (matches):`)
const buCount = {}
for (const r of matches) {
  const area = r.classifier.area
  buCount[area] = (buCount[area] || 0) + 1
}
for (const [area, c] of Object.entries(buCount).sort((a,b) => b[1] - a[1])) {
  console.log(`   ${area.padEnd(45)} ${c}`)
}

// HTML con resultados
const esc = s => (s||'').toString().replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rescate de 33 jobs perdidos</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:1100px;margin:20px auto;padding:0 20px;color:#111;background:#fafafa}
  h1{font-size:22px}
  .summary{background:white;border:1px solid #ddd;border-radius:8px;padding:15px;margin:20px 0;display:flex;gap:25px;flex-wrap:wrap}
  .stat b{font-size:22px;display:block;color:#0066cc}
  .job{background:white;border:1px solid #e5e7eb;border-radius:6px;padding:15px;margin:10px 0;border-left:4px solid #ccc}
  .job.match{border-left-color:#10b981}
  .job.cover{border-left-color:#3b82f6}
  .title{font-size:15px;font-weight:600;margin:0 0 5px}
  .meta{font-size:12px;color:#666;margin:5px 0}
  .reason{background:#fffbeb;padding:8px;border-radius:4px;font-size:13px;color:#78350f;margin-top:5px}
  details{margin-top:8px;font-size:13px}
  summary{cursor:pointer;color:#0066cc}
  pre{background:#f3f4f6;padding:15px;border-radius:6px;white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.55;margin-top:5px}
</style></head><body>
<h1>🎯 Rescate de jobs perdidos por bug</h1>
<div class="summary">
  <div class="stat"><b>${processed}</b>Procesados</div>
  <div class="stat"><b>${matches.length}</b>Matches</div>
  <div class="stat"><b>${coversGenerated.length}</b>Cover letters</div>
  <div class="stat"><b>$${totalCost.toFixed(3)}</b>Costo real</div>
</div>
${results.map(r => {
  const c = r.classifier
  if (r.error) return `<div class="job"><p class="title">⚠️ ${esc(r.job.title)}</p><p class="reason">Error: ${esc(r.error)}</p></div>`
  const cls = c?.match ? (r.coverLetter ? 'match cover' : 'match') : ''
  return `<div class="job ${cls}">
    <p class="title">${c?.match ? '✅' : '❌'} ${esc(r.job.title)}</p>
    <div class="meta">Ticket: $${r.job.ticket || r.job.hourly_average || '?'} · Score: ${c?.score} · Area: ${esc(c?.area || 'NULL')}</div>
    <div class="reason"><b>Reason:</b> ${esc(c?.reason)}</div>
    ${r.coverLetter ? `<details><summary>📄 Ver cover letter (${r.coverLetter.length} chars)</summary><pre>${esc(r.coverLetter)}</pre></details>` : ''}
  </div>`
}).join('\n')}
</body></html>`
writeFileSync('rescue-results.html', html)
console.log(`\n📄 Reporte HTML: rescue-results.html`)
