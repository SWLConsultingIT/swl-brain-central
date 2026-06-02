// Aplica un JSONL del curador a Supabase:
//   1. UPDATE proposals.business_unit_id = bu_id WHERE id = proposal_id
//      (solo cuando confidence >= 0.7 y bu_id != null)
//   2. RPC curator_merge_into_bu(bu_id, new_scope, new_keywords)
//      → enriquece la BU card con scope/keywords nuevos (dedup case-insensitive)
//
// Idempotente: re-correrlo no rompe nada. Los UPDATEs vuelven a poner el mismo
// valor. La función SQL dedupea scopes/keywords case-insensitive.
//
// Run:
//   node --env-file=.env.local supabase/scripts/curator-apply-jsonl.ts <path-to-jsonl>
//
// Si no se pasa path, usa el JSONL más reciente en out/.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
if (!url || !secret) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY missing')

const supabase = createClient(url, secret, { auth: { persistSession: false } })

const CONFIDENCE_FLOOR = 0.7

// ── Pick JSONL ─────────────────────────────────────────────────────────
const argPath = process.argv[2]
let jsonlPath: string
if (argPath) {
  jsonlPath = argPath
} else {
  const files = readdirSync('out')
    .filter(f => f.startsWith('curator-run-') && f.endsWith('.jsonl'))
    .sort()
  if (files.length === 0) throw new Error('no curator-run-*.jsonl files in out/')
  jsonlPath = join('out', files[files.length - 1])
}
console.log(`Leyendo: ${jsonlPath}`)

const lines = readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean)
console.log(`  ${lines.length} líneas.\n`)

type Row = {
  proposal_id: string
  upwork_id: string | null
  job_title: string
  status: string | null
  previous_bu_id: string | null
  bu_name: string | null
  bu_id: string | null
  new_scope: string | null
  new_keywords: string[]
  confidence: number | null
  would_skip: boolean
  parse_error: string | null
}

const rows = lines.map(l => JSON.parse(l) as Row)

// ── Stats antes ────────────────────────────────────────────────────────
const skipped = {
  parse_error: 0,
  low_confidence: 0,
  no_bu: 0,
}
const eligible: Row[] = []
for (const r of rows) {
  if (r.parse_error) {
    skipped.parse_error++
    continue
  }
  if ((r.confidence ?? 0) < CONFIDENCE_FLOOR) {
    skipped.low_confidence++
    continue
  }
  if (!r.bu_id) {
    skipped.no_bu++
    continue
  }
  eligible.push(r)
}

console.log(`Filtrado:`)
console.log(`  eligible (escribibles):  ${eligible.length}`)
console.log(`  skipped parse_error:     ${skipped.parse_error}`)
console.log(`  skipped confidence<0.7:  ${skipped.low_confidence}`)
console.log(`  skipped sin bu_name:     ${skipped.no_bu}`)

if (eligible.length === 0) {
  console.log('\nNada que aplicar. Salgo.')
  process.exit(0)
}

// ── Aplicar UPDATEs + RPC merges ───────────────────────────────────────
console.log(`\nAplicando a Supabase...\n`)
let updated = 0
let merged = 0
const errors: string[] = []

for (let i = 0; i < eligible.length; i++) {
  const r = eligible[i]

  // 1) UPDATE proposals.business_unit_id
  const upd = await supabase
    .from('proposals')
    .update({ business_unit_id: r.bu_id })
    .eq('id', r.proposal_id)
  if (upd.error) {
    errors.push(`UPDATE ${r.proposal_id}: ${upd.error.message}`)
  } else {
    updated++
  }

  // 2) RPC curator_merge_into_bu (solo si hay scope o keywords reales)
  if (r.bu_id && (r.new_scope || (r.new_keywords && r.new_keywords.length > 0))) {
    const rpc = await supabase.rpc('curator_merge_into_bu', {
      p_bu_id: r.bu_id,
      p_new_scope: r.new_scope ?? '',
      p_new_kws: r.new_keywords ?? [],
    })
    if (rpc.error) {
      errors.push(`RPC ${r.proposal_id}: ${rpc.error.message}`)
    } else {
      merged++
    }
  }

  if ((i + 1) % 20 === 0 || i === eligible.length - 1) {
    console.log(`  ${i + 1}/${eligible.length}`)
  }
}

// ── Resumen ────────────────────────────────────────────────────────────
console.log(`\n✓ Aplicado.`)
console.log(`  proposals.business_unit_id actualizadas: ${updated}`)
console.log(`  business_units cards enriquecidas:       ${merged} merges`)
console.log(`  errores:                                  ${errors.length}`)
if (errors.length > 0) {
  console.log(`\nErrores:`)
  for (const e of errors.slice(0, 10)) console.log(`  - ${e}`)
  if (errors.length > 10) console.log(`  ... y ${errors.length - 10} más.`)
}
