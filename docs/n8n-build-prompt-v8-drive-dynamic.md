# n8n Build Prompt v8 — Lectura dinámica desde Google Drive

**Para pegar en:** Brain Cover Letter > nodo **Build Prompt** > reemplazar TODO el código
**Versión:** v8 (2026-06-09)
**Cambio principal:** ahora lee los 4 prompts del Google Doc en Drive en tiempo real

## Cómo funciona

```
1. Download file (nodo previo) descarga el Google Doc como texto plano
2. Build Prompt parsea el texto y extrae las 4 secciones por título "# Name PROMPT"
3. Selecciona el prompt correcto según la BU del job
4. Arma el systemPrompt + userPrompt como antes
```

## Ventajas

- Editás el doc en Drive → próxima cover letter usa la versión nueva
- Cero código que tocar cuando cambia el contenido
- Juan puede editar el doc directo sin tocar n8n

---

## ⬇️ Código completo (copiar y pegar)

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

// ═══════════════════════════════════════════════════════════════
// LEER EL DOC DESDE EL NODO "Download file"
// ═══════════════════════════════════════════════════════════════
const driveItem = $('Download file').first();
let docText = '';
if (driveItem?.binary?.data) {
  docText = Buffer.from(driveItem.binary.data.data, 'base64').toString('utf-8');
} else if (driveItem?.json?.content) {
  docText = driveItem.json.content;
} else if (typeof driveItem?.json === 'string') {
  docText = driveItem.json;
}

// ═══════════════════════════════════════════════════════════════
// PARSEAR LAS 4 SECCIONES POR TÍTULO "# Name PROMPT"
// ═══════════════════════════════════════════════════════════════
const PROMPTS = {};
const sections = docText.split(/^# (.+?) PROMPT\s*$/m);
// sections[0] = lo que está antes del primer título
// sections[1] = nombre del primer prompt, sections[2] = contenido
// sections[3] = nombre del segundo prompt, sections[4] = contenido, etc

for (let i = 1; i < sections.length; i += 2) {
  const name = sections[i].trim().toLowerCase();
  const content = sections[i + 1] ? sections[i + 1].trim() : '';
  PROMPTS[name] = content;
}

// ═══════════════════════════════════════════════════════════════
// MAPEO BU → PROMPT
// ═══════════════════════════════════════════════════════════════
const BU_TO_PROMPT_KEY = {
  'AI & Automation': 'automation and bi',
  'Business Operations & Back-Office': 'business mastery',
  'Digital Experience & Product Development': 'business mastery',
  'Finance & Accounting': 'corporate advisory',
  'Marketing & Brand': 'market acceleration',
  'Project Management & BI': 'business mastery',
  'Sales & Customer Success': 'market acceleration',
  'System Integrations': 'automation and bi',
};

const promptKey = BU_TO_PROMPT_KEY[bu.name] || 'business mastery';
const selectedPrompt = PROMPTS[promptKey] || PROMPTS['business mastery'] || PROMPTS['corporate advisory'] || 'Write a professional cover letter for Upwork following SWL Consulting style.';

// ═══════════════════════════════════════════════════════════════
// BUILD SYSTEM PROMPT FINAL
// ═══════════════════════════════════════════════════════════════
const systemPrompt = `${selectedPrompt}

## SWL Business Unit context: ${bu.name || 'unknown'}
${bu.description || ''}
Scopes: ${(bu.scopes || []).join(' · ')}
Keywords: ${(bu.keywords || []).slice(0, 25).join(', ')}
Good-fit signals: ${bu.good_fit_signals || ''}

${precedent.length ? `## Recent Sent precedent (reference for tone/depth, do not copy)\n\n${precedentBlock}` : '## Recent Sent precedent\n(none yet)'}`;

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
].join('\n');

return { json: { job_id: job.id, systemPrompt, userPrompt, debug_prompts_found: Object.keys(PROMPTS), debug_prompt_key_used: promptKey } };
```

---

## 📝 Diferencias vs v7

| | v7 (hardcoded) | v8 (Drive) |
|---|---|---|
| Los 4 prompts están en... | Código JavaScript en n8n | Google Doc en Drive |
| Para editar el contenido | Pegar código nuevo en n8n | Editar el doc en Drive |
| Necesita deploy | Sí | No |
| Tamaño del Build Prompt | ~570 líneas | ~75 líneas |

## 🧪 Test después de pegar

1. Pegar el código en Build Prompt → Cmd+S guardar workflow
2. Te disparo el webhook con curl con un job qualified
3. Verificamos en Supabase que la cover letter se generó OK
