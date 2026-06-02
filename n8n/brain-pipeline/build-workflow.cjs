#!/usr/bin/env node
/**
 * Genera el workflow n8n "Brain Pipeline v1": classifier + cover letter.
 *
 * El workflow lee jobs de Supabase, los clasifica con Anthropic Haiku 4.5,
 * y para los qualified genera cover letter con Anthropic Sonnet 4.5 usando
 * el Master Prompt SWL.
 *
 * Uso:
 *   node build-workflow.cjs
 *
 * Output:
 *   brain-pipeline.json — para importar en n8n
 *
 * Credenciales que necesitan estar creadas en n8n al importar:
 *   - "Supabase Brain Central — sb_secret" (Header Auth con apikey)
 *   - "Anthropic API" (Header Auth con x-api-key, NUEVA)
 *
 * Más:
 *   - El header Authorization: Bearer <key> de Supabase se agrega
 *     manualmente en cada nodo HTTP a Supabase (mismo que en los scrapers).
 *   - El header anthropic-version: 2023-06-01 se agrega en los nodos
 *     a Anthropic.
 */

const fs = require('node:fs')
const path = require('node:path')

const SUPABASE_URL = 'https://uaefxpewxmvmhxpgehuv.supabase.co'
const MASTER_PROMPT = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'cover-letter', 'master-prompt.md'),
  'utf8',
)

// Leer el SUPABASE_SECRET_KEY del .env.local al momento de generar el JSON.
// El JSON resultante tendrá el key hardcodeado en los headers Authorization
// (igual que en los 4 scrapers v2). Ese JSON se gitignorea — solo se commitea
// este generador.
const envContent = fs.readFileSync(
  path.join(__dirname, '..', '..', '.env.local'),
  'utf8',
)
const SUPABASE_SECRET_KEY = (envContent.match(/^SUPABASE_SECRET_KEY=(.+)$/m) || [])[1]
if (!SUPABASE_SECRET_KEY) throw new Error('No SUPABASE_SECRET_KEY in .env.local')

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

// ── Nodes ───────────────────────────────────────────────────────
const nodes = []
const connections = {}

function addConnection(from, to) {
  if (!connections[from]) connections[from] = { main: [[]] }
  connections[from].main[0].push({ node: to, type: 'main', index: 0 })
}

function nScheduleTrigger() {
  const n = {
    parameters: {
      rule: {
        interval: [{ field: 'days', triggerAtHour: 7, triggerAtMinute: 0 }],
      },
    },
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position: bumpX(),
    id: id(),
    name: 'Daily 7AM',
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
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {
            name: 'Authorization',
            value: `Bearer ${SUPABASE_SECRET_KEY}`,
          },
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

function nHttpAnthropic(name, model) {
  const n = {
    parameters: {
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'anthropic-version', value: '2023-06-01' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={{ JSON.stringify({
  model: "${model}",
  max_tokens: ${model.includes('haiku') ? 1024 : 1500},
  temperature: ${model.includes('haiku') ? 0 : 0.5},
  system: $json.systemPrompt,
  messages: [{ role: "user", content: $json.userPrompt }]
}) }}`,
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

function nHttpPatchSupabase(name, table, idExpression, bodyExpression) {
  const n = {
    parameters: {
      method: 'PATCH',
      url: `=${SUPABASE_URL}/rest/v1/${table}?id=eq.${idExpression}`,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {
            name: 'Authorization',
            value: `Bearer ${SUPABASE_SECRET_KEY}`,
          },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=minimal' },
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

function nHttpPostSupabase(name, table, bodyExpression) {
  const n = {
    parameters: {
      method: 'POST',
      url: `${SUPABASE_URL}/rest/v1/${table}`,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {
            name: 'Authorization',
            value: `Bearer ${SUPABASE_SECRET_KEY}`,
          },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=minimal' },
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

// ── ROW 1: Triggers + Merge + Load context ───────────────────────
resetRow(300)
const scheduleName = nScheduleTrigger()
const manualName = nManualTrigger()
const mergeName = nMerge()
addConnection(scheduleName, mergeName)
addConnection(manualName, mergeName)

const fetchBUsName = nHttpGetSupabase(
  'Fetch BU cards',
  'business_units',
  'is_active=eq.true&select=id,name,description,scopes,keywords,good_fit_signals,red_flags,decision_logic',
)
addConnection(mergeName, fetchBUsName)

const fetchPrecedentName = nHttpGetSupabase(
  'Fetch Sent precedent',
  'proposals',
  'status=eq.Sent&business_unit_id=not.is.null&order=sent_date.desc&limit=160&select=business_unit_id,job_title',
)
addConnection(fetchBUsName, fetchPrecedentName)

// Build classifier system prompt (once, using BU cards + precedent)
const buildClassifierSystemName = nCode(
  'Build Classifier System Prompt',
  `
// HTTP Request en n8n a veces deja la respuesta JSON entera en .first().json
// y a veces la split en items. Hacemos lookup robusto.
function asArray(nodeName) {
  const items = $(nodeName).all();
  if (!items || items.length === 0) return [];
  // Caso A: cada item es un row (n8n split). Tomamos .json de cada uno.
  if (items.length > 1) return items.map(it => it.json);
  // Caso B: un solo item con un array dentro.
  const j = items[0].json;
  if (Array.isArray(j)) return j;
  // Caso C: un solo item con un objeto. Lo envolvemos.
  return [j];
}

const bus = asArray('Fetch BU cards');
const precedent = asArray('Fetch Sent precedent');

// Group precedent by BU
const precByBU = new Map();
for (const p of (precedent || [])) {
  if (!p.business_unit_id) continue;
  if (!precByBU.has(p.business_unit_id)) precByBU.set(p.business_unit_id, []);
  if (precByBU.get(p.business_unit_id).length < 5) {
    precByBU.get(p.business_unit_id).push(p.job_title);
  }
}

// Build BU section
const buSection = bus.map(bu => {
  const prec = precByBU.get(bu.id) || [];
  return [
    \`## \${bu.name}\`,
    bu.description,
    \`Scopes: \${bu.scopes.join(' · ')}\`,
    \`Keywords: \${bu.keywords.slice(0, 30).join(', ')}\`,
    \`Good fit: \${bu.good_fit_signals}\`,
    \`Red flags: \${bu.red_flags}\`,
    \`Decision: \${bu.decision_logic}\`,
    prec.length > 0 ? \`Recent Sent precedent: \${prec.join(' · ')}\` : 'Recent Sent precedent: (none yet)',
  ].join('\\n');
}).join('\\n\\n---\\n\\n');

const HARD_EXCLUSIONS = ['pure graphic design only', 'physical product manufacturing', 'legal services', 'medical services', 'academic writing', 'civil / mechanical / electrical engineering'];

const buNameToId = {};
for (const bu of bus) buNameToId[bu.name] = bu.id;

const systemPrompt = [
  \`You are a senior qualification analyst for SWL Consulting, an AI-native consulting firm.\`,
  '',
  \`Your job: decide if an incoming Upwork job is a MATCH for SWL.\`,
  '',
  \`Below are SWL's 8 business units. Each card includes scope, keywords, good-fit signals, red flags, decision logic, and recent precedent (real proposals SWL has sent).\`,
  '',
  buSection,
  '',
  \`---\`,
  '',
  \`HARD EXCLUSIONS (always match=false, score≤10): \${HARD_EXCLUSIONS.join(' · ')}.\`,
  '',
  \`Decision protocol:\`,
  \`1. Read job title + description.\`,
  \`2. Identify which BU (if any) fits.\`,
  \`3. Weigh against good-fit signals, red flags, decision logic, and precedent.\`,
  \`4. Decide match=true ONLY when there is a clear scope fit + realistic precedent.\`,
  \`5. Assign score: 0=clear miss · 30=weak/no precedent · 60=plausible · 85+=strong fit with precedent.\`,
  \`6. reason ≤ 25 words, concrete, cite signals or precedent.\`,
  '',
  \`Return ONLY valid JSON, no markdown fences, no prose: { "match": bool, "score": 0-100, "area": <one of the BU names above> | null, "reason": "..." }\`,
].join('\\n');

return { json: { systemPrompt, buNameToId } };
`,
  true,
)
addConnection(fetchPrecedentName, buildClassifierSystemName)

// Fetch prequalified jobs
const fetchPrequalifiedName = nHttpGetSupabase(
  'Fetch prequalified jobs',
  'jobs',
  'status=eq.prequalified&select=id,title,description,ticket,industry',
)
addConnection(buildClassifierSystemName, fetchPrequalifiedName)

// ── ROW 2: Classifier loop ──────────────────────────────────────
resetRow(550)
const splitClassifierName = nSplitInBatches('Loop Prequalified')
addConnection(fetchPrequalifiedName, splitClassifierName)

const buildUserPromptName = nCode(
  'Build Classifier User Prompt',
  `
const job = $json;
const systemPrompt = $('Build Classifier System Prompt').first().json.systemPrompt;
const userPrompt = [
  \`Job title: \${job.title}\`,
  \`Ticket: \${job.ticket != null ? '$' + job.ticket + ' USD' : 'n/a'}\`,
  \`Industry: \${job.industry || 'n/a'}\`,
  '',
  \`Description:\`,
  job.description || '(no description)',
].join('\\n');

return { json: { ...job, systemPrompt, userPrompt } };
`,
)
addConnection(splitClassifierName, buildUserPromptName)

const anthropicClassifierName = nHttpAnthropic(
  'Anthropic Haiku (classify)',
  'claude-haiku-4-5',
)
addConnection(buildUserPromptName, anthropicClassifierName)

const parseClassifierName = nCode(
  'Parse Classifier + Apply Override',
  `
const job = $('Build Classifier User Prompt').item.json;
const anth = $json;
const buNameToId = $('Build Classifier System Prompt').first().json.buNameToId;

let parsed;
try {
  const raw = (anth.content && anth.content[0] && anth.content[0].text) || '';
  const cleaned = raw.replace(/^\`\`\`json\\s*/i, '').replace(/\`\`\`\\s*$/g, '').trim();
  parsed = JSON.parse(cleaned);
} catch (e) {
  parsed = { match: false, score: 0, area: null, reason: 'parse_error: ' + e.message };
}

const area = (typeof parsed.area === 'string' && parsed.area.length > 0) ? parsed.area : null;
const score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 0;
const businessUnitId = area ? (buNameToId[area] || null) : null;

// Override rule: ticket >= $40 + area assigned → qualified
const hasArea = !!area;
const ticketViable = (job.ticket || 0) >= 40;
const finalMatch = !!parsed.match || (hasArea && ticketViable);
const newStatus = finalMatch ? 'qualified' : 'discarded';

return { json: {
  job_id: job.id,
  newStatus,
  match: finalMatch,
  score,
  area,
  reason: parsed.reason || '',
  businessUnitId,
  ticket: job.ticket,
  llm_said_match: !!parsed.match,
}};
`,
)
addConnection(anthropicClassifierName, parseClassifierName)

const updateJobClassifierName = nHttpPatchSupabase(
  'Update job (classifier)',
  'jobs',
  '{{ $json.job_id }}',
  `={{ JSON.stringify({
  status: $json.newStatus,
  classifier_match: $json.match,
  classifier_score: $json.score,
  classifier_area: $json.area,
  classifier_reason: $json.reason,
  classifier_run_at: $now.toISO(),
  business_unit_id: $json.businessUnitId
}) }}`,
)
addConnection(parseClassifierName, updateJobClassifierName)

const insertDecisionClassifierName = nHttpPostSupabase(
  'Log decision (classifier)',
  'job_decisions',
  `={{ JSON.stringify({
  job_id: $('Parse Classifier + Apply Override').item.json.job_id,
  from_status: 'prequalified',
  to_status: $('Parse Classifier + Apply Override').item.json.newStatus,
  actor: 'brain_classifier',
  actor_detail: 'claude-haiku-4-5',
  reason: ($('Parse Classifier + Apply Override').item.json.match && !$('Parse Classifier + Apply Override').item.json.llm_said_match)
    ? '[override: ticket $' + $('Parse Classifier + Apply Override').item.json.ticket + '+ area ' + $('Parse Classifier + Apply Override').item.json.area + '] ' + $('Parse Classifier + Apply Override').item.json.reason
    : $('Parse Classifier + Apply Override').item.json.reason,
  classifier_match: $('Parse Classifier + Apply Override').item.json.match,
  classifier_score: $('Parse Classifier + Apply Override').item.json.score,
  classifier_area: $('Parse Classifier + Apply Override').item.json.area
}) }}`,
)
addConnection(updateJobClassifierName, insertDecisionClassifierName)
addConnection(insertDecisionClassifierName, splitClassifierName) // loop back

// ── ROW 3: Cover letter loop ────────────────────────────────────
resetRow(800)
const fetchQualifiedName = nHttpGetSupabase(
  'Fetch qualified jobs',
  'jobs',
  'status=eq.qualified&business_unit_id=not.is.null&select=id,title,description,ticket,industry,country,duration,business_unit_id',
)
addConnection(splitClassifierName, fetchQualifiedName) // done branch fires after loop

const splitCoverName = nSplitInBatches('Loop Qualified')
addConnection(fetchQualifiedName, splitCoverName)

const fetchBUForCoverName = nHttpGetSupabase(
  'Fetch BU for this job',
  'business_units',
  'id=eq.{{ $json.business_unit_id }}&select=id,name,description,scopes,keywords,good_fit_signals,decision_logic',
)
// We need to use expression in URL, so build it dynamically
nodes[nodes.length - 1].parameters.url = `=${SUPABASE_URL}/rest/v1/business_units?id=eq.{{ $json.business_unit_id }}&select=id,name,description,scopes,keywords,good_fit_signals,decision_logic`
addConnection(splitCoverName, fetchBUForCoverName)

const fetchPrecBUName = nHttpGetSupabase(
  'Fetch precedent for this BU',
  'proposals',
  'placeholder',
)
nodes[nodes.length - 1].parameters.url = `=${SUPABASE_URL}/rest/v1/proposals?status=eq.Sent&business_unit_id=eq.{{ $('Loop Qualified').item.json.business_unit_id }}&order=sent_date.desc&limit=5&select=job_title,cover_letter,sent_date`
addConnection(fetchBUForCoverName, fetchPrecBUName)

// Build cover letter prompt with master prompt embedded
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

const anthropicCoverName = nHttpAnthropic(
  'Anthropic Sonnet (cover letter)',
  'claude-sonnet-4-5',
)
addConnection(buildCoverPromptName, anthropicCoverName)

const parseCoverName = nCode(
  'Extract Cover Letter Text',
  `
const anth = $json;
const job = $('Build Cover Letter Prompt').item.json;
const text = (anth.content && anth.content[0] && anth.content[0].text) || '';
return { json: { job_id: job.id, cover_letter: text.trim(), chars: text.length } };
`,
)
addConnection(anthropicCoverName, parseCoverName)

const updateJobCoverName = nHttpPatchSupabase(
  'Update job (cover letter)',
  'jobs',
  '{{ $json.job_id }}',
  `={{ JSON.stringify({
  status: 'proposal_drafted',
  cover_letter_draft: $json.cover_letter,
  cover_letter_generated_at: $now.toISO()
}) }}`,
)
addConnection(parseCoverName, updateJobCoverName)

const insertDecisionCoverName = nHttpPostSupabase(
  'Log decision (cover letter)',
  'job_decisions',
  `={{ JSON.stringify({
  job_id: $('Extract Cover Letter Text').item.json.job_id,
  from_status: 'qualified',
  to_status: 'proposal_drafted',
  actor: 'brain_cover_letter',
  actor_detail: 'claude-sonnet-4-5',
  reason: 'cover letter drafted (' + $('Extract Cover Letter Text').item.json.chars + ' chars)'
}) }}`,
)
addConnection(updateJobCoverName, insertDecisionCoverName)
addConnection(insertDecisionCoverName, splitCoverName)

// ── Final workflow object ──────────────────────────────────────
const workflow = {
  name: 'Brain Pipeline v1',
  nodes,
  connections,
  active: false,
  settings: { executionOrder: 'v1' },
  pinData: {},
  meta: {},
}

const output = path.join(__dirname, 'brain-pipeline.json')
fs.writeFileSync(output, JSON.stringify(workflow, null, 2))
console.log(`✓ Escrito ${output}`)
console.log(`  Nodos: ${nodes.length}`)
console.log(`  Conexiones: ${Object.keys(connections).length}`)
