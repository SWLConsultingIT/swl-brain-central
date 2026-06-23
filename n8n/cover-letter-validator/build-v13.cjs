// Build "Brain Cover Letter v13" — adds CV + Validated Cover Letters as docs,
// rewrites Build Prompt with sanitization, removes empty precedent, upgrades model.
// Reads Brain Cover Letter-3.json (the CURRENT live flow with AI Agent + OpenAI + MCP + Pinecone)
// Output: /Brain Cover Letter v13.json (gitignored)

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC  = path.join(ROOT, 'Brain Cover Letter-3.json');
const OUT  = path.join(ROOT, 'Brain Cover Letter v13.json');

const CV_DOC_ID       = '1Vkpti3ZSXMMUd6wMPL7w_a_zu8B6I9ykAsM-0spOiw8';
const EXAMPLES_DOC_ID = '13NkWK6WKd5gCw_7OLdfdpMUDI0cGlV_sizYPO3qw5Us';

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.floor(((Date.now() + Math.random() * 1e6) % 16));
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});

const wf = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const find = (name) => wf.nodes.find(n => n.name === name);

// === Clone "Get a document" for CV and Examples ===
const docOriginal = find('Get a document');
if (!docOriginal) throw new Error('Cannot find "Get a document" node in source workflow');

function cloneDocFor(docId, name, position) {
  const clone = JSON.parse(JSON.stringify(docOriginal));
  clone.id = `${name.replace(/\s+/g,'-').toLowerCase()}-${uuid().slice(0,8)}`;
  clone.name = name;
  clone.position = position;
  clone.parameters = {
    operation: 'get',
    documentURL: `https://docs.google.com/document/d/${docId}/edit?usp=sharing`,
  };
  return clone;
}

const origPos = docOriginal.position || [0, 0];
const getCV       = cloneDocFor(CV_DOC_ID,       'Get CV',       [origPos[0] + 224,  origPos[1]]);
const getExamples = cloneDocFor(EXAMPLES_DOC_ID, 'Get Examples', [origPos[0] + 448,  origPos[1]]);

wf.nodes.push(getCV, getExamples);

// === Rewrite Build Prompt ===
const buildPrompt = find('Build Prompt');
buildPrompt.parameters.jsCode = `// Build Prompt v13 — reads 3 Drive docs (Master Prompt + CV + Examples)
// Sanitizes Google Docs markdown escaping (\\#, \\*, \\[, \\]).
// Removes empty precedent (proposals.cover_letter is empty, confirmed 2026-06-11).
// Keeps MCP tools available to the Agent as supplementary lookups.

const job = $('Fetch this job').item.json;
const bu = $('Fetch BU').item.json;

// ─── Helper: clean Google Docs escapes + collapse blanks ─────────
function cleanDocText(raw) {
  if (!raw) return '';
  let text = String(raw);
  text = text.replace(/\\\\([#*\\[\\]_\\-\\\\])/g, '$1');
  text = text.replace(/\\n{3,}/g, '\\n\\n');
  text = text.replace(/[ \\t]+$/gm, '');
  return text.trim();
}

// ─── Read + clean the 3 docs ─────────────────────────────────────
const masterPromptText = cleanDocText($('Get a document').first().json?.content || '');
const cvText           = cleanDocText($('Get CV').first().json?.content || '');
const examplesText     = cleanDocText($('Get Examples').first().json?.content || '');

// ─── Pick framework for this BU (use it to hint the Agent) ───────
const BU_TO_UNIVERSE = {
  'AI & Automation': 'Automation and BI',
  'Business Operations & Back-Office': 'Business Mastery',
  'Digital Experience & Product Development': 'Business Mastery',
  'Finance & Accounting': 'Corporate Advisory',
  'Marketing & Brand': 'Market Acceleration',
  'Project Management & BI': 'Business Mastery',
  'Sales & Customer Success': 'Market Acceleration',
  'System Integrations': 'Automation and BI',
};

const universe = BU_TO_UNIVERSE[bu.name] || 'Business Mastery';

// ─── Build system prompt (structured for max obedience) ─────────
const systemPrompt = [
  '# ROLE',
  'You are a senior Upwork proposal writer for SWL Consulting. You write cover letters that win meetings.',
  'Your output is the cover letter text only. No preambles, no commentary, no labels.',
  '',
  '# THIS JOB',
  'Business Unit: ' + (bu.name || 'unknown'),
  'Framework to use: ' + universe + ' (find the matching section in the MASTER PROMPT below and follow its paragraph structure exactly)',
  '',
  '# MASTER PROMPT (4 frameworks defined here; use the section that matches "' + universe + '")',
  '',
  masterPromptText,
  '',
  '# JUAN\\'S BACKGROUND (source of truth for all credentials, roles, employers, achievements)',
  '',
  cvText || '(CV unavailable)',
  '',
  '# VALIDATED COVER LETTERS (canonical SWL voice and structure to mirror)',
  '',
  examplesText || '(Examples unavailable)',
  '',
  '# ABSOLUTE RULES (override anything above if in conflict)',
  '',
  '## R1. SWL Consulting introduction',
  'The paragraph that introduces SWL MUST start with this sentence verbatim:',
  '  "I lead SWL Consulting, a white label software factory focused on AI powered solutions across corporate finance, strategy, operations and growth."',
  'After the verbatim sentence, describe the multidisciplinary team and one specific SWL service relevant to the job.',
  '',
  '## R2. Tools and platforms appear in ONE paragraph only',
  'Brand names (HubSpot, Salesforce, Klaviyo, Mailchimp, Meta Ads, Google Ads, Looker Studio, Apollo, Instantly, NetSuite, QuickBooks, Power BI, Tableau, n8n, Make, Zapier, etc.) must appear in exactly ONE paragraph across the whole letter.',
  'Recommended placement: the SWL intro paragraph lists the brand names.',
  'The hook paragraph (P2) must describe the CAPABILITY without naming brands. Use phrases like "CRM precision", "performance dashboards", "lifecycle marketing", "growth automation".',
  'Bullets must NOT repeat any brand name already used in the SWL intro.',
  '',
  '## R3. Juan\\'s background',
  'Include MBA, Master in Finance, and FMVA when the framework calls for them.',
  'Use executive roles from the CV: Managing Director (global consulting firm), Head of Investments (media and entertainment fund), CFO (SaaS company in Europe), CEO and co-founder (hospitality group).',
  'NEVER invent locations, durations, employers, achievements, or numeric outcomes.',
  'Better to omit a location than to invent one.',
  '',
  '## R4. Voice, length, formatting',
  'Greeting (P1) always starts with: "Hi there, it is a pleasure to connect."',
  'Voice: "we" by default. Use "I" only when speaking as Juan introducing SWL ("I lead SWL Consulting...").',
  'Length: 300 to 350 words total. Hard cap: 380 words.',
  'No em-dashes, no en-dashes, no hyphens between concepts.',
  'Sign with "Juan" on its own line at the end.',
  '',
  '## R5. Call to action (P7)',
  'Use a direct, confident CTA: "Let me know your availability so we can schedule a call."',
  'Do NOT use passive phrasing: avoid "If this resonates", "If this aligns", "I would love to", "Happy to", "Should you be interested".',
  '',
  '## R6. SKIP the Next Steps paragraph',
  'Do NOT include a "Next Steps" paragraph proposing a discovery session, roadmap, 60 day plan, 90 day plan, audit, kickoff session, or implementation phases.',
  'Skip directly from the bullets to the CTA. The Master Prompt may instruct to include Next Steps, but this rule overrides it.',
  '',
  '## R7. Output',
  'Output ONLY the final cover letter text. No preambles, no disclaimers, no meta commentary, no section labels (do not write "Paragraph 1:" etc.).',
  '',
  '# QUALITY SELF-CHECK (run this internally before producing the final output)',
  'Confirm each item:',
  '1. Greeting exact: "Hi there, it is a pleasure to connect."',
  '2. Hook explains pain point + capability with NO brand names.',
  '3. Strong Fit paragraph follows the framework rules for ' + universe + '.',
  '4. SWL intro starts verbatim with the required sentence.',
  '5. Brand names appear in ONE paragraph only across the entire letter.',
  '6. Bullets (3-5) use action verbs and category words, no brand-name repetition.',
  '7. NO Next Steps paragraph (no discovery session, no roadmap, no 60/90 day plan).',
  '8. CTA: direct, "Let me know your availability so we can schedule a call."',
  '9. Closing line + "Juan" signature on its own line.',
  '10. Total length 300-350 words, never above 380.',
  '11. No em-dashes, no en-dashes, no hyphens between concepts.',
  '12. No invented locations or facts. All concrete claims come from the CV.',
  '',
  'If any item fails, fix it before producing the output.',
].join('\\n');

// ─── User prompt: only the job context ───────────────────────────
const userPrompt = [
  '## JOB POST',
  'Title: ' + (job.title || '(no title)'),
  'Industry: ' + (job.industry || 'n/a'),
  'Client location: ' + (job.country || 'n/a'),
  'Duration: ' + (job.duration || 'n/a'),
  'Hourly rate: $' + (job.hourly_average ?? 'n/a') + '/h',
  '',
  'Description:',
  job.description || '(no description)',
  '',
  'Business Unit: ' + (bu.name || 'unknown'),
  'Use the ' + universe + ' framework.',
].join('\\n');

return {
  json: {
    job_id: job.id,
    systemPrompt,
    userPrompt,
    universe,
    _debug: {
      master_chars: masterPromptText.length,
      cv_chars: cvText.length,
      examples_chars: examplesText.length,
      framework: universe,
    },
  },
};
`;

// === OpenAI model: gpt-5-mini (siempre mini, nunca gpt-5) ===
const openaiNode = find('OpenAI Chat Model');
if (openaiNode?.parameters?.model) {
  if (typeof openaiNode.parameters.model === 'object') {
    openaiNode.parameters.model.value = 'gpt-5-mini';
    if (openaiNode.parameters.model.cachedResultName) {
      openaiNode.parameters.model.cachedResultName = 'gpt-5-mini';
    }
  } else {
    openaiNode.parameters.model = 'gpt-5-mini';
  }
}

// === Rewire connections ===
// Original chain: Fetch precedent → Get a document → Build Prompt
// New chain:      Fetch precedent → Get a document → Get CV → Get Examples → Build Prompt

delete wf.connections['Get a document'];
wf.connections['Get a document'] = {
  main: [[{ node: 'Get CV', type: 'main', index: 0 }]]
};
wf.connections['Get CV'] = {
  main: [[{ node: 'Get Examples', type: 'main', index: 0 }]]
};
wf.connections['Get Examples'] = {
  main: [[{ node: 'Build Prompt', type: 'main', index: 0 }]]
};

// === Rename workflow ===
wf.name = 'Brain Cover Letter v13';

fs.writeFileSync(OUT, JSON.stringify(wf, null, 2));
console.log('✅ Written:', OUT);
console.log('   Total nodes:', wf.nodes.length);
console.log('   New nodes: Get CV, Get Examples');
console.log('   Model: gpt-5-mini → gpt-5');
console.log('   Build Prompt: clean escapes + 3 docs concatenated + no precedent');
