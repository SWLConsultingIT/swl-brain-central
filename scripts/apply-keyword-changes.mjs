// Aplica las 28 keywords nuevas + cleanup a los 4 scrapers
import fs from 'node:fs'

const DIR = 'n8n/upwork-supabase-v2'

// Cambios por scraper
const CHANGES = {
  'financial': {
    remove: [],
    add: [],
  },
  'business': {
    remove: ['ServiceTitan'], // duplicate of 'Service Titan'
    add: [
      // Org Strategy gap
      { term: 'Organizational Design', maxPage: 2 },
      { term: 'Change Management', maxPage: 2 },
      { term: 'Strategic Planning', maxPage: 2 },
      { term: 'Operating Model', maxPage: 2 },
      { term: 'Business Transformation', maxPage: 2 },
      { term: 'OKR', maxPage: 2 },
      { term: 'Strategic Initiatives', maxPage: 1 },
    ],
  },
  'automation-bi': {
    // Remove second 'AI Agents' (duplicate) — handled by dedup logic below
    remove: [],
    rename: { 'None Code': 'No Code', 'Scrapping': 'Scraping' },
    dedupTerms: true, // remove duplicate entries (AI Agents appears twice)
    add: [
      // System Integrations gap
      { term: 'API Integration', maxPage: 4 },
      { term: 'Webhook', maxPage: 2 },
      { term: 'Middleware', maxPage: 2 },
      { term: 'ETL', maxPage: 2 },
      { term: 'Data Pipeline', maxPage: 2 },
      { term: 'REST API', maxPage: 2 },
      { term: 'iPaaS', maxPage: 1 },
      { term: 'Workato', maxPage: 1 },
      { term: 'Tray.io', maxPage: 1 },
    ],
  },
  'market': {
    remove: [],
    add: [
      // Sales & Customer Success gap
      { term: 'RevOps', maxPage: 4 },
      { term: 'Sales Operations', maxPage: 4 },
      { term: 'Customer Success Manager', maxPage: 2 },
      { term: 'Account Executive', maxPage: 2 },
      { term: 'Sales Enablement', maxPage: 2 },
      { term: 'Pipeline Management', maxPage: 2 },
      { term: 'SDR', maxPage: 2 },
      { term: 'BDR', maxPage: 2 },
      { term: 'Outbound Sales', maxPage: 2 },
      { term: 'Inside Sales', maxPage: 1 },
      { term: 'Sales Strategy', maxPage: 2 },
      { term: 'Customer Retention', maxPage: 1 },
    ],
  },
}

for (const [scraper, ops] of Object.entries(CHANGES)) {
  const path = `${DIR}/${scraper}.json`
  const wf = JSON.parse(fs.readFileSync(path, 'utf-8'))
  for (const n of wf.nodes) {
    if (n.name !== 'searches') continue
    const assignments = n.parameters.assignments.assignments
    for (const a of assignments) {
      if (a.name !== 'searches') continue
      let terms = JSON.parse(a.value)
      const before = terms.length

      // Remove
      if (ops.remove?.length) {
        terms = terms.filter(t => !ops.remove.includes(t.term))
      }
      // Rename
      if (ops.rename) {
        for (const t of terms) {
          if (ops.rename[t.term]) t.term = ops.rename[t.term]
        }
      }
      // Dedup
      if (ops.dedupTerms) {
        const seen = new Set()
        terms = terms.filter(t => {
          if (seen.has(t.term)) return false
          seen.add(t.term)
          return true
        })
      }
      // Add
      if (ops.add?.length) terms.push(...ops.add)

      a.value = JSON.stringify(terms, null, 2)
      const calls = terms.reduce((s, t) => s + (t.maxPage || 1), 0)
      console.log(`${scraper.padEnd(15)} ${before} → ${terms.length} terms, ${calls} calls/run`)
    }
  }
  fs.writeFileSync(path, JSON.stringify(wf, null, 2), 'utf-8')
}
