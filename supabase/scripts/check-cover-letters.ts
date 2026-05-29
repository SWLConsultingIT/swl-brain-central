// Diagnóstico de cover_letter en proposals
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const secretKey = process.env.SUPABASE_SECRET_KEY!
const supabase = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

// Total
const { count: total } = await supabase.from('proposals').select('*', { count: 'exact', head: true })

// Con cover letter
const { count: withCL } = await supabase.from('proposals').select('*', { count: 'exact', head: true }).not('cover_letter', 'is', null)

// Por status: cuántos tienen cover letter
const statuses = ['Sent', 'Lost', 'Closed', 'Client Reply', 'Under Revision']
console.log(`Total proposals:           ${total}`)
console.log(`Con cover_letter:          ${withCL}  (${((withCL! / total!) * 100).toFixed(1)}%)`)
console.log(`Sin cover_letter (null):   ${total! - withCL!}\n`)

console.log('Desglose por status:')
console.log('Status            Total   ConCL   %ConCL')
console.log('───────────────────────────────────────────')
for (const s of statuses) {
  const { count: t } = await supabase.from('proposals').select('*', { count: 'exact', head: true }).eq('status', s)
  const { count: c } = await supabase.from('proposals').select('*', { count: 'exact', head: true }).eq('status', s).not('cover_letter', 'is', null)
  if (t === null || c === null) continue
  const pct = t > 0 ? ((c / t) * 100).toFixed(1) : '0.0'
  console.log(`  ${s.padEnd(16)} ${t.toString().padStart(5)}  ${c.toString().padStart(5)}   ${pct}%`)
}

// Sample de un Sent SIN cover letter
console.log('\nSample: 3 proposals Sent SIN cover letter:')
const { data: noCL } = await supabase
  .from('proposals')
  .select('upwork_id, job_title, sent_date, keyword')
  .eq('status', 'Sent')
  .is('cover_letter', null)
  .limit(3)
for (const r of (noCL ?? []) as { upwork_id: string; job_title: string; sent_date: string | null; keyword: string | null }[]) {
  console.log(`  [${r.sent_date ?? '----'}] ${r.keyword ?? '-'} — ${r.job_title.slice(0, 70)}`)
}

console.log('\nSample: 3 proposals Sent CON cover letter:')
const { data: withCLData } = await supabase
  .from('proposals')
  .select('job_title, sent_date, cover_letter')
  .eq('status', 'Sent')
  .not('cover_letter', 'is', null)
  .limit(3)
for (const r of (withCLData ?? []) as { job_title: string; sent_date: string | null; cover_letter: string }[]) {
  console.log(`  [${r.sent_date ?? '----'}] ${r.job_title.slice(0, 70)}`)
  console.log(`    CL preview: "${r.cover_letter.slice(0, 100).replace(/\n/g, ' ')}..."\n`)
}
