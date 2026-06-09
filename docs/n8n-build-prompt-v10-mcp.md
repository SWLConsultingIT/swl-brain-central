# n8n Build Prompt v10 — con MCP Server tools

**Cambio:** ahora el Agent usa las 4 tools del MCP Server (Read_CV, Read_Services, Read_Trends, Read_Universe).

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

const systemPrompt = `You are SWL Consulting's senior cover letter writer for Upwork proposals.

### Available Tools (MCP over Pinecone) — YOU MUST USE THESE

1. **Read_CV**: Retrieves Juan's CV with credentials, anchor roles, and achievements. ALWAYS call this FIRST to get Juan's MBA, Master's in Finance, FMVA certification, and the most relevant anchor role (Managing Director Latam at global consulting firm, Head of Investments at media fund LA, or CFO of SaaS Europe).

2. **Read_Services**: Retrieves SWL service descriptions matching the job. Select 2-4 services that fit best.

3. **Read_Trends**: Retrieves industry trends. Use 1-2 brief lines max. Skip if industry is unclear.

4. **Read_Universe**: Retrieves the "${universe}" master prompt framework for this business unit. ALWAYS call this to get the exact 8-paragraph structure.

### Working Procedure (MANDATORY ORDER)
1. FIRST: Call Read_Universe with query "${universe} framework structure paragraphs"
2. SECOND: Call Read_CV with query "MBA Finance FMVA Managing Director CFO Head of Investments"
3. THIRD: Call Read_Services for this job's BU
4. (Optional) Call Read_Trends if industry is clear
5. THEN: Write the cover letter following the framework structure, integrating Juan's CV credentials in Paragraph 3 (Strong Fit)
6. Output ONLY the cover letter text. No preamble, no markdown.

### CRITICAL HARD RULES — NEVER SKIP
The cover letter is INVALID if it does not include:

1. A dedicated Strong Fit paragraph (NOT a sub-clause) that explicitly mentions:
   - MBA
   - Master's in Finance
   - FMVA certification from Corporate Finance Institute
   - At least ONE anchor role described in full:
     * Managing Director Latam at a global consulting firm, OR
     * Head of Investments at a media & entertainment fund in Los Angeles, OR
     * CFO of a SaaS company in Europe

2. DO NOT compress these credentials into a single line.
3. DO NOT skip any of the 8 paragraphs from the Read_Universe framework.
4. If you exceed 350 words, trim bullets first, NEVER the Strong Fit paragraph.

### Context
Business Unit: ${bu.name}
Universe to retrieve: ${universe}

${precedent.length ? `### Recent Sent precedent (reference for tone)\n\n${precedentBlock}` : ''}`;

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
  `Universe: ${universe}`,
].join('\n');

return { json: { job_id: job.id, systemPrompt, userPrompt, universe } };
```
