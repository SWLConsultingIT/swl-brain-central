# n8n Build Prompt v11 — Google Doc + MCP tools

**Cambio:** ahora usa el contenido completo del Google Doc como base del system prompt, y le dice al Agent que use las MCP tools para info adicional (como hace el compañero).

```javascript
const job = $('Fetch this job').item.json;
const bu = $('Fetch BU').item.json;
const precedentRaw = $json;
const precedent = Array.isArray(precedentRaw) ? precedentRaw : (Array.isArray(precedentRaw?.body) ? precedentRaw.body : []);

const docContent = $('Get a document').first().json?.content || '';

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

const systemPrompt = `${docContent}

### Prerequisites
- The user will pass: JOB POST, JOB FULL DESCRIPTION, Business Unit, Universe.

### Available Tools (MCP over Pinecone)
1. **Read_CV**: Retrieves Juan's CV with credentials and anchor roles. ALWAYS call this to get MBA, Master's in Finance, FMVA, and the relevant anchor role.
2. **Read_Services**: Retrieves SWL service descriptions matching the job.
3. **Read_Trends**: Retrieves industry trends. Use briefly if relevant.
4. **Read_Universe**: Retrieves the "${universe}" framework structure.

### Working Procedure (MANDATORY)
1. FIRST: Call Read_Universe with query "${universe} framework structure paragraphs"
2. SECOND: Call Read_CV with query "Juan MBA Master Finance FMVA Managing Director CFO"
3. THIRD: Call Read_Services for this job's needs
4. THEN: Compose the proposal following the framework, integrating CV credentials in Paragraph 3
5. Output ONLY the final cover letter text

### Context
Business Unit: ${bu.name}
Universe: ${universe}

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
