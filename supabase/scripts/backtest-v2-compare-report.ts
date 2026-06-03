// Genera reporte comparativo: backtest viejo vs nuevo (con fix).
// Output: markdown + CSV.

import { readFileSync, writeFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) { console.error('usage: backtest-v2-compare-report.ts <v2-jsonl>'); process.exit(1) }

type Row = {
  proposal_id: string
  job_title: string
  sent_date: string
  ticket: number | null
  keyword: string | null
  old_match_final: boolean
  old_area: string | null
  old_score: number
  old_reason: string
  new_match_raw: boolean
  new_match_final: boolean
  new_area: string | null
  new_score: number
  new_reason: string
  changed: boolean
  flip_direction: string | null
}

const rows: Row[] = readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))

const oldQual = rows.filter(r => r.old_match_final).length
const newQual = rows.filter(r => r.new_match_final).length
const flippedToQual = rows.filter(r => r.flip_direction === 'disc→qual')
const flippedToDisc = rows.filter(r => r.flip_direction === 'qual→disc')
const unchanged = rows.filter(r => !r.changed)

console.log('═'.repeat(80))
console.log(`  COMPARACIÓN BACKTEST: viejo classifier vs nuevo (capas 1-7)`)
console.log(`  ${rows.length} jobs total (todos status=Sent — humanos aplicaron)`)
console.log('═'.repeat(80))
console.log()
console.log(`  ANTES (viejo classifier):`)
console.log(`    QUALIFIED: ${oldQual}/${rows.length} (${pct(oldQual, rows.length)}%)`)
console.log(`    DISCARDED: ${rows.length - oldQual}/${rows.length}`)
console.log()
console.log(`  AHORA (nuevo classifier con fix):`)
console.log(`    QUALIFIED: ${newQual}/${rows.length} (${pct(newQual, rows.length)}%)  ${newQual > oldQual ? '⬆' : '⬇'} ${Math.abs(newQual - oldQual)}`)
console.log(`    DISCARDED: ${rows.length - newQual}/${rows.length}`)
console.log()
console.log(`  CAMBIOS:`)
console.log(`    Recuperados (disc → qual): ${flippedToQual.length}  ⭐`)
console.log(`    Regresiones (qual → disc): ${flippedToDisc.length}  ${flippedToDisc.length > 0 ? '⚠' : '✓'}`)
console.log(`    Sin cambio:                ${unchanged.length}`)
console.log()

// Distribución de áreas en los recuperados
console.log('═'.repeat(80))
console.log(`  RECUPERADOS por BU (los ${flippedToQual.length} que el fix rescató)`)
console.log('═'.repeat(80))
const byArea = new Map<string, number>()
for (const r of flippedToQual) {
  const a = r.new_area ?? '(sin area)'
  byArea.set(a, (byArea.get(a) ?? 0) + 1)
}
for (const [area, n] of [...byArea.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${area.padEnd(50)} ${n}`)
}
console.log()

// Sample de regresiones (importante)
if (flippedToDisc.length > 0) {
  console.log('═'.repeat(80))
  console.log(`  ⚠ REGRESIONES — jobs que antes pasaban y ahora se descartan`)
  console.log('═'.repeat(80))
  for (const r of flippedToDisc.slice(0, 10)) {
    console.log(`  ${r.job_title.slice(0, 70)}`)
    console.log(`    ticket=$${r.ticket} · viejo area=${r.old_area ?? '-'} score=${r.old_score} → nuevo area=${r.new_area ?? '-'} score=${r.new_score}`)
    console.log(`    nueva razón: ${r.new_reason.slice(0, 120)}`)
    console.log()
  }
}

// CSV completo para Numbers
const csvPath = path.replace(/\.jsonl$/, '.csv')
const header = [
  'cambio', 'job_title', 'ticket', 'keyword', 'sent_date',
  'viejo_decision', 'viejo_area', 'viejo_score', 'viejo_razon',
  'nuevo_decision', 'nuevo_area', 'nuevo_score', 'nuevo_razon',
]
const csv = [header.join(',')]
// Orden: primero los flipped to qual (recuperados), después regresiones, después unchanged
const sorted = [
  ...flippedToQual,
  ...flippedToDisc,
  ...unchanged,
]
for (const r of sorted) {
  const cambio = r.flip_direction === 'disc→qual' ? '⭐ RECUPERADO'
    : r.flip_direction === 'qual→disc' ? '⚠ REGRESIÓN'
    : 'sin cambio'
  csv.push([
    cambio,
    r.job_title,
    r.ticket ?? '',
    r.keyword ?? '',
    r.sent_date,
    r.old_match_final ? 'QUALIFIED' : 'DISCARDED',
    r.old_area ?? '',
    r.old_score,
    r.old_reason,
    r.new_match_final ? 'QUALIFIED' : 'DISCARDED',
    r.new_area ?? '',
    r.new_score,
    r.new_reason,
  ].map(csvEscape).join(','))
}
writeFileSync(csvPath, csv.join('\n'))
console.log(`  CSV: ${csvPath}`)

function csvEscape(v: any): string {
  if (v == null) return ''
  const s = String(v)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"'
  return s
}
function pct(n: number, d: number): string { return d === 0 ? '0.0' : (n * 100 / d).toFixed(1) }
