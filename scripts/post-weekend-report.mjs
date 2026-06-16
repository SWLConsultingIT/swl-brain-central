// Reporte de qué pasó en el brain durante el finde + hoy
// Focus: actividad por día, drafted/ready/sent, anomalías post-deploy del 12/06
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const now = Date.now()

const ago = (iso) => {
  if (!iso) return 'NEVER'
  const ms = now - new Date(iso).getTime()
  if (ms < HOUR) return `${Math.round(ms / 60_000)}m ago`
  if (ms < DAY) return `${Math.round(ms / HOUR)}h ago`
  return `${Math.round(ms / DAY)}d ago`
}

const dayLabel = (offset) => {
  const d = new Date(now - offset * DAY)
  return d.toISOString().slice(0, 10)
}

// 1. PULSE
const [lastIngest, lastClassif, lastCover, lastSent] = await Promise.all([
  supabase.from('jobs').select('created_at, title').order('created_at', { ascending: false }).limit(1),
  supabase.from('jobs').select('classifier_run_at, title').not('classifier_run_at', 'is', null).order('classifier_run_at', { ascending: false }).limit(1),
  supabase.from('jobs').select('cover_letter_generated_at, title').not('cover_letter_generated_at', 'is', null).order('cover_letter_generated_at', { ascending: false }).limit(1),
  supabase.from('jobs').select('updated_at, title').eq('status', 'sent').order('updated_at', { ascending: false }).limit(1),
])

console.log('═'.repeat(70))
console.log(`  BRAIN REPORT — ${dayLabel(0)} (post-weekend)`)
console.log('═'.repeat(70))
console.log('\n🟢 PULSE')
console.log(`  Último ingest:     ${lastIngest.data?.[0]?.created_at?.slice(0, 16).replace('T', ' ')}  (${ago(lastIngest.data?.[0]?.created_at)})`)
console.log(`     "${(lastIngest.data?.[0]?.title || '').slice(0, 60)}"`)
console.log(`  Último classifier: ${lastClassif.data?.[0]?.classifier_run_at?.slice(0, 16).replace('T', ' ')}  (${ago(lastClassif.data?.[0]?.classifier_run_at)})`)
console.log(`  Última cover:      ${lastCover.data?.[0]?.cover_letter_generated_at?.slice(0, 16).replace('T', ' ')}  (${ago(lastCover.data?.[0]?.cover_letter_generated_at)})`)
console.log(`  Último sent:       ${lastSent.data?.[0]?.updated_at?.slice(0, 16).replace('T', ' ')}  (${ago(lastSent.data?.[0]?.updated_at)})`)

// 2. VOLUMEN POR DÍA (últimos 5 días — incluye sábado, domingo, lunes, hoy)
console.log('\n📊 VOLUMEN POR DÍA (últimos 5 días)')
console.log('  ' + 'Día'.padEnd(13) + 'Ingest'.padStart(8) + 'Classif'.padStart(10) + 'Drafted'.padStart(10) + 'Ready'.padStart(8) + 'Sent'.padStart(8) + 'Discard'.padStart(10))

for (let i = 0; i <= 4; i++) {
  const start = new Date(now - (i + 1) * DAY)
  const end = new Date(now - i * DAY)
  const startIso = start.toISOString()
  const endIso = end.toISOString()
  const label = dayLabel(i)

  const [ingest, classif, drafted, ready, sent, discard] = await Promise.all([
    supabase.from('jobs').select('*', { count: 'exact', head: true }).gte('created_at', startIso).lt('created_at', endIso),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).gte('classifier_run_at', startIso).lt('classifier_run_at', endIso),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).gte('cover_letter_generated_at', startIso).lt('cover_letter_generated_at', endIso),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'ready_to_send').gte('updated_at', startIso).lt('updated_at', endIso),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'sent').gte('updated_at', startIso).lt('updated_at', endIso),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'discarded').gte('updated_at', startIso).lt('updated_at', endIso),
  ])

  const dayName = ['hoy', 'ayer', '2d', '3d', '4d'][i] || `${i}d`
  console.log(`  ${(label + ' ' + dayName).padEnd(13)}${String(ingest.count ?? 0).padStart(8)}${String(classif.count ?? 0).padStart(10)}${String(drafted.count ?? 0).padStart(10)}${String(ready.count ?? 0).padStart(8)}${String(sent.count ?? 0).padStart(8)}${String(discard.count ?? 0).padStart(10)}`)
}

// 3. ESTADO ACTUAL del board
const { data: allStatus } = await supabase.from('jobs').select('status')
const statusCounts = {}
for (const j of allStatus ?? []) statusCounts[j.status] = (statusCounts[j.status] || 0) + 1
console.log('\n📋 ESTADO ACTUAL DEL BOARD')
for (const [s, c] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s.padEnd(20)} ${c}`)
}

// 4. ¿Pegó el HARD_EXCLUSION #17 en algún job desde el viernes?
const since12jun = new Date('2026-06-12T19:00:00Z').toISOString() // ~hora del deploy
const { data: recentDiscards } = await supabase
  .from('jobs')
  .select('id, title, classifier_reason, classifier_score, classifier_run_at')
  .eq('status', 'discarded')
  .not('classifier_run_at', 'is', null)
  .gte('classifier_run_at', since12jun)
  .or('classifier_reason.ilike.%short session%,classifier_reason.ilike.%minute%,classifier_reason.ilike.%hour%')
  .order('classifier_run_at', { ascending: false })
  .limit(10)

console.log(`\n🆕 ¿Pegó HARD_EXCLUSION #17 desde el deploy (12-jun 19:00 UTC)?`)
if (!recentDiscards || recentDiscards.length === 0) {
  console.log('  Ninguno — todavía no se cruzó con un job tipo "X minute consultation"')
} else {
  console.log(`  ${recentDiscards.length} jobs descartados por menciones de duración corta:`)
  for (const j of recentDiscards) {
    console.log(`    • ${j.title.slice(0, 60)}`)
    console.log(`      reason: ${(j.classifier_reason || '').slice(0, 100)}...`)
  }
}

// 5. Drafts pendientes de tu review (lo que tenés que mirar hoy)
const { count: pendingDrafts } = await supabase
  .from('jobs')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'proposal_drafted')
const { count: pendingReady } = await supabase
  .from('jobs')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'ready_to_send')
const { count: pendingReview } = await supabase
  .from('jobs')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'discarded_review')

console.log('\n🎯 TU QUEUE PARA HOY')
console.log(`  ${pendingDrafts ?? 0} drafts esperando review`)
console.log(`  ${pendingReady ?? 0} ready to send`)
console.log(`  ${pendingReview ?? 0} en review manual`)
