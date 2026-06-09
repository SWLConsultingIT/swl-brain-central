// Investigación detallada de los 18 jobs clasificados hoy
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const TODAY = '2026-06-09T00:00:00Z'

// 1. Los 18 jobs clasificados hoy
const { data: classified } = await supabase
  .from('jobs')
  .select('id, title, status, classifier_match, classifier_score, classifier_area, classifier_reason, classifier_run_at, ticket, hourly_average, post_date')
  .gte('classifier_run_at', TODAY)
  .order('classifier_score', { ascending: false })

console.log(`═══ TODOS LOS 18 JOBS CLASIFICADOS HOY ═══\n`)
console.log(`(ordenados por score descendente)\n`)

let buggyCount = 0
let legitDiscard = 0
let matches = 0

for (const j of classified || []) {
  const reasonEmpty = !j.classifier_reason || j.classifier_reason.trim() === ''
  const bug = j.classifier_score === 0 && reasonEmpty
  const matchMark = j.classifier_match ? '✅ MATCH' : (bug ? '🐞 BUG?' : '❌ NO')

  if (j.classifier_match) matches++
  else if (bug) buggyCount++
  else legitDiscard++

  console.log(`${matchMark}  score=${String(j.classifier_score).padStart(3)}  area=${(j.classifier_area || 'NULL').padEnd(40)}  $${j.ticket || j.hourly_average || '?'}`)
  console.log(`   "${(j.title || '').slice(0, 75)}"`)
  console.log(`   reason: ${(j.classifier_reason || '(vacío)').slice(0, 150)}`)
  console.log(`   run_at: ${j.classifier_run_at}`)
  console.log()
}

console.log(`═══ RESUMEN ═══`)
console.log(`✅ Matches:                    ${matches}`)
console.log(`🐞 Buggy (score=0, reason=""): ${buggyCount}`)
console.log(`❌ Legitimately discarded:     ${legitDiscard}`)

// 2. Distribución horaria de classifier_run_at HOY
console.log(`\n═══ CUÁNDO CORRIÓ EL CLASSIFIER HOY ═══\n`)
const runs = (classified || []).map(j => j.classifier_run_at).sort()
const uniqueRuns = new Map()
for (const r of runs) {
  const minute = r.slice(0, 16)
  uniqueRuns.set(minute, (uniqueRuns.get(minute) || 0) + 1)
}
console.log(`Ejecuciones distintas (por minuto):`)
for (const [time, count] of uniqueRuns) {
  console.log(`  ${time}  → ${count} jobs procesados`)
}

// 3. ¿Hay prequalified en este momento esperando?
const { data: pendingNow } = await supabase
  .from('jobs')
  .select('id, title, hourly_average, created_at')
  .eq('status', 'prequalified')
  .is('classifier_run_at', null)
  .order('created_at')

console.log(`\n═══ JOBS PREQUALIFIED ESPERANDO AHORA ═══`)
console.log(`Total: ${pendingNow?.length || 0}`)
for (const j of pendingNow || []) {
  const age = Math.round((Date.now() - new Date(j.created_at).getTime()) / 60000)
  console.log(`  age=${age}min  $${j.hourly_average}/h  "${(j.title||'').slice(0, 65)}"`)
}

// 4. Cuántos jobs hay en 'new' (esperando el ticket filter)
const { count: newCount } = await supabase
  .from('jobs')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'new')
console.log(`\n═══ JOBS EN STATUS 'new' (esperando el ticket filter) ═══`)
console.log(`Total: ${newCount}`)
