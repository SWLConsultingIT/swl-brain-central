// Asigna business_unit_id a TODAS las proposals históricas (Sent + Lost +
// Closed + Client Reply + Under Revision) usando keyword matching contra
// las 8 BU cards. Determinístico, sin LLM.
//
// Por qué a todas: el win rate por BU (v_bu_winrate) necesita ambos lados —
// Sent y Lost — para calcular bien. Si solo asignamos a Sent, el ratio es
// engañoso (100% en todo).
//
// Lógica por proposal:
//   1. Score por BU = matches de la BU.keywords[] en (proposal.keyword + job_title)
//   2. Pick la BU con score más alto
//   3. Si score = 0 → leave NULL
//
// Idempotente: re-asigna a todas, sobrescribe valores previos.
//
// Run: node --env-file=.env.local supabase/scripts/assign-bu-to-sent.ts

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const secretKey = process.env.SUPABASE_SECRET_KEY!
const supabase = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

type BU = { id: string; name: string; keywords: string[] }
type Proposal = { id: string; keyword: string | null; job_title: string | null }

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function scoreBU(bu: BU, haystack: string): number {
  // Match exacto de cada keyword de la BU dentro del haystack normalizado.
  // Tokens cortos (≤2 chars) se ignoran para evitar falsos positivos.
  let score = 0
  for (const kw of bu.keywords) {
    const norm = normalize(kw)
    if (norm.length <= 2) continue
    if (haystack.includes(norm)) score += 1
  }
  return score
}

console.log('Cargando BU cards...')
const { data: busData, error: buErr } = await supabase
  .from('business_units')
  .select('id, name, keywords')
  .eq('is_active', true)

if (buErr || !busData) throw new Error('cannot load BUs: ' + (buErr?.message ?? 'empty'))
const bus: BU[] = busData as BU[]
console.log(`  ${bus.length} BU cards cargadas.`)

console.log('\nCargando TODAS las proposals (Sent + Lost + Closed + ClientReply + UnderRevision)...')
const PAGE = 1000
let from = 0
const proposals: Proposal[] = []
while (true) {
  const { data, error } = await supabase
    .from('proposals')
    .select('id, keyword, job_title, status')
    .in('status', ['Sent', 'Lost', 'Closed', 'Client Reply', 'Under Revision'])
    .range(from, from + PAGE - 1)
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) break
  proposals.push(...(data as Proposal[]))
  if (data.length < PAGE) break
  from += PAGE
}
console.log(`  ${proposals.length} proposals cargadas (todos los status del histórico).`)

console.log('\nClasificando...')
const buCounts = new Map<string, number>()
let assigned = 0
let zeroScore = 0
const updates: { id: string; business_unit_id: string }[] = []

for (const p of proposals) {
  const haystack = normalize([p.keyword ?? '', p.job_title ?? ''].join(' '))
  if (!haystack) {
    zeroScore++
    continue
  }
  let best: { bu: BU; score: number } | null = null
  for (const bu of bus) {
    const s = scoreBU(bu, haystack)
    if (s > (best?.score ?? 0)) best = { bu, score: s }
  }
  if (!best || best.score === 0) {
    zeroScore++
    continue
  }
  updates.push({ id: p.id, business_unit_id: best.bu.id })
  buCounts.set(best.bu.name, (buCounts.get(best.bu.name) ?? 0) + 1)
  assigned++
}

console.log(`  ${assigned} asignadas / ${zeroScore} con score 0 (NULL)`)
console.log('\nBreakdown por BU:')
const ordered = [...buCounts.entries()].sort((a, b) => b[1] - a[1])
for (const [name, n] of ordered) console.log(`  ${n.toString().padStart(4)}  ${name}`)

if (updates.length === 0) {
  console.log('\nNada que actualizar. Salgo.')
  process.exit(0)
}

console.log(`\nEscribiendo ${updates.length} business_unit_id a Supabase (en lotes de 500)...`)
const BATCH = 500
let done = 0
for (let i = 0; i < updates.length; i += BATCH) {
  const batch = updates.slice(i, i + BATCH)
  // Update por lote: una row a la vez (PostgREST no permite UPDATE bulk con valores distintos).
  // Para eficiencia usamos upsert manual via id.
  const promises = batch.map(u =>
    supabase.from('proposals').update({ business_unit_id: u.business_unit_id }).eq('id', u.id),
  )
  const results = await Promise.all(promises)
  const errs = results.filter(r => r.error)
  if (errs.length > 0) {
    console.error(`  ERROR en batch ${i}-${i + batch.length}:`, errs[0].error)
    process.exit(1)
  }
  done += batch.length
  console.log(`  ${done}/${updates.length}`)
}

console.log(`\n✓ Hecho. ${done} proposals Sent ahora tienen business_unit_id asignada.`)
