import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// Window: viernes 2026-06-05 medianoche → ahora (lunes 2026-06-08)
const WINDOW_START = '2026-06-05T00:00:00Z'
const now = '2026-06-08T23:59:59Z'

// 1. Jobs ingestados en la ventana
const { count: ingested } = await supabase
  .from('jobs')
  .select('*', { count: 'exact', head: true })
  .gte('created_at', WINDOW_START)

// 2. Por status actual (la columna real puede ser 'status' o 'current_status')
const { data: statusRows } = await supabase
  .from('jobs')
  .select('status, created_at')
  .gte('created_at', WINDOW_START)

const byStatus = {}
const byDay = {}
for (const row of statusRows || []) {
  const s = row.status || 'NULL'
  byStatus[s] = (byStatus[s] || 0) + 1
  const day = (row.created_at || '').slice(0, 10)
  byDay[day] = byDay[day] || { total: 0 }
  byDay[day].total++
}

// 3. Por BU + status
const { data: buRows } = await supabase
  .from('jobs')
  .select('business_unit_id, status')
  .gte('created_at', WINDOW_START)
  .not('business_unit_id', 'is', null)

const { data: bus } = await supabase.from('business_units').select('id, name')
const buNames = Object.fromEntries((bus || []).map(b => [b.id, b.name]))

const byBU = {}
for (const row of buRows || []) {
  const name = buNames[row.business_unit_id] || 'unknown'
  byBU[name] = byBU[name] || {}
  byBU[name][row.status] = (byBU[name][row.status] || 0) + 1
}

// 4. Cover letters generadas en la ventana — joins via the jobs.cover_letter column if exists,
//    or count rows with status proposal_drafted/ready_to_send/sent
const generatedStatuses = ['proposal_drafted', 'ready_to_send', 'sent']
const { count: coverLettersInWindow } = await supabase
  .from('jobs')
  .select('*', { count: 'exact', head: true })
  .gte('created_at', WINDOW_START)
  .in('status', generatedStatuses)

// 5. Sample de los últimos 5 jobs procesados (top of funnel)
const { data: samples } = await supabase
  .from('jobs')
  .select('id, title, status, business_unit_id, created_at, ticket')
  .gte('created_at', WINDOW_START)
  .order('created_at', { ascending: false })
  .limit(5)

// 6. Errores o classifications failed?
const { data: errors } = await supabase
  .from('jobs')
  .select('id, title, status, classifier_reason')
  .gte('created_at', WINDOW_START)
  .eq('status', 'discarded_review')
  .limit(5)

// 7. Cover letters generated this weekend (jobs.cover_letter_draft populated)
const { count: coverGenerated } = await supabase
  .from('jobs')
  .select('*', { count: 'exact', head: true })
  .gte('cover_letter_generated_at', WINDOW_START)
  .not('cover_letter_draft', 'is', null)

// 8. Qualified jobs that ran the classifier in window
const { count: classifierRan } = await supabase
  .from('jobs')
  .select('*', { count: 'exact', head: true })
  .gte('classifier_run_at', WINDOW_START)
  .not('classifier_run_at', 'is', null)

console.log('═══════════════════════════════════════════')
console.log('  BRAIN WEEKEND REPORT')
console.log(`  Window: ${WINDOW_START.slice(0,10)} → ${now.slice(0,10)}`)
console.log('═══════════════════════════════════════════\n')

console.log(`📥 TOTAL JOBS INGESTADOS: ${ingested}\n`)

console.log('📅 POR DÍA:')
for (const [day, s] of Object.entries(byDay).sort()) {
  console.log(`   ${day}: ${s.total} jobs`)
}

console.log('\n📊 POR STATUS (kanban):')
for (const [s, c] of Object.entries(byStatus).sort((a,b) => b[1] - a[1])) {
  console.log(`   ${s.padEnd(25)} ${c}`)
}

console.log(`\n🤖 CLASSIFIER CORRIÓ EN: ${classifierRan} jobs`)
console.log(`✉️  COVER LETTERS GENERADAS REALMENTE: ${coverGenerated}`)
console.log(`   (jobs con cover_letter_draft populated en la ventana)`)
console.log(`📂 EN STATUS proposal_drafted/ready_to_send/sent: ${coverLettersInWindow}`)

console.log('\n🏢 POR BUSINESS UNIT:')
for (const [bu, statuses] of Object.entries(byBU).sort((a,b) => {
  const sa = Object.values(a[1]).reduce((x,y)=>x+y,0)
  const sb = Object.values(b[1]).reduce((x,y)=>x+y,0)
  return sb - sa
})) {
  const total = Object.values(statuses).reduce((x,y)=>x+y,0)
  console.log(`   ${bu.padEnd(45)} ${total} total`)
  for (const [s, c] of Object.entries(statuses)) {
    console.log(`      ↳ ${s}: ${c}`)
  }
}

console.log('\n🕒 ÚLTIMOS 5 JOBS PROCESADOS:')
for (const j of samples || []) {
  const bu = buNames[j.business_unit_id] || '—'
  const ticket = j.ticket ? `$${j.ticket}` : '—'
  console.log(`   [${j.created_at.slice(0,16).replace('T',' ')}] ${(j.title || '').slice(0,55).padEnd(55)} ${j.status.padEnd(20)} ${ticket} · ${bu}`)
}

console.log('\n⚠️  JOBS EN discarded_review (necesitan ojo humano):')
for (const e of errors || []) {
  console.log(`   - ${(e.title || '').slice(0,60)}`)
  console.log(`     reason: ${(e.classifier_reason || '').slice(0,120)}`)
}
