// Seed 5 jobs reales del CSV de Notion en la tabla `jobs`.
// Idempotente: upsert por upwork_id.
//
// Run: node --env-file=.env.local supabase/scripts/seed-sample-jobs.ts
import { createClient } from '@supabase/supabase-js'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'node:fs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const secretKey = process.env.SUPABASE_SECRET_KEY!
const supabase = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

const CSV_PATH = 'CRM UPWORK 249d4ea8d5a68071ae52d25f0bd5a233_all.csv'

// Keywords variadas para asegurar diversidad de BU al testear el classifier.
// Por cada keyword tomamos el primer job que tenga ticket >= $40 USD
// (sino el ticket filter lo descarta antes del LLM).
const TARGET_KEYWORDS = ['CFO', 'Financial Modeler', 'CRM', 'AI', 'Web Development']
const MIN_TICKET = 40

function extractUpworkId(link: string): string | null {
  // Upwork links: https://www.upwork.com/jobs/~021954021081756458844?...
  const m = link.match(/~(\d+)/)
  return m ? m[1] : null
}

function parseTicketRaw(raw: string): { ticket: number | null; currency: string } {
  if (!raw) return { ticket: null, currency: 'USD' }
  const currencyMatch = raw.match(/[$€£]/)
  const currency = currencyMatch?.[0] === '€' ? 'EUR' : currencyMatch?.[0] === '£' ? 'GBP' : 'USD'
  const rangeMatch = raw.match(/[\d.]+\s*[-–]\s*([\d.]+)/)
  if (rangeMatch) return { ticket: parseFloat(rangeMatch[1]), currency }
  const single = raw.match(/([\d.]+)/)
  return { ticket: single ? parseFloat(single[1]) : null, currency }
}

function parseDate(raw: string): string | null {
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

console.log(`Leyendo ${CSV_PATH} ...`)
const csv = readFileSync(CSV_PATH, 'utf8')
const rows: any[] = parse(csv, {
  columns: true,
  skip_empty_lines: true,
  relax_quotes: true,
  relax_column_count: true,
  bom: true,
})
console.log(`Filas totales en CSV: ${rows.length}`)

// Selecciona 1 job representativo por cada keyword target.
// Requiere: Link válido (de ahí extraemos el upwork_id real porque el
// campo "Upwork ID" del CSV viene redondeado por export de Notion como
// number) Y ticket parseado en USD >= MIN_TICKET (así los jobs pasan el
// ticket filter y llegan al LLM).
const samples: any[] = []
for (const kw of TARGET_KEYWORDS) {
  const match = rows.find(r => {
    const rowKw = (r['Keyword'] ?? '').toString()
    const link = (r['Link'] ?? '').toString().trim()
    const title = (r['Job Tittle'] ?? '').toString().trim()
    const { ticket, currency } = parseTicketRaw((r['Ticket'] ?? '').toString().trim())
    return (
      rowKw.toLowerCase().includes(kw.toLowerCase()) &&
      extractUpworkId(link) &&
      title &&
      currency === 'USD' &&
      ticket != null &&
      ticket >= MIN_TICKET
    )
  })
  if (match) samples.push(match)
}

console.log(`Jobs seleccionados: ${samples.length}`)
if (samples.length === 0) {
  console.error('No se encontró ningún job en el CSV con los keywords target.')
  process.exit(1)
}

// Mapeo CSV → jobs.
// upwork_id se extrae del LINK (formato `~021...`), no del campo "Upwork ID"
// del CSV (viene redondeado porque Notion lo exportó como number).
const records = samples.map(r => {
  const ticketRaw = (r['Ticket'] ?? '').toString().trim()
  const { ticket, currency } = parseTicketRaw(ticketRaw)
  const link = (r['Link'] ?? '').toString().trim()
  return {
    upwork_id:        extractUpworkId(link),
    link:             link || null,
    title:            (r['Job Tittle'] ?? '').toString().trim(),
    description:      (r['Description'] ?? '').toString().trim() || null,
    ticket,
    ticket_raw:       ticketRaw || null,
    ticket_currency:  currency,
    hourly_average:   parseFloat(r['Hourly Average']) || null,
    duration:         (r['Duration'] ?? '').toString().trim() || null,
    country:          (r['Country'] ?? '').toString().trim() || null,
    city_region:      (r['City / Region'] ?? '').toString().trim() || null,
    english_level:    (r['English level'] ?? '').toString().trim() || null,
    talent_type:      (r['Talent Type'] ?? '').toString().trim() || null,
    industry:         (r['Industry'] ?? '').toString().trim() || null,
    proposals_count:  parseInt(r['Proposals']) || null,
    post_date:        parseDate(r['Job Post Date']),
    status:           'new',
  }
})

console.log('\nSample preview:')
for (const r of records) {
  console.log(`- [${r.ticket_currency} ${r.ticket ?? '?'}] ${r.title.slice(0, 60)}... (upwork_id: ${r.upwork_id})`)
}

// Upsert por upwork_id
const { error, count } = await supabase
  .from('jobs')
  .upsert(records, { onConflict: 'upwork_id', count: 'exact' })

if (error) {
  console.error('\nERROR insertando:', error)
  process.exit(1)
}

console.log(`\n✓ Upserted ${count} jobs.`)

const { count: total } = await supabase.from('jobs').select('*', { count: 'exact', head: true })
console.log(`✓ Total jobs en la tabla ahora: ${total}`)
