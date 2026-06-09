import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// 1. ¿Cuántos quedan en prequalified colgados? (Debería ser 0)
const { count: stillStuck } = await supabase
  .from('jobs')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'prequalified')
  .is('classifier_run_at', null)

console.log(`⏳ Jobs prequalified colgados (esperamos 0): ${stillStuck}`)

// 2. ¿Cuántos jobs tienen classifier_run_at en los últimos 10 minutos? (debería ser ≥9)
const tenMinAgo = new Date(Date.now() - 600000).toISOString()
const { data: recent } = await supabase
  .from('jobs')
  .select('id, title, status, classifier_match, classifier_score, classifier_area, classifier_reason, cover_letter_draft, ticket')
  .gte('classifier_run_at', tenMinAgo)
  .order('classifier_run_at', { ascending: false })

console.log(`\n🤖 Jobs clasificados en los últimos 10 min: ${recent?.length || 0}\n`)

let matches = 0
let coverLetters = 0
for (const j of recent || []) {
  const match = j.classifier_match ? '✅ MATCH' : '❌ no match'
  const area = j.classifier_area || '—'
  const score = j.classifier_score ?? '—'
  const hasCover = j.cover_letter_draft ? '✉️ cover OK' : '   '
  if (j.classifier_match) matches++
  if (j.cover_letter_draft) coverLetters++

  console.log(`${match}  score=${String(score).padStart(3)}  ${area.padEnd(38)}  ${hasCover}`)
  console.log(`   "${(j.title || '').slice(0, 75)}"  ($${j.ticket || '?'})`)
  console.log(`   status=${j.status}`)
  console.log(`   reason: ${(j.classifier_reason || '').slice(0, 110)}`)
  console.log()
}

console.log(`\n═══════════════════════════════`)
console.log(`📊 RESUMEN`)
console.log(`═══════════════════════════════`)
console.log(`   Total clasificados:      ${recent?.length || 0}`)
console.log(`   match=true:              ${matches}`)
console.log(`   Con cover letter ya:     ${coverLetters}`)
console.log(`   Stuck restantes:         ${stillStuck}`)

// 3. Status agregado de TODO hoy
const { data: today } = await supabase
  .from('jobs')
  .select('status')
  .gte('created_at', '2026-06-08T00:00:00Z')

const byStatus = {}
for (const r of today || []) {
  byStatus[r.status] = (byStatus[r.status] || 0) + 1
}
console.log(`\n📅 STATUS DE TODOS LOS JOBS DE HOY:`)
for (const [s, c] of Object.entries(byStatus).sort((a,b)=>b[1]-a[1])) {
  console.log(`   ${s.padEnd(25)} ${c}`)
}
