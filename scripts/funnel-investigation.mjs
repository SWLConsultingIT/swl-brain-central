import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const WINDOW_START = '2026-06-05T00:00:00Z'

console.log('═══════ FUNNEL INVESTIGATION ═══════\n')

// ── BUG #1: Jobs descartados por ticket — confirmar
const { count: discardedByTicket } = await supabase
  .from('jobs')
  .select('*', { count: 'exact', head: true })
  .gte('created_at', WINDOW_START)
  .eq('status', 'discarded')
  .is('classifier_run_at', null)

console.log(`🔻 Descartados sin pasar por classifier (ticket < $40): ${discardedByTicket}`)

// ── BUG #2: Jobs que pasaron al classifier pero match=false
const { data: classifierRejected } = await supabase
  .from('jobs')
  .select('id, title, status, classifier_match, classifier_score, classifier_reason, ticket, hourly_average')
  .gte('classifier_run_at', WINDOW_START)
  .eq('classifier_match', false)

console.log(`\n🔻 Jobs rechazados por classifier (match=false): ${classifierRejected?.length || 0}`)
console.log('   Top 10 razones (samples):')
const reasonCounts = {}
for (const r of classifierRejected || []) {
  const key = (r.classifier_reason || 'no reason').slice(0, 60)
  reasonCounts[key] = (reasonCounts[key] || 0) + 1
}
for (const [reason, count] of Object.entries(reasonCounts).sort((a,b)=>b[1]-a[1]).slice(0, 10)) {
  console.log(`     [${count}x] ${reason}`)
}

// ── BUG #3: Jobs con classifier_match=true pero NO drafted
const { data: matchedButNoDraft } = await supabase
  .from('jobs')
  .select('id, title, status, classifier_match, classifier_score, classifier_area, business_unit_id, ticket, hourly_average, cover_letter_generated_at, classifier_run_at, created_at')
  .gte('classifier_run_at', WINDOW_START)
  .eq('classifier_match', true)
  .is('cover_letter_draft', null)

console.log(`\n⚠️  Jobs MATCH=true pero SIN cover letter generada: ${matchedButNoDraft?.length || 0}`)
console.log('   (estos son los que deberían tener cover letter y no la tienen)\n')
for (const j of (matchedButNoDraft || []).slice(0, 15)) {
  const age = Math.round((Date.now() - new Date(j.created_at).getTime()) / 3600000)
  console.log(`     - [${j.status.padEnd(15)}] score=${j.classifier_score}  area=${(j.classifier_area || 'NULL').padEnd(35)} ticket=$${j.ticket || '?'}  hourly=$${j.hourly_average || '?'}/h  age=${age}h`)
  console.log(`       "${(j.title || '').slice(0, 70)}"`)
  console.log(`       run_at: ${j.classifier_run_at}`)
  console.log(`       bu_id: ${j.business_unit_id ? 'OK' : 'NULL ❌'}`)
}

// ── BUG #4: Jobs prequalified parados (no avanzaron a drafted)
const { data: stuckPrequalified } = await supabase
  .from('jobs')
  .select('id, title, status, classifier_score, classifier_area, business_unit_id, ticket, classifier_run_at, created_at, cover_letter_generated_at')
  .eq('status', 'prequalified')

console.log(`\n⏳ Jobs estancados en "prequalified": ${stuckPrequalified?.length || 0}`)
for (const j of stuckPrequalified || []) {
  const age = Math.round((Date.now() - new Date(j.created_at).getTime()) / 3600000)
  console.log(`     - age=${age}h score=${j.classifier_score} area=${j.classifier_area || 'NULL'} bu_id=${j.business_unit_id ? 'OK' : 'NULL ❌'} ticket=$${j.ticket || '?'}`)
  console.log(`       "${(j.title || '').slice(0, 80)}"`)
  console.log(`       classifier_run: ${j.classifier_run_at || 'NEVER'}`)
  console.log(`       cover_gen: ${j.cover_letter_generated_at || 'NEVER'}`)
}

// ── BUG #5: ¿hay errores raros en classifier_reason?
const { data: weirdReasons } = await supabase
  .from('jobs')
  .select('id, title, classifier_reason, status')
  .gte('classifier_run_at', WINDOW_START)
  .or('classifier_reason.ilike.%error%,classifier_reason.ilike.%fail%,classifier_reason.ilike.%null%,classifier_reason.ilike.%undefined%,classifier_reason.is.null')
  .not('classifier_run_at', 'is', null)

console.log(`\n🐞 Jobs con classifier_reason sospechoso o NULL: ${weirdReasons?.length || 0}`)
for (const j of (weirdReasons || []).slice(0, 10)) {
  console.log(`     - [${j.status}] reason=${(j.classifier_reason || 'NULL').slice(0,100)}`)
  console.log(`       "${(j.title || '').slice(0,70)}"`)
}

// ── BUG #6: ¿algún BU está particularmente con problema?
const { data: areaCount } = await supabase
  .from('jobs')
  .select('classifier_area, classifier_match')
  .gte('classifier_run_at', WINDOW_START)
  .not('classifier_area', 'is', null)

const areaStats = {}
for (const r of areaCount || []) {
  const k = r.classifier_area
  areaStats[k] = areaStats[k] || { total: 0, match: 0 }
  areaStats[k].total++
  if (r.classifier_match) areaStats[k].match++
}
console.log(`\n📈 Areas asignadas por classifier (en jobs que pasaron ticket filter):`)
for (const [area, s] of Object.entries(areaStats).sort((a,b)=>b[1].total-a[1].total)) {
  const pct = ((s.match / s.total) * 100).toFixed(0)
  console.log(`   ${area.padEnd(45)} ${s.total} clasificados / ${s.match} match (${pct}%)`)
}

// ── BUG #7: ¿hay cover_letter_draft generadas pero sin status proposal_drafted? (sync bug)
const { data: orphanDrafts } = await supabase
  .from('jobs')
  .select('id, title, status, cover_letter_generated_at')
  .not('cover_letter_draft', 'is', null)
  .not('status', 'in', '(proposal_drafted,ready_to_send,sent)')
  .gte('cover_letter_generated_at', WINDOW_START)

console.log(`\n💔 Cover letters generadas pero status ≠ drafted/ready/sent: ${orphanDrafts?.length || 0}`)
for (const j of orphanDrafts || []) {
  console.log(`     - [${j.status}] gen_at=${j.cover_letter_generated_at} "${(j.title||'').slice(0,60)}"`)
}
