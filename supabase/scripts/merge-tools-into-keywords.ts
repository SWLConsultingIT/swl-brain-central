// Merge tools array into keywords (dedupeado, case-insensitive)
// Después de correr esto, la columna `tools` queda inútil → la dropeamos por separado.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const secretKey = process.env.SUPABASE_SECRET_KEY!
const supabase = createClient(url, secretKey, { auth: { persistSession: false } })

const { data: bus, error } = await supabase.from('business_units').select('id, name, keywords, tools')
if (error || !bus) {
  console.error('Error fetch:', error)
  process.exit(1)
}

console.log(`Procesando ${bus.length} BU cards...\n`)

for (const bu of bus as { id: string; name: string; keywords: string[]; tools: string[] }[]) {
  const seen = new Set<string>()
  const merged: string[] = []
  // Mantengo el orden original: primero keywords, después tools que no estaban
  for (const k of [...bu.keywords, ...bu.tools]) {
    const key = k.toLowerCase().trim()
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(k)
    }
  }

  const added = merged.length - bu.keywords.length
  console.log(`  ${bu.name.padEnd(45)} keywords ${bu.keywords.length} + tools ${bu.tools.length} → ${merged.length} (${added} nuevas)`)

  const { error: upErr } = await supabase
    .from('business_units')
    .update({ keywords: merged })
    .eq('id', bu.id)
  if (upErr) console.error(`    ❌ error: ${upErr.message}`)
}

console.log('\n✅ Merge listo. Próximo paso: DROP COLUMN tools (manual via SQL).')
