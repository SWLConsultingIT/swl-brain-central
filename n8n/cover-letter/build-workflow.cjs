#!/usr/bin/env node
/**
 * Genera el workflow n8n "Cover Letter".
 *
 * QUÉ HACE:
 *   - Cada día a las 7:30 AM lee jobs status='qualified' sin draft
 *   - Para cada uno, llama OpenAI gpt-4o con el Master Prompt SWL
 *   - Guarda draft + status='proposal_drafted' via RPC brain_transition_job
 *
 * NO HACE:
 *   - No clasifica (eso es el workflow Brain Classifier)
 *
 * Uso:
 *   node build-workflow.cjs
 *
 * Output:
 *   cover-letter.json — para importar en n8n
 */

const fs = require('node:fs')
const path = require('node:path')

const SUPABASE_URL = 'https://uaefxpewxmvmhxpgehuv.supabase.co'
const MASTER_PROMPT = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'cover-letter', 'master-prompt.md'),
  'utf8',
)

const envContent = fs.readFileSync(
  path.join(__dirname, '..', '..', '.env.local'),
  'utf8',
)
const SUPABASE_SECRET_KEY = (envContent.match(/^SUPABASE_SECRET_KEY=(.+)$/m) || [])[1]
const OPENAI_API_KEY = (envContent.match(/^OPENAI_API_KEY=(.+)$/m) || [])[1]
if (!SUPABASE_SECRET_KEY) throw new Error('No SUPABASE_SECRET_KEY in .env.local')
if (!OPENAI_API_KEY) throw new Error('No OPENAI_API_KEY in .env.local')

const COVER_LETTER_MODEL = 'gpt-4o'

// ── Helpers ─────────────────────────────────────────────────────
let nodeCounter = 0
function id() {
  nodeCounter++
  return `aaaa${String(nodeCounter).padStart(4, '0')}-bbbb-cccc-dddd-eeeeeeee${String(nodeCounter).padStart(4, '0')}`
}
const POS = { x: 0, y: 0 }
function bumpX(d = 220) {
  POS.x += d
  return [POS.x, POS.y]
}
function resetRow(y) {
  POS.x = 0
  POS.y = y
}

const nodes = []
const connections = {}
function addConnection(from, to, outputIndex = 0) {
  if (!connections[from]) connections[from] = { main: [[]] }
  while (connections[from].main.length <= outputIndex) {
    connections[from].main.push([])
  }
  connections[from].main[outputIndex].push({ node: to, type: 'main', index: 0 })
}

function nScheduleTrigger() {
  // 7:30 AM Argentina daily — después del Classifier
  const n = {
    parameters: {
      rule: {
        interval: [{ field: 'cronExpression', expression: '30 7 * * *' }],
      },
    },
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position: bumpX(),
    id: id(),
    name: 'Daily 7:30 AM',
  }
  nodes.push(n)
  return n.name
}

function nManualTrigger() {
  const n = {
    parameters: {},
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    position: [POS.x, POS.y - 100],
    id: id(),
    name: 'Manual Run',
  }
  nodes.push(n)
  return n.name
}

function nMerge() {
  const n = {
    parameters: { numberInputs: 2 },
    type: 'n8n-nodes-base.merge',
    typeVersion: 3,
    position: bumpX(),
    id: id(),
    name: 'Merge Triggers',
  }
  nodes.push(n)
  return n.name
}

function nHttpGetSupabase(name, table, query) {
  const n = {
    parameters: {
      method: 'GET',
      url: `${SUPABASE_URL}/rest/v1/${table}?${query}`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Authorization', value: `Bearer ${SUPABASE_SECRET_KEY}` },
          { name: 'apikey', value: SUPABASE_SECRET_KEY },
        ],
      },
      options: { response: { response: { responseFormat: 'json' } } },
    },
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: bumpX(),
    id: id(),
    name,
  }
  nodes.push(n)
  return n.name
}

function nCode(name, jsCode, runOnce = false) {
  const n = {
    parameters: {
      mode: runOnce ? 'runOnceForAllItems' : 'runOnceForEachItem',
      jsCode,
    },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: bumpX(),
    id: id(),
    name,
  }
  nodes.push(n)
  return n.name
}

function nSplitInBatches(name) {
  const n = {
    parameters: { options: {} },
    type: 'n8n-nodes-base.splitInBatches',
    typeVersion: 3,
    position: bumpX(),
    id: id(),
    name,
  }
  nodes.push(n)
  return n.name
}

function nHttpOpenAI(name, model, opts = {}) {
  const { maxTokens = 1500, temperature = 0.5, batchInterval = 12000 } = opts
  const body = `={{ JSON.stringify({
  model: "${model}",
  messages: [
    { role: "system", content: $json.systemPrompt },
    { role: "user", content: $json.userPrompt }
  ],
  temperature: ${temperature},
  max_tokens: ${maxTokens}
}) }}`

  const n = {
    parameters: {
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Authorization', value: `Bearer ${OPENAI_API_KEY}` },
          { name: 'Content-Type', value: 'application/json' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: body,
      options: {
        // gpt-4o tier 1: 30K TPM → 12s entre calls (~5 RPM) es safe
        batching: {
          batch: {
            batchSize: 1,
            batchInterval,
          },
        },
        timeout: 90000,
      },
    },
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: bumpX(),
    id: id(),
    name,
    onError: 'continueRegularOutput',
  }
  nodes.push(n)
  return n.name
}

function nHttpRpcTransition(name, bodyExpression) {
  const n = {
    parameters: {
      method: 'POST',
      url: `${SUPABASE_URL}/rest/v1/rpc/brain_transition_job`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Authorization', value: `Bearer ${SUPABASE_SECRET_KEY}` },
          { name: 'apikey', value: SUPABASE_SECRET_KEY },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=representation' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: bodyExpression,
      options: {},
    },
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: bumpX(),
    id: id(),
    name,
    onError: 'continueRegularOutput',
  }
  nodes.push(n)
  return n.name
}

// ── ROW 1: Triggers + fetch qualified jobs ─────────────────────
resetRow(300)
const scheduleName = nScheduleTrigger()
const manualName = nManualTrigger()
const mergeName = nMerge()
addConnection(scheduleName, mergeName)
addConnection(manualName, mergeName)

// Idempotency: solo qualified SIN draft
const fetchQualifiedName = nHttpGetSupabase(
  'Fetch qualified jobs',
  'jobs',
  'status=eq.qualified&cover_letter_draft=is.null&business_unit_id=not.is.null&select=id,title,description,ticket,industry,country,duration,business_unit_id',
)
addConnection(mergeName, fetchQualifiedName)

// ── ROW 2: Cover letter loop ───────────────────────────────────
resetRow(550)
const splitCoverName = nSplitInBatches('Loop Qualified')
addConnection(fetchQualifiedName, splitCoverName)

// Fetch BU para este job
const fetchBUForCoverName = nHttpGetSupabase(
  'Fetch BU for this job',
  'business_units',
  'placeholder',
)
nodes[nodes.length - 1].parameters.url = `=${SUPABASE_URL}/rest/v1/business_units?id=eq.{{ $json.business_unit_id }}&select=id,name,description,scopes,keywords,good_fit_signals,decision_logic`
addConnection(splitCoverName, fetchBUForCoverName)

const fetchPrecBUName = nHttpGetSupabase(
  'Fetch precedent for this BU',
  'proposals',
  'placeholder',
)
nodes[nodes.length - 1].parameters.url = `=${SUPABASE_URL}/rest/v1/proposals?status=eq.Sent&business_unit_id=eq.{{ $('Loop Qualified').item.json.business_unit_id }}&order=sent_date.desc&limit=5&select=job_title,cover_letter,sent_date`
addConnection(fetchBUForCoverName, fetchPrecBUName)

const masterPromptEscaped = JSON.stringify(MASTER_PROMPT)
const buildCoverPromptName = nCode(
  'Build Cover Letter Prompt',
  `
function asArray(nodeName) {
  const items = $(nodeName).all();
  if (!items || items.length === 0) return [];
  if (items.length > 1) return items.map(it => it.json);
  const j = items[0].json;
  if (Array.isArray(j)) return j;
  return [j];
}

const job = $('Loop Qualified').item.json;
const buArr = asArray('Fetch BU for this job');
const bu = buArr[0] || {};
const precedent = asArray('Fetch precedent for this BU');

const MAX_PRECEDENT_CL_CHARS = 600;
const precedentBlock = precedent.map((p, i) => {
  const header = \`### Precedent \${i+1}: \${p.job_title}\`;
  const cl = p.cover_letter
    ? '\\n' + p.cover_letter.slice(0, MAX_PRECEDENT_CL_CHARS) + (p.cover_letter.length > MAX_PRECEDENT_CL_CHARS ? '…' : '')
    : '\\n(no cover letter text on record — use as title-level inspiration only)';
  return header + cl;
}).join('\\n\\n');

const MASTER_PROMPT = ${masterPromptEscaped};

const systemPrompt = [
  MASTER_PROMPT,
  '',
  \`---\`,
  '',
  \`## Context for this specific job\`,
  '',
  \`### LIST OF SERVICES (the SWL "\${bu.name}" business unit)\`,
  bu.description || '',
  '',
  \`Relevant scopes: \${(bu.scopes || []).join(' · ')}\`,
  \`Relevant tools/keywords: \${(bu.keywords || []).slice(0, 25).join(', ')}\`,
  \`Good-fit signals: \${bu.good_fit_signals || ''}\`,
  \`Decision logic: \${bu.decision_logic || ''}\`,
  '',
  precedent.length > 0
    ? \`### Recent Sent precedent (\${precedent.length} similar SWL applications)\\n\\nUse these as reference for tone, depth, and what worked in similar pitches. Do not copy verbatim.\\n\\n\${precedentBlock}\`
    : \`### Recent Sent precedent\\n(none in this BU yet — rely on the master prompt structure)\`,
  '',
  \`### Specific Comments for the Job Post\`,
  \`(none provided)\`,
].join('\\n');

const userPrompt = [
  \`## JOB POST\`,
  '',
  \`Title: \${job.title}\`,
  \`Industry: \${job.industry || 'n/a'}\`,
  \`Client location: \${job.country || 'n/a'}\`,
  \`Duration: \${job.duration || 'n/a'}\`,
  \`Ticket: \${job.ticket != null ? '$' + job.ticket + ' USD' : 'n/a'}\`,
  '',
  \`Description:\`,
  job.description || '(no description)',
].join('\\n');

return { json: { ...job, systemPrompt, userPrompt } };
`,
)
addConnection(fetchPrecBUName, buildCoverPromptName)

const openaiCoverName = nHttpOpenAI(
  'OpenAI Cover Letter',
  COVER_LETTER_MODEL,
  { maxTokens: 1500, temperature: 0.5, batchInterval: 12000 },
)
addConnection(buildCoverPromptName, openaiCoverName)

const parseCoverName = nCode(
  'Extract Cover Letter Text',
  `
const ai = $json;
const job = $('Build Cover Letter Prompt').item.json;
const text = (ai.choices && ai.choices[0] && ai.choices[0].message && ai.choices[0].message.content) || '';
return { json: { job_id: job.id, cover_letter: text.trim(), chars: text.length } };
`,
)
addConnection(openaiCoverName, parseCoverName)

const transitionCoverName = nHttpRpcTransition(
  'Transition (cover letter)',
  `={{ JSON.stringify({
  p_job_id: $json.job_id,
  p_to_status: 'proposal_drafted',
  p_actor: 'brain_cover_letter',
  p_actor_detail: '${COVER_LETTER_MODEL}',
  p_reason: 'cover letter drafted (' + $json.chars + ' chars)',
  p_cover_letter_draft: $json.cover_letter
}) }}`,
)
addConnection(parseCoverName, transitionCoverName)
addConnection(transitionCoverName, splitCoverName) // loop back

// ── Final workflow ──────────────────────────────────────────────
const workflow = {
  name: 'Brain Cover Letter',
  nodes,
  connections,
  active: true,
  settings: { executionOrder: 'v1', timezone: 'America/Argentina/Buenos_Aires' },
  pinData: {},
  meta: {},
}

const output = path.join(__dirname, 'cover-letter.json')
fs.writeFileSync(output, JSON.stringify(workflow, null, 2))
console.log(`✓ Escrito ${output}`)
console.log(`  Nodos: ${nodes.length}`)
console.log(`  Modelo: ${COVER_LETTER_MODEL}`)
