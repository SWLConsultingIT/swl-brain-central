// Brain Central — Validación post-migración
// Confirma counts y muestra distribuciones para cerrar Fase 1.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const secretKey = process.env.SUPABASE_SECRET_KEY!
const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function countAll() {
  const tables = ['business_units', 'proposals', 'prospects'] as const
  console.log('═══════════════════════════════════════════════')
  console.log('  Counts por tabla')
  console.log('═══════════════════════════════════════════════')
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true })
    if (error) console.error(`  ${t}: error → ${error.message}`)
    else console.log(`  ${t.padEnd(20)} ${count}`)
  }
  console.log()
}

async function statusDistribution(table: 'proposals' | 'prospects') {
  const { data: rows, error } = await supabase.from(table).select('status')
  if (error || !rows) {
    console.log(`  (no se pudo agrupar ${table}: ${error?.message ?? 'sin data'})`)
    return
  }
  const counts = new Map<string, number>()
  for (const r of rows) {
    const s = (r as { status: string | null }).status || '(null)'
    counts.set(s, (counts.get(s) || 0) + 1)
  }
  console.log(`═══════════════════════════════════════════════`)
  console.log(`  ${table} — distribución por status`)
  console.log(`═══════════════════════════════════════════════`)
  for (const [s, c] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.toString().padStart(6)}  ${s}`)
  }
  console.log()
}

async function topKeywords() {
  const { data, error } = await supabase.from('proposals').select('keyword')
  if (error || !data) return
  const counts = new Map<string, number>()
  for (const r of data) {
    const k = (r as { keyword: string | null }).keyword
    if (!k) continue
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  console.log(`═══════════════════════════════════════════════`)
  console.log(`  proposals — top 15 keywords`)
  console.log(`═══════════════════════════════════════════════`)
  for (const [k, c] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${c.toString().padStart(5)}  ${k}`)
  }
  console.log()
}

async function sampleRows() {
  const { data } = await supabase
    .from('proposals')
    .select('job_title, status, ticket, keyword, sent_date')
    .order('sent_date', { ascending: false, nullsFirst: false })
    .limit(5)
  console.log(`═══════════════════════════════════════════════`)
  console.log(`  proposals — 5 más recientes (sample)`)
  console.log(`═══════════════════════════════════════════════`)
  for (const r of data ?? []) {
    const row = r as { job_title: string; status: string; ticket: number | null; keyword: string | null; sent_date: string | null }
    console.log(`  [${row.sent_date ?? '----'}] ${row.status.padEnd(15)} $${row.ticket ?? '?'}  ${row.keyword ?? '-'}  → ${row.job_title.slice(0, 60)}`)
  }
  console.log()
}

await countAll()
await statusDistribution('proposals')
await statusDistribution('prospects')
await topKeywords()
await sampleRows()
