// Sincroniza el código del nodo "Build Classifier System Prompt" en
// n8n/classifier/classifier.json para que matchee lo que está en producción.
import fs from 'node:fs'

const path = 'n8n/classifier/classifier.json'
const wf = JSON.parse(fs.readFileSync(path, 'utf-8'))

const NEW_CODE = `function asArray(nodeName) {
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
  if (precByBU.get(p.business_unit_id).length < 5) precByBU.get(p.business_unit_id).push(p.job_title);
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

const HARD_EXCLUSIONS = [
  'pure graphic design only',
  'physical product manufacturing',
  'legal services',
  'medical services',
  'academic writing, grant writing for non-profits',
  'civil/mechanical/electrical/aerospace/hardware engineering',
  'embedded/firmware/DSP/radar/RF/IoT hardware',
  'COACHING/TRAINING ROLES (STRICT): Coach, Trainer, Mentor, Enablement, Workshop, Bootcamp - strict',
  'MICROSOFT ECOSYSTEM (STRICT): M365, Dynamics, SharePoint, Power Platform admin. EXCEPTION: Power BI dashboarding OK',
  'SAP INTERNAL. EXCEPTION: external API pulls OK',
  'PR/MEDIA RELATIONS (STRICT)',
  'CPA TACTICAL (STRICT): US tax, IRS, Delaware C-Corp, SBA, bookkeeping',
  'TOOL-SPECIFIC (STRICT): Framer, Figma (ANY mention), Klaviyo operator, Etsy listing, Smartsheet, Shopify theme, Wix',
  'ONE-TIME TACTICAL',
  'BROKERAGE/NETWORKING without technical scope',
  'RECRUITING, CRYPTO/WEB3, 3D/VFX',
  'SHORT SESSION DELIVERABLES (STRICT): Reject if primary deliverable is a single call/session/consultation/meeting/kickoff/workshop/audit of N minutes or N hours (examples: "60-90 minute consultation", "2 hour kickoff", "1 hour audit", "30-minute call"). Even if framed as strategic consulting or architecture guidance, if the entire engagement fits in one session, REJECT. SWL takes hourly engagements that last days/weeks.',
];


const buNameToId = {};
for (const bu of bus) buNameToId[bu.name] = bu.id;

const systemPrompt = [
  'You are a senior qualification analyst for SWL Consulting.',
  '',
  \`Below are SWL's 8 business units.\`,
  '',
  buSection,
  '',
  '---',
  '',
  'CRITICAL — UPWORK PLATFORM CONTEXT:',
  'ALL jobs on this platform are freelance/contract by definition. There are NO permanent hires, NO full-time employee placements. Even ongoing engagements ("permanent CFO", "monthly retainer", "30+ hrs/week ongoing") are STILL contract work that SWL provides.',
  '',
  'DO NOT reject a job for being:',
  '- "Full-time" or "permanent" sounding (impossible on Upwork)',
  '- "Ongoing operational" (this IS fractional CFO / fractional COO work — F&A and Business Operations BUs explicitly cover this)',
  '- "Day-to-day team management" (legitimate scope for F&A and Business Operations)',
  '- "Implementation + maintenance" (legitimate System Integrations scope)',
  '',
  'ONLY use the explicit hard exclusions list below to reject jobs.',
  '',
  'CRITICAL — DURATION SOURCE OF TRUTH:',
  'The Upwork "duration" field (e.g., "1 to 3 months", "More than 6 months") is set by the client and FREQUENTLY CONTRADICTS the actual scope described in the body. ALWAYS prioritize what the description/summary says. If duration says "1 to 3 months" but the description describes a single call, audit, or one-off task — trust the description (likely SHORT SESSION DELIVERABLES reject).',
  '',
  'HARD EXCLUSIONS (match=false, score<=10):',
  ...HARD_EXCLUSIONS.map(e => \`- \${e}\`),
  '',
  'BU-SPECIFIC: Power BI→PM&BI; n8n/Zapier→SI/AI&A; Meta/Google Ads→M&B; Fractional CFO/COO→F&A; Brand+strategy→M&B',
  '',
  'NEVER mention ticket/budget/hourly rate in reason. If scope fits and no hard exclusion, match=true.',
  '',
  'Return ONLY valid JSON: { "match": bool, "score": 0-100, "area": <BU name>|null, "reason": "..." }',
].join('\\n');

return { json: { systemPrompt, buNameToId } };
`

let updated = false
for (const n of wf.nodes) {
  if (n.name === 'Build Classifier System Prompt') {
    n.parameters.jsCode = NEW_CODE
    updated = true
    console.log('updated:', n.name)
  }
}

if (!updated) {
  console.error('Node not found')
  process.exit(1)
}

fs.writeFileSync(path, JSON.stringify(wf, null, 2), 'utf-8')
console.log('saved', path)
