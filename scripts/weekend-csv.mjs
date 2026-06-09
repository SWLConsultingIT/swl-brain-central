// Genera CSV con TODOS los jobs del fin de semana (5-8 jun) y su clasificación final.
// Post-rescate: los 11 jobs rescatados ya están con su clasificación nueva.

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const WINDOW_START = '2026-06-05T00:00:00Z'
const WINDOW_END = '2026-06-08T23:59:59Z'

// Cargar TODOS los jobs en la ventana
const { data: jobs, count } = await supabase
  .from('jobs')
  .select('id, title, link, ticket, hourly_average, country, industry, status, classifier_match, classifier_score, classifier_area, classifier_reason, classifier_run_at, cover_letter_draft, cover_letter_generated_at, created_at, business_unit_id', { count: 'exact' })
  .gte('created_at', WINDOW_START)
  .lte('created_at', WINDOW_END)
  .order('created_at', { ascending: false })

const { data: bus } = await supabase.from('business_units').select('id, name')
const buNames = Object.fromEntries((bus||[]).map(b => [b.id, b.name]))

console.log(`Total jobs encontrados: ${count}`)

// CSV escape helper
const csvEsc = v => {
  if (v == null) return ''
  const s = String(v).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

const headers = [
  'QUALIFIED',          // 1 — adelante para escanear
  'Por qué',            // 2 — razón del classifier
  'Score',              // 3 — 0-100
  'Área (BU)',          // 4 — qué BU
  'Cover Letter',       // 5 — YES/NO si se generó
  'Título',             // 6 — el job
  'Hourly $/h',         // 7 — rate
  'Ticket $',           // 8 — efectivo
  'País',               // 9
  'Industria',          // 10
  'Link Upwork',        // 11 — URL directo
  'Status kanban',      // 12 — discarded/proposal_drafted/etc
  'Fecha ingreso',      // 13 — cuándo entró
  'Cover generated at', // 14
  'Classifier run at',  // 15
]

const rows = [headers.join(',')]

// Ordenar: primero los QUALIFIED YES con cover letter (mejor score arriba),
// luego YES sin cover, luego NO por score descendente, luego sin clasificar.
const sorted = [...(jobs || [])].sort((a, b) => {
  const aQ = a.classifier_match === true
  const bQ = b.classifier_match === true
  if (aQ !== bQ) return aQ ? -1 : 1                                  // qualified primero
  const aC = !!a.cover_letter_draft
  const bC = !!b.cover_letter_draft
  if (aQ && aC !== bC) return aC ? -1 : 1                            // con cover letter arriba
  return (b.classifier_score ?? -1) - (a.classifier_score ?? -1)     // score desc
})

for (const j of sorted) {
  const hourly = j.hourly_average ? `$${j.hourly_average}` : ''
  const ticket = j.ticket ? `$${j.ticket}` : ''
  const isQual = j.classifier_match === true
  const score = j.classifier_score != null ? j.classifier_score : ''
  const buName = j.business_unit_id ? buNames[j.business_unit_id] || '' : (j.classifier_area || '')
  const hasCover = j.cover_letter_draft ? 'YES' : 'NO'
  const qualifiedLabel = j.classifier_match === true
    ? 'YES'
    : (j.classifier_match === false ? 'NO' : 'NOT CLASSIFIED')

  const row = [
    csvEsc(qualifiedLabel),
    csvEsc(j.classifier_reason),
    csvEsc(score),
    csvEsc(buName),
    csvEsc(isQual ? hasCover : ''),
    csvEsc(j.title),
    csvEsc(hourly),
    csvEsc(ticket),
    csvEsc(j.country),
    csvEsc(j.industry),
    csvEsc(j.link),
    csvEsc(j.status),
    csvEsc(j.created_at.slice(0, 16).replace('T', ' ')),
    csvEsc(j.cover_letter_generated_at ? j.cover_letter_generated_at.slice(0, 16).replace('T', ' ') : ''),
    csvEsc(j.classifier_run_at ? j.classifier_run_at.slice(0, 16).replace('T', ' ') : ''),
  ]
  rows.push(row.join(','))
}

const filename = `jobs_finde_2026-06-05_a_08.csv`
writeFileSync(filename, rows.join('\n'))

console.log(`\n✅ CSV generado: ${filename}`)
console.log(`   Filas: ${rows.length - 1} jobs + 1 header`)
console.log(`   Tamaño: ${(rows.join('\n').length / 1024).toFixed(1)} KB`)

// Stats finales
const total = jobs?.length || 0
const matches = (jobs||[]).filter(j => j.classifier_match)
const coverLetters = (jobs||[]).filter(j => j.cover_letter_draft)
const classified = (jobs||[]).filter(j => j.classifier_run_at)
const notClassified = total - classified.length
const noMatch = classified.length - matches.length

console.log(`\n╔═══════════════════════════════════════════════════════════════╗`)
console.log(`║                  CUÁNTOS CALIFICARON                           ║`)
console.log(`╠═══════════════════════════════════════════════════════════════╣`)
console.log(`║  📥 TOTAL ingestados:           ${String(total).padStart(4)}                          ║`)
console.log(`║  ✅ QUALIFIED (match=YES):      ${String(matches.length).padStart(4)}  (${((matches.length/total)*100).toFixed(1)}% del total)        ║`)
console.log(`║  ✉️  Cover letters generadas:    ${String(coverLetters.length).padStart(4)}                          ║`)
console.log(`║  ❌ No qualified (match=NO):    ${String(noMatch).padStart(4)}                          ║`)
console.log(`║  🚪 No clasificados (ticket <$40): ${String(notClassified).padStart(4)}                       ║`)
console.log(`╚═══════════════════════════════════════════════════════════════╝\n`)

console.log(`📊 Por BU (matches):`)
const buCount = {}
for (const j of matches) {
  const buName = j.business_unit_id ? buNames[j.business_unit_id] || j.classifier_area : (j.classifier_area || 'NULL')
  buCount[buName] = (buCount[buName] || 0) + 1
}
for (const [bu, c] of Object.entries(buCount).sort((a,b) => b[1] - a[1])) {
  console.log(`   ${bu.padEnd(45)} ${c}`)
}
