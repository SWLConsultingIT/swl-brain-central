import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// Total proposals
const { count: total } = await supabase
  .from('proposals')
  .select('*', { count: 'exact', head: true })

// Proposals with non-empty cover_letter
const { count: withCover } = await supabase
  .from('proposals')
  .select('*', { count: 'exact', head: true })
  .not('cover_letter', 'is', null)
  .neq('cover_letter', '')

// Last 60 days
const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
const { count: last60 } = await supabase
  .from('proposals')
  .select('*', { count: 'exact', head: true })
  .gte('sent_date', sixtyDaysAgo)

const { count: last60WithCover } = await supabase
  .from('proposals')
  .select('*', { count: 'exact', head: true })
  .gte('sent_date', sixtyDaysAgo)
  .not('cover_letter', 'is', null)
  .neq('cover_letter', '')

// Distribution by BU
const { data: byBU } = await supabase
  .from('proposals')
  .select('business_unit_id, cover_letter')

const buStats = {}
for (const row of byBU || []) {
  const bu = row.business_unit_id || 'NULL'
  if (!buStats[bu]) buStats[bu] = { total: 0, withCover: 0 }
  buStats[bu].total++
  if (row.cover_letter && row.cover_letter.trim().length > 0) buStats[bu].withCover++
}

// Sample 3 with cover letter to see content quality
const { data: samples } = await supabase
  .from('proposals')
  .select('id, business_unit_id, sent_date, cover_letter')
  .not('cover_letter', 'is', null)
  .neq('cover_letter', '')
  .limit(3)

console.log('═══════ PROPOSALS TABLE ═══════')
console.log(`Total rows: ${total}`)
console.log(`With non-empty cover_letter: ${withCover}`)
console.log(`Last 60 days (sent_date >= ${sixtyDaysAgo.slice(0,10)}): ${last60}`)
console.log(`Last 60 days WITH cover letter: ${last60WithCover}`)
console.log('\n═══════ BY BUSINESS UNIT ═══════')
const { data: bus } = await supabase.from('business_units').select('id, name')
const buNames = Object.fromEntries((bus||[]).map(b => [b.id, b.name]))
for (const [buId, s] of Object.entries(buStats).sort((a,b) => b[1].total - a[1].total)) {
  const name = buNames[buId] || buId.slice(0,8)
  console.log(`  ${name.padEnd(45)} ${s.total} total / ${s.withCover} w/ cover`)
}
console.log('\n═══════ SAMPLE COVER LETTERS ═══════')
for (const s of samples || []) {
  const buName = buNames[s.business_unit_id] || 'NULL'
  console.log(`\n[${buName}] sent: ${s.sent_date} — ${(s.cover_letter||'').length} chars`)
  console.log(`Preview: ${(s.cover_letter||'').slice(0, 200)}...`)
}
