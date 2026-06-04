#!/usr/bin/env node
/**
 * Genera el workflow n8n "Classifier".
 *
 * QUÉ HACE:
 *   - Cada 30 min lee jobs WHERE status='prequalified' de Supabase
 *   - Para cada job, llama OpenAI gpt-4o-mini con las 8 BU cards + precedent
 *   - Decide qualified o discarded
 *   - Guarda via RPC brain_transition_job (atómico)
 *
 * NO HACE:
 *   - No genera cover letters (eso es otro workflow)
 *
 * Uso:
 *   node build-workflow.cjs
 *
 * Output:
 *   classifier.json — para importar en n8n
 */

const fs = require('node:fs')
const path = require('node:path')

const SUPABASE_URL = 'https://uaefxpewxmvmhxpgehuv.supabase.co'

const envContent = fs.readFileSync(
  path.join(__dirname, '..', '..', '.env.local'),
  'utf8',
)
const SUPABASE_SECRET_KEY = (envContent.match(/^SUPABASE_SECRET_KEY=(.+)$/m) || [])[1]
const OPENAI_API_KEY = (envContent.match(/^OPENAI_API_KEY=(.+)$/m) || [])[1]
if (!SUPABASE_SECRET_KEY) throw new Error('No SUPABASE_SECRET_KEY in .env.local')
if (!OPENAI_API_KEY) throw new Error('No OPENAI_API_KEY in .env.local')

const CLASSIFIER_MODEL = 'gpt-4o-mini'

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

// ── Node builders ────────────────────────────────────────────────
function nScheduleTrigger() {
  // 7:15 AM Argentina daily
  const n = {
    parameters: {
      rule: {
        interval: [{ field: 'cronExpression', expression: '15 7 * * *' }],
      },
    },
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position: bumpX(),
    id: id(),
    name: 'Daily 7:15 AM',
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
  const { jsonMode = false, maxTokens = 512, temperature = 0, batchInterval = 1500 } = opts
  const body = jsonMode
    ? `={{ JSON.stringify({
  model: "${model}",
  messages: [
    { role: "system", content: $json.systemPrompt },
    { role: "user", content: $json.userPrompt }
  ],
  temperature: ${temperature},
  max_tokens: ${maxTokens},
  response_format: { type: "json_object" }
}) }}`
    : `={{ JSON.stringify({
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
        batching: {
          batch: {
            batchSize: 1,
            batchInterval,
          },
        },
        timeout: 60000,
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

// ── ROW 1: Triggers + Load context ──────────────────────────────
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

const buildClassifierSystemName = nCode(
  'Build Classifier System Prompt',
  `
function asArray(nodeName) {
  const items = $(nodeName).all();
  if (!items || items.length === 0) return [];
  if (items.length > 1) return items.map(it => it.json);
  const j = items[0].json;
  if (Array.isArray(j)) return j;
  return [j];
}

const bus = asArray('Fetch BU cards');
const precedent = asArray('Fetch Sent precedent');

const precByBU = new Map();
for (const p of (precedent || [])) {
  if (!p.business_unit_id) continue;
  if (!precByBU.has(p.business_unit_id)) precByBU.set(p.business_unit_id, []);
  if (precByBU.get(p.business_unit_id).length < 5) {
    precByBU.get(p.business_unit_id).push(p.job_title);
  }
}

const buSection = bus.map(bu => {
  const prec = precByBU.get(bu.id) || [];
  return [
    \`## \${bu.name}\`,
    bu.description,
    \`Scopes: \${(bu.scopes || []).join(' · ')}\`,
    \`Keywords: \${(bu.keywords || []).slice(0, 30).join(', ')}\`,
    \`Good fit: \${bu.good_fit_signals || ''}\`,
    \`Red flags: \${bu.red_flags || ''}\`,
    \`Decision: \${bu.decision_logic || ''}\`,
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
  \`CRITICAL — TICKET POLICY:\`,
  \`Jobs reach you ONLY after passing the official SQL filter: ticket ≥ $40 USD, posted ≤ 48h, ≤ 50 existing proposals. These thresholds are validated by SWL leadership. DO NOT apply your own intuition about "engagement minimums", "below market rates", or "budget insufficient". Even $40-$200 tickets are viable for SWL — don't reject them on budget grounds. Your job is scope fit, not budget.\`,
  '',
  \`CRITICAL — AREA ASSIGNMENT:\`,
  \`Whenever the job scope plausibly fits one of the 8 BUs, set "area" to that BU name (exactly as listed above), EVEN IF you set match=false for other reasons. Only return area=null when the scope clearly fits NONE of the 8 BUs.\`,
  '',
  \`Decision protocol:\`,
  \`1. Read job title + description.\`,
  \`2. Identify which BU (if any) fits → set "area" accordingly.\`,
  \`3. Check hard exclusions → if any apply, match=false, score≤10.\`,
  \`4. Otherwise, weigh good-fit signals, red flags, decision logic, and precedent.\`,
  \`5. Decide match=true when there is a clear scope fit + realistic precedent.\`,
  \`6. Assign score: 0=clear miss · 30=weak/no precedent · 60=plausible · 85+=strong fit with precedent.\`,
  \`7. reason ≤ 25 words, concrete, cite signals or precedent. NEVER cite ticket/budget as the reason — that's not your call.\`,
  '',
  \`Return ONLY valid JSON, no markdown fences, no prose: { "match": bool, "score": 0-100, "area": <one of the BU names above> | null, "reason": "..." }\`,
].join('\\n');

return { json: { systemPrompt, buNameToId } };
`,
  true,
)
addConnection(fetchPrecedentName, buildClassifierSystemName)

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
// Capa 1: NO le pasamos el ticket al LLM
const userPrompt = [
  \`Job title: \${job.title}\`,
  \`Industry: \${job.industry || 'n/a'}\`,
  '',
  \`Description:\`,
  job.description || '(no description)',
].join('\\n');

return { json: { ...job, systemPrompt, userPrompt } };
`,
)
addConnection(splitClassifierName, buildUserPromptName)

const openaiClassifierName = nHttpOpenAI(
  'OpenAI Classifier',
  CLASSIFIER_MODEL,
  { jsonMode: true, maxTokens: 512, temperature: 0, batchInterval: 1500 },
)
addConnection(buildUserPromptName, openaiClassifierName)

const parseClassifierName = nCode(
  'Parse Classifier + Apply Capa 7',
  `
const job = $('Build Classifier User Prompt').item.json;
const ai = $json;
const buNameToId = $('Build Classifier System Prompt').first().json.buNameToId;

let parsed;
try {
  const content = ai.choices && ai.choices[0] && ai.choices[0].message && ai.choices[0].message.content;
  parsed = JSON.parse(content || '{}');
} catch (e) {
  parsed = { match: false, score: 0, area: null, reason: 'parse_error: ' + e.message };
}

const area = (typeof parsed.area === 'string' && parsed.area.length > 0) ? parsed.area : null;
let score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 0;
let match = !!parsed.match;
let reason = parsed.reason || '';
const businessUnitId = area ? (buNameToId[area] || null) : null;

// Capa 7: budget-reject override
const BUDGET_REJECT = [
  /below\\s+(swl|the|its)?\\s*(minimum|engagement|threshold|viable)/i,
  /budget\\s+(insufficient|non.?viable|prohibitive|incompatible|too\\s+low)/i,
  /ticket\\s+(too\\s+low|below|insufficient|non.?viable)/i,
  /far\\s+below/i,
  /too\\s+low\\s+for/i,
  /unrealistic\\s+budget/i,
  /severely\\s+underpriced/i,
  /engagement\\s+minimum/i
];
const ticketViable = (job.ticket || 0) >= 40;
if (!match && area && ticketViable && BUDGET_REJECT.some(re => re.test(reason))) {
  match = true;
  reason = '[layer7: budget-reject override] originally: ' + reason;
  if (score < 30) score = 30;
}

const newStatus = match ? 'qualified' : 'discarded';

return { json: {
  job_id: job.id,
  newStatus,
  match,
  score,
  area,
  reason,
  businessUnitId,
}};
`,
)
addConnection(openaiClassifierName, parseClassifierName)

const transitionClassifierName = nHttpRpcTransition(
  'Transition (classifier)',
  `={{ JSON.stringify({
  p_job_id: $json.job_id,
  p_to_status: $json.newStatus,
  p_actor: 'brain_classifier',
  p_actor_detail: '${CLASSIFIER_MODEL}',
  p_reason: $json.reason,
  p_classifier_match: $json.match,
  p_classifier_score: $json.score,
  p_classifier_area: $json.area,
  p_business_unit_id: $json.businessUnitId
}) }}`,
)
addConnection(parseClassifierName, transitionClassifierName)
addConnection(transitionClassifierName, splitClassifierName) // loop back

// ── Final workflow object ──────────────────────────────────────
const workflow = {
  name: 'Brain Classifier',
  nodes,
  connections,
  active: true,
  settings: { executionOrder: 'v1', timezone: 'America/Argentina/Buenos_Aires' },
  pinData: {},
  meta: {},
}

const output = path.join(__dirname, 'classifier.json')
fs.writeFileSync(output, JSON.stringify(workflow, null, 2))
console.log(`✓ Escrito ${output}`)
console.log(`  Nodos: ${nodes.length}`)
console.log(`  Modelo: ${CLASSIFIER_MODEL}`)
