import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// Sample one row to see column names
const { data, error } = await supabase
  .from('jobs')
  .select('*')
  .limit(1)

if (error) {
  console.error('ERROR:', error)
  process.exit(1)
}

if (!data || data.length === 0) {
  console.log('Tabla jobs VACÍA — 0 rows')
} else {
  console.log('Columns de la tabla jobs:')
  console.log(Object.keys(data[0]).sort().join('\n'))
  console.log('\n--- Sample row (truncated) ---')
  const r = data[0]
  for (const k of Object.keys(r).sort()) {
    const v = r[k]
    const s = typeof v === 'string' ? v.slice(0, 80) : JSON.stringify(v)?.slice(0, 80)
    console.log(`${k.padEnd(30)} ${s}`)
  }
}

// Also: total count
const { count: total } = await supabase
  .from('jobs')
  .select('*', { count: 'exact', head: true })
console.log(`\nTOTAL ROWS EN jobs: ${total}`)

// Latest 5 by created_at (try that column name)
const { data: latest } = await supabase
  .from('jobs')
  .select('id, title, status, created_at')
  .order('created_at', { ascending: false })
  .limit(5)
console.log('\nÚltimos 5 jobs por created_at:')
for (const j of latest || []) {
  console.log(`  ${j.created_at} ${j.status?.padEnd(20) || '-'} ${(j.title||'').slice(0,60)}`)
}
