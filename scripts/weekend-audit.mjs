// Audit completo del fin de semana 5-8 jun 2026
// Lista TODOS los jobs y separa:
// - Buggy classifications (reason vacío = clasificación rota, hay que re-correr)
// - Legitimate classifications (con reason real)
// - Cover letters generadas (con texto para validar manual)

import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'node:fs/promises'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const WINDOW_START = '2026-06-05T00:00:00Z'
const WINDOW_END   = '2026-06-08T23:59:59Z'

console.log(`═══════════════════════════════════════════════════════════════`)
console.log(`  AUDIT DEL FIN DE SEMANA — ${WINDOW_START.slice(0,10)} → ${WINDOW_END.slice(0,10)}`)
console.log(`═══════════════════════════════════════════════════════════════\n`)

// ── 1. Cargar TODOS los jobs de la ventana
const { data: allJobs, count: totalCount } = await supabase
  .from('jobs')
  .select('id, title, status, classifier_match, classifier_score, classifier_area, classifier_reason, classifier_run_at, cover_letter_draft, cover_letter_generated_at, ticket, hourly_average, created_at, business_unit_id', { count: 'exact' })
  .gte('created_at', WINDOW_START)
  .lte('created_at', WINDOW_END)
  .order('created_at')

const { data: bus } = await supabase.from('business_units').select('id, name')
const buNames = Object.fromEntries((bus||[]).map(b => [b.id, b.name]))

console.log(`📥 TOTAL JOBS INGESTADOS: ${totalCount}\n`)

// ── 2. Por día
const byDay = {}
for (const j of allJobs || []) {
  const day = j.created_at.slice(0, 10)
  if (!byDay[day]) byDay[day] = { total: 0, byStatus: {} }
  byDay[day].total++
  byDay[day].byStatus[j.status] = (byDay[day].byStatus[j.status] || 0) + 1
}

console.log(`📅 INGRESOS POR DÍA:`)
for (const [d, s] of Object.entries(byDay).sort()) {
  const breakdown = Object.entries(s.byStatus).map(([st, c]) => `${st}:${c}`).join(' · ')
  console.log(`   ${d}: ${s.total} jobs  (${breakdown})`)
}

// ── 3. Separar buggy vs legitimate classifications
const classified = (allJobs || []).filter(j => j.classifier_run_at)
const buggyClassifications = classified.filter(j =>
  (!j.classifier_reason || j.classifier_reason.trim() === '') &&
  j.classifier_score === 0
)
const legitClassifications = classified.filter(j =>
  j.classifier_reason && j.classifier_reason.trim().length > 0
)
const matches = classified.filter(j => j.classifier_match)
const coverLetters = (allJobs || []).filter(j => j.cover_letter_draft)

console.log(`\n🔍 CLASIFICACIONES EN LA VENTANA: ${classified.length}`)
console.log(`   ✅ Con razón real (legítimas):    ${legitClassifications.length}`)
console.log(`   ❌ Con razón vacía (BUG):          ${buggyClassifications.length}`)
console.log(`   🎯 match=true (cualifican):       ${matches.length}`)
console.log(`   ✉️  Cover letters generadas:       ${coverLetters.length}`)

// ── 4. JOBS POSIBLEMENTE PERDIDOS (descartados con bug) — son los rescatables
console.log(`\n═══════════════════════════════════════════════════════════════`)
console.log(`  🚨 JOBS PERDIDOS POR BUG (a re-clasificar con el fix)`)
console.log(`═══════════════════════════════════════════════════════════════`)
console.log(`Estos ${buggyClassifications.length} jobs entraron, pasaron filtro de ticket, pero el classifier`)
console.log(`devolvió score=0/reason="" por el bug que arreglamos hoy.\n`)

for (const j of buggyClassifications) {
  const ticket = j.ticket ? `$${j.ticket}` : (j.hourly_average ? `$${j.hourly_average}/h` : '—')
  console.log(`   [${j.created_at.slice(0,10)}] ${ticket.padEnd(10)} "${(j.title||'').slice(0,75)}"`)
}

// ── 5. CLASIFICACIONES LEGÍTIMAS — ¿son acertadas?
console.log(`\n═══════════════════════════════════════════════════════════════`)
console.log(`  ✅ CLASIFICACIONES LEGÍTIMAS (${legitClassifications.length}) — revisá si fueron acertadas`)
console.log(`═══════════════════════════════════════════════════════════════\n`)

const grouped = { matches: [], discards: [] }
for (const j of legitClassifications) {
  (j.classifier_match ? grouped.matches : grouped.discards).push(j)
}

console.log(`🎯 MATCHES (${grouped.matches.length}):`)
for (const j of grouped.matches) {
  console.log(`   score=${j.classifier_score} · ${j.classifier_area || 'NULL'}`)
  console.log(`   "${(j.title||'').slice(0,75)}"  ($${j.ticket || '?'})`)
  console.log(`   ↳ ${(j.classifier_reason || '').slice(0,140)}`)
  console.log()
}

console.log(`\n❌ DESCARTES (${grouped.discards.length}) — solo muestro top 10:`)
for (const j of grouped.discards.slice(0, 10)) {
  console.log(`   score=${j.classifier_score} · "${(j.title||'').slice(0,60)}"`)
  console.log(`   ↳ ${(j.classifier_reason || '').slice(0,120)}`)
  console.log()
}

// ── 6. COVER LETTERS — escribir a archivo HTML para revisar bonito
console.log(`\n═══════════════════════════════════════════════════════════════`)
console.log(`  ✉️  COVER LETTERS GENERADAS (${coverLetters.length}) — para validar manual`)
console.log(`═══════════════════════════════════════════════════════════════`)

const html = [
  '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cover Letters — Audit Fin de Semana</title>',
  '<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:30px auto;padding:0 20px;color:#111}',
  '.job{border:1px solid #ddd;border-radius:8px;padding:20px;margin:20px 0;background:#fff}',
  '.title{font-size:18px;font-weight:600;margin:0 0 10px}',
  '.meta{color:#666;font-size:13px;margin-bottom:15px}',
  '.cover{background:#f7f7f7;padding:15px;border-radius:6px;white-space:pre-wrap;font-size:14px;line-height:1.5}',
  '.reason{background:#fffbea;padding:10px;border-radius:6px;font-size:13px;color:#666;margin-bottom:10px}',
  '</style></head><body>',
  `<h1>Cover Letters — Audit ${WINDOW_START.slice(0,10)} → ${WINDOW_END.slice(0,10)}</h1>`,
  `<p>${coverLetters.length} cover letters generadas. Revisalas y marca cuáles te gustan / cuáles no.</p>`,
]

for (let i = 0; i < coverLetters.length; i++) {
  const j = coverLetters[i]
  const bu = buNames[j.business_unit_id] || '—'
  const date = j.cover_letter_generated_at ? j.cover_letter_generated_at.slice(0,10) : '?'
  console.log(`\n   ━━━ ${i+1}/${coverLetters.length}: "${(j.title||'').slice(0,70)}" ━━━`)
  console.log(`   BU: ${bu} · score=${j.classifier_score} · generated=${date}`)
  console.log(`   ${(j.cover_letter_draft||'').slice(0,300)}...`)

  html.push(`<div class="job">`)
  html.push(`<p class="title">${i+1}. ${j.title || '(sin título)'}</p>`)
  html.push(`<p class="meta">BU: ${bu} · score: ${j.classifier_score} · ticket: $${j.ticket || '?'} · generated: ${date}</p>`)
  html.push(`<div class="reason"><b>Reason classifier:</b> ${j.classifier_reason || '(sin reason)'}</div>`)
  html.push(`<div class="cover">${(j.cover_letter_draft || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</div>`)
  html.push(`</div>`)
}

html.push('</body></html>')
await writeFile('weekend-audit-cover-letters.html', html.join('\n'))

console.log(`\n\n📄 Cover letters formateadas en: weekend-audit-cover-letters.html`)
console.log(`   Abrila para revisarlas todas bonito en el browser.`)

// ── 7. Resumen ejecutivo
console.log(`\n═══════════════════════════════════════════════════════════════`)
console.log(`  📋 RESUMEN EJECUTIVO`)
console.log(`═══════════════════════════════════════════════════════════════`)
console.log(`   Total ingestados:                ${totalCount}`)
console.log(`   Pasaron filtro ticket:           ${classified.length} (${((classified.length/totalCount)*100).toFixed(0)}%)`)
console.log(`   Clasificaciones ROTAS por bug:   ${buggyClassifications.length} ⚠️  re-clasificables`)
console.log(`   Clasificaciones legítimas:       ${legitClassifications.length}`)
console.log(`   Matches (qualified):             ${matches.length}`)
console.log(`   Cover letters generadas:         ${coverLetters.length}`)
console.log(``)
console.log(`💡 Si re-clasificamos los ${buggyClassifications.length} jobs perdidos por bug,`)
console.log(`   probable extra ${Math.round(buggyClassifications.length * 0.35)} matches + cover letters.`)
console.log(`   Costo estimado de re-clasificación: ~$${(buggyClassifications.length * 0.008).toFixed(2)}`)
