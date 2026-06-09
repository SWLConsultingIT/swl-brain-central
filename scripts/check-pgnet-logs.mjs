import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// Try to query pg_net logs via SQL
// pg_net stores responses in net._http_response

const { data: responses, error: respErr } = await supabase
  .rpc('exec_sql_admin', {
    query: `
      SELECT id, status_code, content_type, error_msg, created
      FROM net._http_response
      WHERE created > now() - interval '2 days'
      ORDER BY created DESC
      LIMIT 30
    `
  })
  .single()

if (respErr) {
  console.log('exec_sql_admin RPC not available, trying direct table:')
  console.log('  ', respErr.message)
}

// Alternative: check decisions table — it should log brain_ticket_filter actions
const { data: recentDecisions } = await supabase
  .from('job_decisions')
  .select('job_id, from_status, to_status, actor, reason, created_at')
  .gte('created_at', '2026-06-08T00:00:00Z')
  .order('created_at', { ascending: false })
  .limit(30)

console.log('\n═══════ JOB_DECISIONS (today) ═══════')
const actorCount = {}
for (const d of recentDecisions || []) {
  actorCount[d.actor] = (actorCount[d.actor] || 0) + 1
}
console.log('Decisions por actor hoy:')
for (const [a, c] of Object.entries(actorCount)) {
  console.log(`  ${a.padEnd(35)} ${c}`)
}
console.log('\nÚltimas 10 decisions:')
for (const d of (recentDecisions || []).slice(0, 10)) {
  console.log(`  [${d.created_at.slice(11,19)}] ${d.actor.padEnd(30)} ${d.from_status} → ${d.to_status}`)
  console.log(`     reason: ${(d.reason || '').slice(0, 100)}`)
}

// Are there decisions for the stuck prequalified jobs?
const stuckIds = await supabase
  .from('jobs')
  .select('id, title')
  .eq('status', 'prequalified')
  .is('classifier_run_at', null)

console.log(`\n═══════ DECISIONS PARA LOS 9 STUCK ═══════`)
for (const j of stuckIds.data || []) {
  const { data: deci } = await supabase
    .from('job_decisions')
    .select('from_status, to_status, actor, reason, created_at')
    .eq('job_id', j.id)
    .order('created_at')
  console.log(`\nJob: ${(j.title || '').slice(0,70)}`)
  for (const d of deci || []) {
    console.log(`  [${d.created_at.slice(0,19)}] ${d.actor.padEnd(30)} ${d.from_status || 'new'} → ${d.to_status}`)
  }
}
