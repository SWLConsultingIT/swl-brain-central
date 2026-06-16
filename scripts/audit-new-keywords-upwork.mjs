// Llama Upwork API directamente para cada KEYWORD NUEVA y mide el pool real
// No usa n8n, no toca Supabase
import { createClient } from '@supabase/supabase-js'

const TOKEN = process.env.UPWORK_TOKEN
if (!TOKEN) {
  console.error('Falta UPWORK_TOKEN env var')
  process.exit(1)
}

const NEW_KEYWORDS = [
  // Sales & Customer Success (12)
  'RevOps', 'Sales Operations', 'Customer Success Manager', 'Account Executive',
  'Sales Enablement', 'Pipeline Management', 'SDR', 'BDR', 'Outbound Sales',
  'Inside Sales', 'Sales Strategy', 'Customer Retention',
  // Org Strategy (7)
  'Organizational Design', 'Change Management', 'Strategic Planning',
  'Operating Model', 'Business Transformation', 'OKR', 'Strategic Initiatives',
  // System Integrations (9)
  'API Integration', 'Webhook', 'Middleware', 'ETL', 'Data Pipeline',
  'REST API', 'iPaaS', 'Workato', 'Tray.io',
  // Financial new (8)
  'FP&A', 'Fractional CFO', 'Fundraising', 'SaaS Finance',
  'Unit Economics', 'ARR', 'Cap Table', 'Pricing Strategy',
  // Business new (5)
  'Process Improvement', 'Operations Manager', 'Director of Operations',
  'Fractional COO', 'COO',
  // Automation-BI new (10)
  'AI Engineer', 'ML Engineer', 'OpenAI', 'Anthropic', 'Gemini',
  'Whisper', 'Vector Database', 'Fine-tuning', 'dbt', 'Fivetran',
  // Market new (6) — Brand & Performance
  'Brand Strategy', 'Performance Marketing', 'Paid Ads',
  'Conversion Optimization', 'Landing Page', 'Copywriting',
  'Positioning', 'Account Manager',
]

const QUERY = `query FindJobs($filter: MarketplaceJobPostingsSearchFilter!, $searchType: MarketplaceJobPostingSearchType!, $sort: [MarketplaceJobPostingSearchSortAttribute!]) {
  marketplaceJobPostingsSearch(marketPlaceJobFilter: $filter, searchType: $searchType, sortAttributes: $sort) {
    totalCount
    edges { node { id job { id title createdDateTime } } }
  }
}`

function buildVariables(term) {
  return {
    filter: {
      verifiedPaymentOnly_eq: true,
      clientHiresRange_eq: { rangeStart: 1 },
      locations_any: [
        'United States','Canada','Argentina','Spain','Mexico','Bahamas','Brazil',
        'British Virgin Islands','Chile','Colombia','Costa Rica','Dominican Republic',
        'Ireland','Italy','Panama','Peru','Paraguay','United Kingdom','Switzerland',
        'Uruguay','New Zealand','Australia',
      ],
      proposalRange_eq: { rangeEnd: 30 },
      jobType_eq: 'HOURLY',
      hourlyRate_eq: { rangeStart: 25 },
      searchExpression_eq: `"${term}"`,
      pagination_eq: { first: 50, after: '1' },
    },
    searchType: 'USER_JOBS_SEARCH',
    sort: [{ field: 'RECENCY' }],
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
)

// Get all upwork_ids we have in DB
const { data: existing } = await supabase.from('jobs').select('upwork_id')
const existingIds = new Set((existing ?? []).map(j => j.upwork_id))
console.log(`Jobs en DB actualmente: ${existingIds.size}`)
console.log()

const results = []
const allJobIds = new Set()
const allNewIds = new Set()

for (const term of NEW_KEYWORDS) {
  const r = await fetch('https://api.upwork.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: QUERY, variables: buildVariables(term) }),
  })
  const j = await r.json()
  if (j.errors) {
    console.log(`❌ ${term}: ERROR - ${JSON.stringify(j.errors).slice(0, 100)}`)
    continue
  }
  const search = j?.data?.marketplaceJobPostingsSearch
  if (!search) {
    console.log(`⚠  ${term}: respuesta sin search`)
    continue
  }
  const totalCount = search.totalCount ?? 0
  const edges = search.edges ?? []
  const ids = edges.map(e => e?.node?.id).filter(Boolean)
  const newOnes = ids.filter(id => !existingIds.has(id))
  for (const id of ids) allJobIds.add(id)
  for (const id of newOnes) allNewIds.add(id)
  results.push({ term, totalCount, returned: edges.length, newOnes: newOnes.length })
  console.log(`  ${term.padEnd(32)} totalCount=${String(totalCount).padStart(4)}  returned=${String(edges.length).padStart(3)}  net new=${String(newOnes.length).padStart(3)}`)
}

console.log()
console.log('═══════════════════════════════════════════════')
console.log('  RESUMEN')
console.log('═══════════════════════════════════════════════')
console.log(`Keywords probadas:           ${NEW_KEYWORDS.length}`)
console.log(`Jobs únicos totales (todas): ${allJobIds.size}`)
console.log(`Jobs NUEVOS (no en DB):      ${allNewIds.size}`)
console.log(`Suma de totalCount:          ${results.reduce((s, r) => s + r.totalCount, 0)}`)
console.log()
console.log('Top 10 keywords por totalCount:')
const sorted = [...results].sort((a, b) => b.totalCount - a.totalCount).slice(0, 10)
for (const r of sorted) {
  console.log(`  ${r.term.padEnd(32)} ${String(r.totalCount).padStart(4)} jobs en Upwork`)
}
