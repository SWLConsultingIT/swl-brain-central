// Test: genera 1 cover letter usando el nuevo master prompt para 1 job real
// que ya tenía cover letter generada antes (con el prompt viejo).
// Muestra ambas lado a lado para comparar.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

// Cargar el master prompt nuevo del archivo del repo
const masterPromptMd = readFileSync('lib/cover-letter/master-prompt.md', 'utf8')

// Buscar 1 job que ya tenga cover_letter_draft (de los 5 del viernes)
const { data: jobs } = await supabase
  .from('jobs')
  .select('id, title, description, industry, country, duration, hourly_average, ticket, business_unit_id, cover_letter_draft, classifier_score, classifier_area')
  .not('cover_letter_draft', 'is', null)
  .eq('classifier_match', true)
  .order('cover_letter_generated_at', { ascending: false })
  .limit(1)

if (!jobs?.length) {
  console.error('No hay jobs con cover_letter_draft existente para comparar')
  process.exit(1)
}

const job = jobs[0]
console.log(`📄 Job a testear: "${job.title}"`)
console.log(`   BU: ${job.classifier_area} · score: ${job.classifier_score}\n`)

// Cargar BU card
const { data: bu } = await supabase
  .from('business_units')
  .select('id, name, description, scopes, keywords, good_fit_signals, decision_logic')
  .eq('id', job.business_unit_id)
  .single()

// Cargar precedent (5 últimas proposals Sent de esa BU)
const { data: precedent } = await supabase
  .from('proposals')
  .select('job_title, cover_letter')
  .eq('status', 'Sent')
  .eq('business_unit_id', job.business_unit_id)
  .not('job_title', 'is', null)
  .order('sent_date', { ascending: false })
  .limit(5)

const MAX = 600
const precedentBlock = (precedent || []).map((p, i) => {
  const cl = p.cover_letter ? '\n' + p.cover_letter.slice(0, MAX) + (p.cover_letter.length > MAX ? '…' : '') : '\n(no text)'
  return `### Precedent ${i+1}: ${p.job_title}` + cl
}).join('\n\n')

// Armar el system prompt nuevo (mismo formato que n8n usa el master prompt)
const systemPrompt = [
  masterPromptMd,
  '',
  '---',
  '',
  `## SWL Business Unit context: ${bu.name || 'unknown'}`,
  bu.description || '',
  `Scopes: ${(bu.scopes || []).join(' · ')}`,
  `Keywords: ${(bu.keywords || []).slice(0, 25).join(', ')}`,
  `Good-fit signals: ${bu.good_fit_signals || ''}`,
  '',
  precedent?.length ? `## Recent Sent precedent (reference for tone/depth, do not copy)\n\n${precedentBlock}` : '## Recent Sent precedent\n(none yet)',
].join('\n')

const userPrompt = [
  '## JOB POST',
  `Title: ${job.title}`,
  `Industry: ${job.industry || 'n/a'}`,
  `Client location: ${job.country || 'n/a'}`,
  `Duration: ${job.duration || 'n/a'}`,
  `Hourly rate: $${job.hourly_average}/h`,
  '',
  'Description:',
  job.description || '(no description)',
].join('\n')

console.log(`📐 System prompt: ${systemPrompt.length} chars (~${Math.round(systemPrompt.length/4)} tokens)`)
console.log(`📝 User prompt:   ${userPrompt.length} chars (~${Math.round(userPrompt.length/4)} tokens)\n`)

console.log('🤖 Llamando a Sonnet 4.5...\n')
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  }),
})

const ai = await res.json()
if (!res.ok) {
  console.error('❌ ERROR:', ai)
  process.exit(1)
}

const newCover = ai.content?.[0]?.text || ''
const inputTok = ai.usage?.input_tokens || 0
const outputTok = ai.usage?.output_tokens || 0
const cost = (inputTok * 3 / 1_000_000) + (outputTok * 15 / 1_000_000)

console.log('═══════════════════════════════════════════════════════════════')
console.log('  COMPARACIÓN — Cover Letter VIEJA vs NUEVA')
console.log('═══════════════════════════════════════════════════════════════')
console.log(`📊 Tokens: input=${inputTok} output=${outputTok}  Costo: $${cost.toFixed(4)}\n`)

// Guardar comparación en HTML
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cover Letter Comparison</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:1400px;margin:30px auto;padding:0 20px;color:#111}
  h1{font-size:20px}
  .meta{color:#666;font-size:13px;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  .col{border:1px solid #ddd;border-radius:8px;padding:20px;background:#fff}
  .col h2{margin-top:0;font-size:16px;padding-bottom:10px;border-bottom:1px solid #eee}
  .vieja h2{color:#999}
  .nueva h2{color:#0066cc}
  pre{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.55;margin:0}
</style></head><body>
<h1>Cover Letter — VIEJA vs NUEVA prompt</h1>
<p class="meta"><b>Job:</b> ${job.title}<br>
<b>BU:</b> ${job.classifier_area} · <b>Score:</b> ${job.classifier_score}<br>
<b>Costo del test:</b> $${cost.toFixed(4)} (Sonnet 4.5, ${inputTok+outputTok} tokens)</p>
<div class="grid">
  <div class="col vieja">
    <h2>VIEJA (prompt anterior, generada el viernes 5)</h2>
    <pre>${(job.cover_letter_draft||'').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</pre>
  </div>
  <div class="col nueva">
    <h2>NUEVA (prompt actualizado, generada ahora)</h2>
    <pre>${newCover.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</pre>
  </div>
</div>
</body></html>`
writeFileSync('cover-letter-comparison.html', html)

// Mostrar en consola también
console.log('━━━━━━━━━━ VIEJA (viernes 5) ━━━━━━━━━━')
console.log((job.cover_letter_draft || '').slice(0, 800))
console.log('\n━━━━━━━━━━ NUEVA (con prompt actualizado) ━━━━━━━━━━')
console.log(newCover.slice(0, 1500))

console.log('\n\n📄 Comparación bonita en: cover-letter-comparison.html')
console.log(`💰 Costo de este test: $${cost.toFixed(4)}`)
