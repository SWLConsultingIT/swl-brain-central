// Lee el JSONL del backtest y agrupa los descartes por categoría de razón.
// Output: markdown legible + CSV simplificado.

import { readFileSync, writeFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) { console.error('usage: backtest-grouped-report.ts <jsonl-path>'); process.exit(1) }

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

const rows: Row[] = readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const discarded = rows.filter(r => !r.brain_match_final)

// Categorizar razón
function categorize(r: Row): string {
  const reason = r.brain_reason.toLowerCase()
  if (/hard exclusion|legal services|attorney|lawyer|legal/i.test(reason)) return 'Legal / abogado'
  if (/civil|mechanical|petroleum|p\.eng|electrical engineer/i.test(reason)) return 'Ingeniería física (civil/mech/petroleum)'
  if (/graphic design|illustration|pure design/i.test(reason)) return 'Diseño gráfico puro'
  if (/medical|healthcare attorney/i.test(reason)) return 'Médico'
  if (/academic writing|federal proposal|grant writing/i.test(reason)) return 'Writing académico/grants/federal'
  if (/recruit|staffing/i.test(reason)) return 'Recruiting/staffing'
  if (/full-time|permanent|head of growth|hire/i.test(reason)) return 'Full-time/permanent (no consulting)'
  if (/ticket|below.*engagement|below.*minimum|budget/i.test(reason)) return 'Ticket bajo (no rentable)'
  if (/no description|missing description|cannot assess/i.test(reason)) return 'Sin description / contexto'
  if (/infrastructure|network engineer|sd-wan|fortigate/i.test(reason)) return 'Infra/Network engineering'
  return 'Otros'
}

const groups = new Map<string, Row[]>()
for (const r of discarded) {
  const cat = categorize(r)
  const list = groups.get(cat) ?? []
  list.push(r)
  groups.set(cat, list)
}

const sortedGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)

// ── Markdown ──────────────────────────────────────────────────────────
const md: string[] = []
md.push(`# Backtest classifier — 200 Sent proposals más recientes`)
md.push(``)
md.push(`Total: ${rows.length} · Brain QUAL: ${rows.length - discarded.length} (${pct(rows.length - discarded.length, rows.length)}%) · Brain DISC: ${discarded.length} (${pct(discarded.length, rows.length)}%)`)
md.push(``)
md.push(`## Los 87 jobs que el brain DESCARTARÍA pero SWL aplicó manualmente`)
md.push(``)
md.push(`Agrupados por razón del descarte:`)
md.push(``)

for (const [cat, list] of sortedGroups) {
  md.push(`### ${cat} — ${list.length} jobs`)
  md.push(``)
  md.push(`| # | Job | Ticket | Keyword | Sent | Razón brain |`)
  md.push(`|---|-----|--------|---------|------|-------------|`)
  list.sort((a, b) => a.brain_score - b.brain_score)
  list.forEach((r, i) => {
    const title = r.job_title.replace(/\|/g, '\\|').slice(0, 80)
    const reason = r.brain_reason.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 200)
    md.push(`| ${i + 1} | ${title} | $${r.ticket ?? '?'} | ${r.keyword ?? '-'} | ${r.sent_date} | ${reason} |`)
  })
  md.push(``)
}

// Resumen ejecutivo
md.push(`## Resumen ejecutivo`)
md.push(``)
md.push(`| Categoría | # jobs | % de descartes |`)
md.push(`|-----------|--------|----------------|`)
for (const [cat, list] of sortedGroups) {
  md.push(`| ${cat} | ${list.length} | ${pct(list.length, discarded.length)}% |`)
}

const mdPath = path.replace(/\.jsonl$/, '.report.md')
writeFileSync(mdPath, md.join('\n'))
console.log(`markdown report: ${mdPath}`)

// ── CSV simplificado para Sheets/Excel ────────────────────────────────
const csvPath = path.replace(/\.jsonl$/, '.discarded.csv')
const header = ['categoria_descarte','job_title','ticket','keyword','sent_date','brain_area','brain_score','brain_reason','upwork_id']
const csv: string[] = [header.join(',')]
for (const [cat, list] of sortedGroups) {
  for (const r of list) {
    csv.push([
      cat,
      r.job_title,
      r.ticket ?? '',
      r.keyword ?? '',
      r.sent_date,
      r.brain_area ?? '',
      r.brain_score,
      r.brain_reason,
      r.upwork_id ?? '',
    ].map(csvEscape).join(','))
  }
}
writeFileSync(csvPath, csv.join('\n'))
console.log(`discarded CSV: ${csvPath}`)

function csvEscape(v: any): string {
  if (v == null) return ''
  const s = String(v)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"'
  return s
}
function pct(n: number, d: number): string { return d === 0 ? '0.0' : (n * 100 / d).toFixed(1) }
