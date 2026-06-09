// Reporte de cómo viene HOY (2026-06-09)
// Compara con ayer (08) y el fin de semana (05-07) para validar que los fixes funcionan.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const TODAY_START = '2026-06-09T00:00:00Z'
const YESTERDAY = '2026-06-08T00:00:00Z'
const SEVEN_DAYS_AGO = '2026-06-02T00:00:00Z'

console.log('╔═══════════════════════════════════════════════════════════════╗')
console.log('║    BRAIN REPORT — 2026-06-09 (hoy)                              ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

// 1. Pulse — última actividad
const { data: lastIngest } = await supabase.from('jobs').select('created_at, title').order('created_at', { ascending: false }).limit(1)
const { data: lastClassif } = await supabase.from('jobs').select('classifier_run_at, title').not('classifier_run_at', 'is', null).order('classifier_run_at', { ascending: false }).limit(1)
const { data: lastCover } = await supabase.from('jobs').select('cover_letter_generated_at, title').not('cover_letter_generated_at', 'is', null).order('cover_letter_generated_at', { ascending: false }).limit(1)

const ago = (iso) => {
  if (!iso) return 'NEVER'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 60) return `${min} min ago`
  if (min < 1440) return `${Math.round(min/60)} h ago`
  return `${Math.round(min/1440)} d ago`
}

console.log('🟢 PULSE')
console.log(`   Último job ingestado:  ${lastIngest?.[0]?.created_at?.slice(0,16).replace('T',' ')}  (${ago(lastIngest?.[0]?.created_at)})`)
console.log(`     "${(lastIngest?.[0]?.title || '').slice(0, 65)}"`)
console.log(`   Último classifier run: ${lastClassif?.[0]?.classifier_run_at?.slice(0,16).replace('T',' ')}  (${ago(lastClassif?.[0]?.classifier_run_at)})`)
console.log(`   Última cover letter:   ${lastCover?.[0]?.cover_letter_generated_at?.slice(0,16).replace('T',' ')}  (${ago(lastCover?.[0]?.cover_letter_generated_at)})`)

// 2. Volumen de HOY
const { data: todayJobs } = await supabase
  .from('jobs')
  .select('id, title, status, classifier_match, classifier_score, classifier_area, classifier_run_at, cover_letter_draft, cover_letter_generated_at, ticket, hourly_average, business_unit_id, created_at')
  .gte('created_at', TODAY_START)

console.log(`\n📅 ACTIVIDAD HOY (${TODAY_START.slice(0,10)})`)
console.log(`   📥 Ingestados:           ${todayJobs?.length || 0}`)
const todayClass = (todayJobs || []).filter(j => j.classifier_run_at)
const todayMatch = (todayJobs || []).filter(j => j.classifier_match === true)
const todayCovers = (todayJobs || []).filter(j => j.cover_letter_draft)
console.log(`   🤖 Clasificados:         ${todayClass.length}`)
console.log(`   ✅ Matches:              ${todayMatch.length}`)
console.log(`   ✉️  Cover letters:        ${todayCovers.length}`)

// 3. Verificar frecuencia del cron — distribución de classifier_run_at en el día
const { data: classifTimes } = await supabase
  .from('jobs')
  .select('classifier_run_at')
  .gte('classifier_run_at', TODAY_START)
  .not('classifier_run_at', 'is', null)
  .order('classifier_run_at')

const runsByHourMin = {}
const distinctRuns = new Set()
for (const r of classifTimes || []) {
  const t = r.classifier_run_at.slice(11, 16) // HH:MM
  // agrupar en buckets de 30 min para ver si corre cada 30
  const [h, m] = t.split(':').map(Number)
  const bucket30 = `${String(h).padStart(2,'0')}:${m < 30 ? '00' : '30'}`
  runsByHourMin[bucket30] = (runsByHourMin[bucket30] || 0) + 1
  // distinct minute-level run timestamps (rounded to nearest min)
  distinctRuns.add(r.classifier_run_at.slice(0, 16))
}

console.log(`\n🕐 CRON CLASSIFIER (verificar que corre cada 30 min hoy)`)
console.log(`   Total ejecuciones distintas (ventanas de 1 min): ${distinctRuns.size}`)
console.log(`   Buckets 30-min con actividad:`)
for (const [bucket, count] of Object.entries(runsByHourMin).sort()) {
  const bar = '█'.repeat(Math.min(count, 50))
  console.log(`     ${bucket} UTC  ${String(count).padStart(3)} jobs  ${bar}`)
}

// 4. Cover letters generadas hoy — chequear que usen el estilo v3
console.log(`\n📝 COVER LETTERS GENERADAS HOY (revisar estilo)`)
if (todayCovers.length === 0) {
  console.log(`   Ninguna todavía. Si es temprano, el cron de hoy puede no haber procesado.`)
} else {
  const { data: bus } = await supabase.from('business_units').select('id, name')
  const buNames = Object.fromEntries((bus||[]).map(b => [b.id, b.name]))

  let v3Style = 0
  for (const j of todayCovers) {
    const text = j.cover_letter_draft || ''
    const startsCorrect = text.startsWith('Hi, it')
    if (startsCorrect) v3Style++
    console.log(`\n   ━━━ "${(j.title || '').slice(0, 65)}" ━━━`)
    console.log(`   BU: ${buNames[j.business_unit_id] || j.classifier_area} · score=${j.classifier_score} · ticket=$${j.ticket || j.hourly_average || '?'}`)
    console.log(`   Generated: ${j.cover_letter_generated_at?.slice(11,16)} UTC`)
    console.log(`   Style v3 (greeting "Hi, it's a pleasure..."): ${startsCorrect ? '✅' : '❌ ' + text.slice(0, 60)}`)
    console.log(`   Preview: ${text.slice(0, 180)}...`)
  }
  console.log(`\n   📊 ${v3Style}/${todayCovers.length} cover letters usan el estilo nuevo`)
}

// 5. Comparativa últimos 5 días
console.log(`\n📈 COMPARATIVA ÚLTIMOS DÍAS`)
const days = ['2026-06-05', '2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09']
console.log(`   Día         Ingest  Class.  Match  Covers`)
for (const d of days) {
  const start = `${d}T00:00:00Z`
  const end = `${d}T23:59:59Z`
  const [ing, cls, mat, cov] = await Promise.all([
    supabase.from('jobs').select('*', { count: 'exact', head: true }).gte('created_at', start).lte('created_at', end),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).gte('classifier_run_at', start).lte('classifier_run_at', end),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).gte('classifier_run_at', start).lte('classifier_run_at', end).eq('classifier_match', true),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).gte('cover_letter_generated_at', start).lte('cover_letter_generated_at', end),
  ])
  const today = d === '2026-06-09' ? '  ← HOY' : ''
  console.log(`   ${d}  ${String(ing.count ?? 0).padStart(5)}   ${String(cls.count ?? 0).padStart(5)}  ${String(mat.count ?? 0).padStart(5)}  ${String(cov.count ?? 0).padStart(6)}${today}`)
}

// 6. Stuck check
const { count: stuckPreq } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'prequalified').is('classifier_run_at', null)
const { count: stuckQual } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'qualified').is('cover_letter_draft', null)
const { count: stuckRev } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'discarded_review')

console.log(`\n⏳ STUCK CHECK (jobs que necesitan atención)`)
console.log(`   Prequalified sin classify:    ${stuckPreq}  ${stuckPreq > 0 ? '⚠️' : '✅'}`)
console.log(`   Qualified sin cover letter:   ${stuckQual}  ${stuckQual > 0 ? '⚠️' : '✅'}`)
console.log(`   En discarded_review:          ${stuckRev}  ${stuckRev > 0 ? '👀' : '✅'}`)
