import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const { data, error } = await supabase
  .from('jobs')
  .select('*')
  .eq('id', 'b124865e-ea17-4405-a960-a35d9bc5e1ec')
  .single()

if (error) { console.error(error); process.exit(1) }

console.log('=== FULL JOB ===\n')
for (const [k, v] of Object.entries(data)) {
  if (v === null || v === undefined) continue
  if (typeof v === 'string' && v.length > 1500) {
    console.log(`\n--- ${k} (${v.length} chars) ---`)
    console.log(v)
  } else if (typeof v === 'object') {
    console.log(`${k}:`, JSON.stringify(v, null, 2))
  } else {
    console.log(`${k}:`, v)
  }
}
