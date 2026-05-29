// Pre-check: identifica patrones de "basura" en cover_letter antes de limpiar.
// Read-only. No modifica nada.
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const secretKey = process.env.SUPABASE_SECRET_KEY!
const supabase = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

const { count: total } = await supabase.from('proposals').select('*', { count: 'exact', head: true })
const { count: withCL } = await supabase.from('proposals').select('*', { count: 'exact', head: true }).not('cover_letter', 'is', null)

console.log(`Total proposals:     ${total}`)
console.log(`Con cover_letter:    ${withCL}\n`)

console.log('Conteo por patrón sospechoso:')
console.log('─────────────────────────────────────────────')

const patterns = [
  { label: 'Empieza con "Untitled ("',         query: 'Untitled (%' },
  { label: 'Contiene "notion.so"',             query: '%notion.so%' },
  { label: 'Contiene "notion.com"',            query: '%notion.com%' },
  { label: 'Empieza con "Untitled"',           query: 'Untitled%' },
]

for (const p of patterns) {
  const { count } = await supabase
    .from('proposals')
    .select('*', { count: 'exact', head: true })
    .like('cover_letter', p.query)
  console.log(`  ${p.label.padEnd(40)} ${count?.toString().padStart(6)}`)
}

// CL "reales" = los que NO matchean ninguno de los patrones de basura
const { count: clean } = await supabase
  .from('proposals')
  .select('*', { count: 'exact', head: true })
  .not('cover_letter', 'is', null)
  .not('cover_letter', 'ilike', 'Untitled%')
  .not('cover_letter', 'ilike', '%notion.so%')
  .not('cover_letter', 'ilike', '%notion.com%')

console.log(`\nCL aparentemente reales (no matchean basura): ${clean}`)

// Sample de los "reales" para validar
console.log('\nSample 3 CL "reales" (primeros 200 chars):')
const { data } = await supabase
  .from('proposals')
  .select('job_title, cover_letter')
  .not('cover_letter', 'is', null)
  .not('cover_letter', 'ilike', 'Untitled%')
  .not('cover_letter', 'ilike', '%notion.so%')
  .not('cover_letter', 'ilike', '%notion.com%')
  .limit(3)

for (const r of (data ?? []) as { job_title: string; cover_letter: string }[]) {
  console.log(`\n  Job: ${r.job_title.slice(0, 70)}`)
  console.log(`  CL:  "${r.cover_letter.slice(0, 200).replace(/\n/g, ' ')}..."`)
}

// Sample de los "basura" para confirmar
console.log('\n\nSample 3 CL "basura" (primeros 200 chars):')
const { data: trash } = await supabase
  .from('proposals')
  .select('job_title, cover_letter')
  .ilike('cover_letter', 'Untitled%')
  .limit(3)

for (const r of (trash ?? []) as { job_title: string; cover_letter: string }[]) {
  console.log(`\n  Job: ${r.job_title.slice(0, 70)}`)
  console.log(`  CL:  "${r.cover_letter.slice(0, 200).replace(/\n/g, ' ')}..."`)
}
