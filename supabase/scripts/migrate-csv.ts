// Brain Central — Migración CSV de Notion → Supabase
//
// Lee el CSV exportado de Notion (CRM UPWORK ..._all.csv), filtra:
//   - Discarded   → SKIP (decisión Caso B)
//   - status vacío → SKIP
//   - sin Upwork ID → SKIP
//   - Sent/Lost/Closed/Client Reply/Under Revision → proposals
//   - Prospect/Ready to Send/Proposal/Nurturing/Revisar Discarded → prospects
//
// Dedup por upwork_id (UNIQUE en DB + Set en memoria por si CSV tiene duplicados).
// Inserta en batches de 500 vía upsert (onConflict=upwork_id), idempotente.
//
// Correr:
//   pnpm run migrate

import { createClient } from '@supabase/supabase-js'
import { createReadStream } from 'node:fs'
import { parse } from 'csv-parse'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!url || !secretKey) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const CSV_PATH = './CRM UPWORK 249d4ea8d5a68071ae52d25f0bd5a233_all.csv'
const BATCH_SIZE = 500

// ──────────────────────────────────────────────────────────────────
// Status mapping (Notion → bucket + normalized name)
// ──────────────────────────────────────────────────────────────────
const PROPOSAL_STATUSES: Record<string, string> = {
  'Sent 📝': 'Sent',
  'Lost 💀': 'Lost',
  'Closed 💪': 'Closed',
  'Client Reply 🕵️': 'Client Reply',
  'Under Revision': 'Under Revision',
}

const PROSPECT_STATUSES: Record<string, string> = {
  'Prospect 📥': 'Prospect',
  'Ready to Send': 'Ready to Send',
  'Proposal 👀': 'Proposal',
  'Nurturing': 'Nurturing',
  'Revisar Discarded': 'Revisar Discarded',
}

// ──────────────────────────────────────────────────────────────────
// Parsers de campos sucios del CSV
// ──────────────────────────────────────────────────────────────────
function parseTicket(raw: string): { max: number | null; rawStr: string } {
  if (!raw) return { max: null, rawStr: '' }
  const range = raw.match(/\$?\s*([\d.]+)\s*[-–]\s*\$?\s*([\d.]+)/)
  if (range) return { max: parseFloat(range[2]), rawStr: raw }
  const single = raw.match(/\$?\s*([\d.]+)/)
  return { max: single ? parseFloat(single[1]) : null, rawStr: raw }
}

function parseDate(raw: string): string | null {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

function parseTools(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !s.toLowerCase().includes('view job details'))   // descarta basura de Notion
    .filter((s) => !s.toLowerCase().includes('manage your alert'))
    .slice(0, 30)
}

function parseBool(raw: string): boolean | null {
  if (!raw) return null
  const r = raw.toLowerCase().trim()
  if (['yes', 'true', '1', 'sí', 'si'].includes(r)) return true
  if (['no', 'false', '0'].includes(r)) return false
  return null
}

function parseNumeric(raw: string): number | null {
  if (!raw) return null
  const n = parseFloat(raw.replace(/[$,]/g, '').trim())
  return Number.isNaN(n) ? null : n
}

function parseInt32(raw: string): number | null {
  if (!raw) return null
  const n = parseInt(raw.replace(/,/g, '').trim(), 10)
  return Number.isNaN(n) ? null : n
}

// ──────────────────────────────────────────────────────────────────
// Stats + buffers
// ──────────────────────────────────────────────────────────────────
const stats = {
  total: 0,
  skipped_no_status: 0,
  skipped_discarded: 0,
  skipped_other_status: 0,
  skipped_no_upwork_id: 0,
  proposals_inserted: 0,
  prospects_inserted: 0,
  errors: 0,
}

const proposalsBuffer: Record<string, unknown>[] = []
const prospectsBuffer: Record<string, unknown>[] = []
const seenUpworkIds = new Set<string>()

async function flushProposals() {
  if (proposalsBuffer.length === 0) return
  const batch = proposalsBuffer.splice(0)
  const { error } = await supabase
    .from('proposals')
    .upsert(batch, { onConflict: 'upwork_id', ignoreDuplicates: false })
  if (error) {
    console.error('\n❌ Error proposals batch:', error.message)
    stats.errors += batch.length
  } else {
    stats.proposals_inserted += batch.length
  }
}

async function flushProspects() {
  if (prospectsBuffer.length === 0) return
  const batch = prospectsBuffer.splice(0)
  const { error } = await supabase
    .from('prospects')
    .upsert(batch, { onConflict: 'upwork_id', ignoreDuplicates: false })
  if (error) {
    console.error('\n❌ Error prospects batch:', error.message)
    stats.errors += batch.length
  } else {
    stats.prospects_inserted += batch.length
  }
}

async function processRow(row: Record<string, string>) {
  stats.total++

  const rawStatus = (row['Status'] || '').trim()
  if (!rawStatus) {
    stats.skipped_no_status++
    return
  }

  // Discarded → skip (Caso B)
  // Excepción: "Revisar Discarded" sí va a prospects
  if (rawStatus.toLowerCase().includes('discarded') && !rawStatus.toLowerCase().includes('revisar')) {
    stats.skipped_discarded++
    return
  }

  let bucket: 'proposals' | 'prospects' | null = null
  let normalizedStatus = ''

  if (rawStatus in PROPOSAL_STATUSES) {
    bucket = 'proposals'
    normalizedStatus = PROPOSAL_STATUSES[rawStatus]
  } else if (rawStatus in PROSPECT_STATUSES) {
    bucket = 'prospects'
    normalizedStatus = PROSPECT_STATUSES[rawStatus]
  } else {
    stats.skipped_other_status++
    return
  }

  const upworkId = (row['Upwork ID'] || '').trim()
  if (!upworkId) {
    stats.skipped_no_upwork_id++
    return
  }

  if (seenUpworkIds.has(upworkId)) return
  seenUpworkIds.add(upworkId)

  const { max: ticketMax, rawStr: ticketRaw } = parseTicket(row['Ticket'] || '')
  const jobTitle = (row['Job Tittle'] || '').trim() || '(sin título)'

  const common = {
    upwork_id: upworkId,
    job_title: jobTitle,
    description: row['Description'] || null,
    ai_summary: row['AI Summary'] || null,
    ticket: ticketMax,
    ticket_raw: ticketRaw || null,
    keyword: (row['Keyword'] || '').trim() || null,
    status: normalizedStatus,
    link: row['Link'] || null,
    raw_data: row,
  }

  if (bucket === 'proposals') {
    proposalsBuffer.push({
      ...common,
      cover_letter: row['📄 Cover Letters'] || null,
      sent_date: parseDate(row['Sent Date 2'] || row['Sent Date'] || ''),
      tools: parseTools(row['Tools'] || ''),
      country: row['Country'] || null,
      payment_method: row['Payment method'] || null,
      total_spent: parseNumeric(row['Total Spent'] || ''),
      proposals_count: parseInt32(row['Proposals'] || ''),
      interviewing: parseBool(row['Interviewing'] || ''),
    })
    if (proposalsBuffer.length >= BATCH_SIZE) await flushProposals()
  } else {
    prospectsBuffer.push({
      ...common,
      ticket_passes: ticketMax !== null && ticketMax >= 40,
    })
    if (prospectsBuffer.length >= BATCH_SIZE) await flushProspects()
  }
}

// ──────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────
console.log(`🚀 Migrando ${CSV_PATH} → Supabase`)
console.log(`   Project: ${url}`)
console.log()

const startedAt = Date.now()

const parser = createReadStream(CSV_PATH).pipe(
  parse({
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true,
  }),
)

let lastReport = 0
for await (const row of parser) {
  try {
    await processRow(row as Record<string, string>)
  } catch (e) {
    stats.errors++
    console.error('\n⚠️  Error en fila:', (e as Error).message)
  }
  if (stats.total - lastReport >= 1000) {
    process.stdout.write(
      `\r   ${stats.total} procesadas → proposals: ${stats.proposals_inserted + proposalsBuffer.length}, prospects: ${stats.prospects_inserted + prospectsBuffer.length}`,
    )
    lastReport = stats.total
  }
}

await flushProposals()
await flushProspects()

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
console.log('\n')
console.log('═══════════════════════════════════════════════')
console.log('  ✅ Migración completa')
console.log('═══════════════════════════════════════════════')
console.log(`  Tiempo:                  ${elapsed}s`)
console.log(`  Total filas leídas:      ${stats.total}`)
console.log(`  Skipped (sin status):    ${stats.skipped_no_status}`)
console.log(`  Skipped (discarded):     ${stats.skipped_discarded}`)
console.log(`  Skipped (otro status):   ${stats.skipped_other_status}`)
console.log(`  Skipped (sin UpworkID):  ${stats.skipped_no_upwork_id}`)
console.log(`  ──────────────────────────`)
console.log(`  → proposals insertadas:  ${stats.proposals_inserted}`)
console.log(`  → prospects insertadas:  ${stats.prospects_inserted}`)
console.log(`  ──────────────────────────`)
console.log(`  Errores:                 ${stats.errors}`)
console.log()
