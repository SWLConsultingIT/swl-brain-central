// Brain Central — Status check del estado actual
// Reporta números reales con paginación correcta (no se queda en 1000).

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const secretKey = process.env.SUPABASE_SECRET_KEY!
const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function countTable(table: string): Promise<number> {
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
  return count ?? 0
}

async function countByStatus(table: string): Promise<Map<string, number>> {
  const total = await countTable(table)
  const PAGE = 1000
  const counts = new Map<string, number>()
  for (let offset = 0; offset < total; offset += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('status')
      .range(offset, Math.min(offset + PAGE - 1, total - 1))
    if (error || !data) break
    for (const r of data as { status: string | null }[]) {
      const s = r.status || '(null)'
      counts.set(s, (counts.get(s) || 0) + 1)
    }
  }
  return counts
}

async function topKeywords(table: string, limit = 15): Promise<[string, number][]> {
  const total = await countTable(table)
  const PAGE = 1000
  const counts = new Map<string, number>()
  for (let offset = 0; offset < total; offset += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('keyword')
      .range(offset, Math.min(offset + PAGE - 1, total - 1))
    if (error || !data) break
    for (const r of data as { keyword: string | null }[]) {
      if (!r.keyword) continue
      counts.set(r.keyword, (counts.get(r.keyword) || 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
}

async function buNames(): Promise<string[]> {
  const { data } = await supabase.from('business_units').select('name').order('name')
  return (data ?? []).map((r: { name: string }) => r.name)
}

async function sample(table: string, fields: string, limit = 5, order = 'created_at') {
  const { data } = await supabase
    .from(table)
    .select(fields)
    .order(order, { ascending: false })
    .limit(limit)
  return data ?? []
}

// ──────────────────────────────────────────────
const sep = (s = '') => console.log(`\n══ ${s} ════════════════════════════════════════════`.slice(0, 60))

sep('Counts por tabla')
const businessUnits = await countTable('business_units')
const proposals = await countTable('proposals')
const prospects = await countTable('prospects')
console.log(`  business_units      ${businessUnits}`)
console.log(`  proposals           ${proposals}`)
console.log(`  prospects           ${prospects}`)

sep('business_units — nombres')
for (const n of await buNames()) console.log(`  • ${n}`)

sep('proposals — distribución por status')
for (const [s, c] of [...(await countByStatus('proposals')).entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.toString().padStart(6)}  ${s}`)
}

sep('prospects — distribución por status')
for (const [s, c] of [...(await countByStatus('prospects')).entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.toString().padStart(6)}  ${s}`)
}

sep('proposals — top 15 keywords')
for (const [k, c] of await topKeywords('proposals')) {
  console.log(`  ${c.toString().padStart(5)}  ${k}`)
}

sep('prospects — top 10 keywords')
for (const [k, c] of await topKeywords('prospects', 10)) {
  console.log(`  ${c.toString().padStart(5)}  ${k}`)
}

sep('proposals — 5 más recientes')
type Row = { job_title: string; status: string; ticket: number | null; keyword: string | null; sent_date: string | null }
for (const r of (await sample('proposals', 'job_title, status, ticket, keyword, sent_date', 5, 'sent_date')) as Row[]) {
  console.log(`  [${r.sent_date ?? '----'}] ${r.status.padEnd(15)} $${r.ticket ?? '?'}  ${(r.keyword ?? '-').padEnd(20)} → ${r.job_title.slice(0, 60)}`)
}

sep('prospects — 5 más recientes')
type PRow = { job_title: string; status: string; ticket: number | null; keyword: string | null; created_at: string }
for (const r of (await sample('prospects', 'job_title, status, ticket, keyword, created_at', 5)) as PRow[]) {
  console.log(`  [${r.created_at.slice(0, 10)}] ${r.status.padEnd(18)} $${r.ticket ?? '?'}  ${(r.keyword ?? '-').padEnd(20)} → ${r.job_title.slice(0, 60)}`)
}

console.log()
