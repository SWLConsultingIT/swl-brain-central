# n8n Build Prompt v9 — con Pinecone como tool

**Cambio:** Build Prompt ya no lee Drive (lo eliminamos). Ahora el Agent consulta Pinecone como tool.

```javascript
const job = $('Fetch this job').item.json;
const bu = $('Fetch BU').item.json;
const precedentRaw = $json;
const precedent = Array.isArray(precedentRaw) ? precedentRaw : (Array.isArray(precedentRaw?.body) ? precedentRaw.body : []);

const MAX = 600;
const precedentBlock = precedent.map((p, i) => {
  const cl = p.cover_letter ? '\n' + p.cover_letter.slice(0, MAX) + (p.cover_letter.length > MAX ? '…' : '') : '\n(no text)';
  return `### Precedent ${i+1}: ${p.job_title}` + cl;
}).join('\n\n');

// Map BU to framework name for Pinecone query
const BU_TO_FRAMEWORK = {
  'AI & Automation': 'Automation and BI',
  'Business Operations & Back-Office': 'Business Mastery',
  'Digital Experience & Product Development': 'Business Mastery',
  'Finance & Accounting': 'Corporate Advisory',
  'Marketing & Brand': 'Market Acceleration',
  'Project Management & BI': 'Business Mastery',
  'Sales & Customer Success': 'Market Acceleration',
  'System Integrations': 'Automation and BI',
};

const frameworkName = BU_TO_FRAMEWORK[bu.name] || 'Business Mastery';

const systemPrompt = `You are SWL Consulting's senior cover letter writer for Upwork proposals.

## PROCESS (mandatory steps)
1. FIRST: Use the Pinecone Vector Store tool to retrieve the "${frameworkName}" master prompt framework. Query: "${frameworkName} framework cover letter structure paragraphs Strong Fit MBA credentials".
2. THEN: Write the cover letter strictly following ALL 8 paragraphs from that framework, in the exact order specified.
3. Output ONLY the cover letter text. No preamble, no markdown, no labels.

## CRITICAL HARD RULES — NEVER SKIP
The cover letter is INVALID if it does not include ALL of:

1. A dedicated Strong Fit paragraph (NOT a sub-clause) explicitly mentioning:
   - MBA
   - Master's in Finance
   - FMVA certification from Corporate Finance Institute
   - At least ONE anchor role described in full:
     * Managing Director Latam at a global consulting firm, OR
     * Head of Investments at a media & entertainment fund in Los Angeles, OR
     * CFO of a SaaS company in Europe

2. DO NOT compress these credentials into a single line.
3. DO NOT skip any paragraph from the framework structure.
4. If total exceeds 350 words, trim bullets first, NEVER trim the Strong Fit paragraph.

## SWL Business Unit context
Name: ${bu.name || 'unknown'}
Description: ${bu.description || ''}
Scopes: ${(bu.scopes || []).join(' · ')}

${precedent.length ? `## Recent Sent precedent (reference for tone, do not copy)\n\n${precedentBlock}` : ''}`;

const userPrompt = [
  '## JOB POST',
  `Title: ${job.title}`,
  `Industry: ${job.industry || 'n/a'}`,
  `Client location: ${job.country || 'n/a'}`,
  `Duration: ${job.duration || 'n/a'}`,
  `Hourly rate: $${job.hourly_average}/h`,
  '',
  'Description:',
  job.description || '(no description)',
  '',
  `Business Unit: ${bu.name}`,
  `Framework to retrieve from Pinecone: ${frameworkName}`,
].join('\n');

return { json: { job_id: job.id, systemPrompt, userPrompt, framework: frameworkName } };
```
