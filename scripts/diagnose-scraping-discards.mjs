// Diagnóstico tras los cambios de cron:
// 1) ¿Los scrapers están corriendo en las 4 ventanas nuevas?
// 2) ¿Cuál es el volumen actual?
// 3) ¿Hay discards sospechosos para revisar?
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const now = Date.now()

// 1. Distribución horaria de TODAY
const today0 = new Date()
today0.setUTCHours(0, 0, 0, 0)
const { data: todayJobs } = await supabase
  .from('jobs')
  .select('created_at, status, classifier_reason, title, duration, description')
  .gte('created_at', today0.toISOString())
  .order('created_at', { ascending: false })

console.log(`\n📅 HOY (${today0.toISOString().slice(0, 10)}) — ${todayJobs?.length ?? 0} jobs ingestados`)
const byHour = new Array(24).fill(0)
for (const j of todayJobs ?? []) {
  byHour[new Date(j.created_at).getUTCHours()]++
}
const activeHours = byHour.filter(n => n > 0).length
console.log(`Horas activas hoy: ${activeHours}/24`)
console.log('Distribución horaria UTC:')
for (let h = 0; h < 24; h++) {
  if (byHour[h] > 0) console.log(`  ${String(h).padStart(2, '0')}:00 UTC  →  ${byHour[h]} jobs`)
}

// 2. Estado actual del board
console.log('\n📋 ESTADO ACTUAL DEL BOARD (totales en DB)')
for (const st of ['proposal_drafted', 'ready_to_send', 'sent', 'responded', 'discarded_review', 'discarded']) {
  const { count } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', st)
  console.log(`  ${st.padEnd(20)} ${count}`)
}

// 3. Últimos 15 discards CON razón (para ver si hay falsos negativos sospechosos)
console.log('\n🔴 ÚLTIMOS 15 DISCARDS clasificados (con razón LLM):')
const { data: recentDiscards } = await supabase
  .from('jobs')
  .select('id, title, classifier_reason, classifier_score, duration, ticket, hourly_average, classifier_run_at')
  .eq('status', 'discarded')
  .not('classifier_run_at', 'is', null)
  .order('classifier_run_at', { ascending: false })
  .limit(15)
for (const j of recentDiscards ?? []) {
  console.log(`\n  • ${j.title.slice(0, 70)}`)
  console.log(`    duration=${j.duration} | ticket=$${j.ticket}/h | score=${j.classifier_score}`)
  console.log(`    reason: ${(j.classifier_reason || '').slice(0, 150)}`)
}

// 4. Buscar específicamente jobs descartados donde duration dice "1 to 3 months" o más
// pero la description sugiere one-off/short → estos son los que el usuario menciona
console.log('\n🟡 DISCARDED con duration multi-mes pero scope dudoso:')
const { data: longButShort } = await supabase
  .from('jobs')
  .select('id, title, duration, description, classifier_reason')
  .eq('status', 'discarded')
  .not('classifier_run_at', 'is', null)
  .in('duration', ['1 to 3 months', '3 to 6 months', 'More than 6 months'])
  .or('description.ilike.%one-time%,description.ilike.%single call%,description.ilike.%one-off%,description.ilike.%initial consultation%')
  .order('classifier_run_at', { ascending: false })
  .limit(5)
for (const j of longButShort ?? []) {
  console.log(`\n  • ${j.title.slice(0, 70)} (duration=${j.duration})`)
  console.log(`    reason: ${(j.classifier_reason || '').slice(0, 120)}`)
}
