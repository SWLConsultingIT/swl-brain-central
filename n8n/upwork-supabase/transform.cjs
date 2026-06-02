#!/usr/bin/env node
/**
 * Transforma el workflow n8n original (que escribe a Notion + OpenAI summary)
 * en uno que escribe a Supabase `jobs` table directamente.
 *
 * Cambios:
 *  - Remueve 15 nodos de Notion + OpenAI + sus orquestadores intermedios.
 *  - Mantiene intacta toda la lógica de scraping a Upwork (OAuth + GraphQL + paginación + filtros).
 *  - Agrega 1 nodo `Supabase Upsert` que inserta en `jobs` table.
 *  - Reconecta: URL → Supabase Upsert → Loop Over Items (cierra el loop).
 *
 * No toca Supabase. No toca el workflow original en n8n. Solo produce un JSON
 * nuevo que se importa como workflow nuevo.
 *
 * Field mapping (n8n → jobs):
 *   id (Upwork ID)             → upwork_id
 *   jobUrl (de URL)            → link
 *   title                      → title
 *   description                → description
 *   ticket (string "$X - $Y")  → ticket_raw
 *   hourlyBudgetMin/Max raw    → ticket (numeric, avg) + hourly_average
 *   durationLabel              → duration
 *   talentType                 → talent_type
 *   country / city             → country / city_region
 *   proposals                  → proposals_count
 *   createdDateTime            → post_date
 *   occupationsCategory        → industry
 */

const fs = require('node:fs')
const path = require('node:path')

// Uso:
//   node transform.cjs                          # default: automation-bi
//   node transform.cjs financial                # procesa upwork-supabase-financial.json
//   node transform.cjs business
//   node transform.cjs market
const vertical = process.argv[2] ?? 'automation-bi'

// Cómo se muestra el nombre del vertical en el workflow renombrado
const VERTICAL_LABELS = {
  'automation-bi': 'Automation BI',
  financial: 'Financial',
  business: 'Business',
  market: 'Market',
}
const label = VERTICAL_LABELS[vertical] ?? vertical

const INPUT = path.join(__dirname, `upwork-supabase-${vertical}.json`)
const OUTPUT = path.join(__dirname, `upwork-supabase-${vertical}.transformed.json`)

if (!fs.existsSync(INPUT)) {
  console.error(`✗ No existe ${INPUT}`)
  console.error(`  Bajá el JSON del workflow desde n8n con ese nombre antes de correr esto.`)
  process.exit(1)
}

const wf = JSON.parse(fs.readFileSync(INPUT, 'utf8'))

const NODES_TO_REMOVE = new Set([
  'Get many database pages',
  'If',
  'Create a database page',
  'Update a database page4',
  'Code3',
  'Wait',
  'Message a model',
  'Wait2',
  'Update a database page3',
  'If1',
  'Wait1',
  'Edit Fields1',
  'Append a block',
  'Update a database page1',
  'Update a database page',
])

wf.nodes = wf.nodes.filter(n => !NODES_TO_REMOVE.has(n.name))

const newConnections = {}
for (const [source, conn] of Object.entries(wf.connections)) {
  if (NODES_TO_REMOVE.has(source)) continue
  const main = (conn.main ?? []).map(branch =>
    (branch ?? []).filter(edge => !NODES_TO_REMOVE.has(edge.node))
  )
  newConnections[source] = { ...conn, main }
}
wf.connections = newConnections

// Body del Supabase Upsert.
// `$('Loop Over Items').item.json` → item raw de la iteración (tiene hourlyBudgetMin/Max raw)
// `$('Edit Fields').item.json`     → campos ya formateados por Edit Fields
// `$json`                          → output de URL: {jobId, jobTitle, jobUrl}
const SUPABASE_BODY_EXPR = `={
  "upwork_id": "{{ $('Edit Fields').item.json.id }}",
  "link": "{{ $json.jobUrl }}",
  "title": {{ JSON.stringify($('Edit Fields').item.json.title || '') }},
  "description": {{ JSON.stringify($('Edit Fields').item.json.description || '') }},
  "ticket_raw": "{{ $('Edit Fields').item.json.ticket }}",
  "ticket": {{ (() => { const min = Number($('Loop Over Items').item.json.hourlyBudgetMin); const max = Number($('Loop Over Items').item.json.hourlyBudgetMax); const amt = Number($('Loop Over Items').item.json.amount); if (min && max) return (min + max) / 2; if (min) return min; if (max) return max; if (amt) return amt; return null; })() }},
  "hourly_average": {{ (() => { const min = Number($('Loop Over Items').item.json.hourlyBudgetMin); const max = Number($('Loop Over Items').item.json.hourlyBudgetMax); if (min && max) return (min + max) / 2; if (min) return min; if (max) return max; return null; })() }},
  "duration": "{{ $('Edit Fields').item.json.duration }}",
  "talent_type": "{{ $('Edit Fields').item.json.talentType }}",
  "country": "{{ $('Edit Fields').item.json.country }}",
  "city_region": "{{ $('Edit Fields').item.json.city }}",
  "proposals_count": {{ Number($('Edit Fields').item.json.proposals) || null }},
  "post_date": "{{ $('Edit Fields').item.json.createdDateTime }}",
  "industry": {{ JSON.stringify($('Edit Fields').item.json.occupationsCategory || null) }}
}`

const SUPABASE_NODE = {
  parameters: {
    method: 'POST',
    url: 'https://uaefxpewxmvmhxpgehuv.supabase.co/rest/v1/jobs?on_conflict=upwork_id',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Prefer', value: 'resolution=merge-duplicates,return=minimal' },
      ],
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: SUPABASE_BODY_EXPR,
    options: {},
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [4416, 16],
  id: '11111111-2222-3333-4444-555555555555',
  name: 'Supabase Upsert',
  onError: 'continueRegularOutput',
}

wf.nodes.push(SUPABASE_NODE)

// Conectar: URL → Supabase Upsert → Loop Over Items (cierra el loop)
wf.connections['URL'] = { main: [[{ node: 'Supabase Upsert', type: 'main', index: 0 }]] }
wf.connections['Supabase Upsert'] = { main: [[{ node: 'Loop Over Items', type: 'main', index: 0 }]] }

wf.name = `Upwork → Supabase (${label}) v2`

delete wf.id
delete wf.versionId
// pinData es caché de runs anteriores; inflas el JSON al pedo y es irrelevante
// para el workflow nuevo (que va a correr fresh).
if (wf.pinData) wf.pinData = {}
wf.active = false

fs.writeFileSync(OUTPUT, JSON.stringify(wf, null, 2))
console.log(`✓ Escrito ${OUTPUT}`)
console.log(`  Nodos originales: ${wf.nodes.length + NODES_TO_REMOVE.size}`)
console.log(`  Nodos finales:    ${wf.nodes.length}`)
console.log(`  Removidos:        ${NODES_TO_REMOVE.size}`)
