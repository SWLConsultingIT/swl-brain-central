// Lee un JSONL de backtest-classifier-on-proposals.ts y genera reporte legible.
// Uso:
//   node --env-file=.env.local --experimental-strip-types \
//     supabase/scripts/backtest-report.ts out/backtest-classifier-<stamp>.jsonl

import { readFileSync, writeFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) { console.error('usage: backtest-report.ts <jsonl-path>'); process.exit(1) }

type Row = {
  proposal_id: string
  upwork_id: string | null
  job_title: string
  sent_date: string
  ticket: number | null
  keyword: string | null
  human_status: string
  brain_match_raw: boolean
  brain_match_final: boolean
  override_applied: boolean
  brain_score: number
  brain_area: string | null
  brain_reason: string
}

const rows: Row[] = readFileSync(path, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(l => JSON.parse(l))

const total = rows.length
const qual = rows.filter(r => r.brain_match_final).length
const disc = rows.filter(r => !r.brain_match_final).length
const llmQual = rows.filter(r => r.brain_match_raw).length
const overrides = rows.filter(r => r.override_applied).length

console.log('═'.repeat(80))
console.log(`  BACKTEST REPORT — ${total} proposals (all status=Sent, humans aplicaron)`)
console.log('═'.repeat(80))
console.log()
console.log(`  Brain final (con override prod):`)
console.log(`    QUALIFIED (brain también aplicaría): ${qual} (${pct(qual,total)}%)`)
console.log(`    DISCARDED (brain descartaría):       ${disc} (${pct(disc,total)}%)`)
console.log()
console.log(`  Desglose:`)
console.log(`    LLM dijo match=true:        ${llmQual}`)
console.log(`    Override agregó qualified:  ${overrides}`)
console.log()

// ── Lista de descartes ───────────────────────────────────────────────
const discarded = rows.filter(r => !r.brain_match_final)
  .sort((a, b) => a.brain_score - b.brain_score)

console.log('═'.repeat(80))
console.log(`  GAP: ${discarded.length} jobs que humanos APLICARON pero brain DESCARTARÍA`)
console.log('═'.repeat(80))
console.log()

for (const r of discarded) {
  console.log(`─`.repeat(80))
  console.log(`  ${r.job_title}`)
  console.log(`  sent: ${r.sent_date}  ticket: $${r.ticket ?? '?'}  keyword: ${r.keyword ?? '-'}  area: ${r.brain_area ?? 'null'}  score: ${r.brain_score}`)
  console.log(`  reason: ${r.brain_reason}`)
}

// ── Patrones agregados ───────────────────────────────────────────────
console.log()
console.log('═'.repeat(80))
console.log(`  PATRONES en los descartes`)
console.log('═'.repeat(80))

const byArea = new Map<string, number>()
const byKeyword = new Map<string, number>()
const byTicketBand = new Map<string, number>()

for (const r of discarded) {
  const area = r.brain_area ?? '(null)'
  byArea.set(area, (byArea.get(area) ?? 0) + 1)
  const kw = r.keyword ?? '(none)'
  byKeyword.set(kw, (byKeyword.get(kw) ?? 0) + 1)
  const t = r.ticket ?? 0
  const band = t < 40 ? '<$40' : t < 100 ? '$40-99' : t < 500 ? '$100-499' : '$500+'
  byTicketBand.set(band, (byTicketBand.get(band) ?? 0) + 1)
}

console.log()
console.log(`  Por área (BU asignada por brain o null):`)
for (const [k, v] of [...byArea.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(45)} ${v}`)
console.log()
console.log(`  Por keyword scrape origen:`)
for (const [k, v] of [...byKeyword.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(45)} ${v}`)
console.log()
console.log(`  Por banda de ticket:`)
for (const [k, v] of [...byTicketBand.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(45)} ${v}`)

// ── CSV export ───────────────────────────────────────────────────────
const csvPath = path.replace(/\.jsonl$/, '.csv')
const header = ['proposal_id','upwork_id','job_title','sent_date','ticket','keyword','human_status','brain_match_final','override_applied','brain_score','brain_area','brain_reason']
const csv = [header.join(',')]
for (const r of rows) {
  csv.push(header.map(h => csvEscape((r as any)[h])).join(','))
}
writeFileSync(csvPath, csv.join('\n'))
console.log()
console.log(`  CSV: ${csvPath}`)

function csvEscape(v: any): string {
  if (v == null) return ''
  const s = String(v)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

function pct(n: number, d: number): string {
  return d === 0 ? '0.0' : (n * 100 / d).toFixed(1)
}
