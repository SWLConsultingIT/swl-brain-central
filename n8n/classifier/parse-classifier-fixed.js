// Parse Classifier — versión robusta
// Cambios vs versión anterior:
// 1. Extrae JSON aunque venga con preamble/texto extra ("Looking at this... { ... }")
// 2. Loguea raw response cuando falla (visible en n8n para debug)
// 3. reason NUNCA queda vacío — siempre dice algo útil
// 4. Si falla parseo, no descarta silenciosamente — marca como discarded_review

const job = $('Build Classifier User Prompt').item.json;
const ai = $json;
const buNameToId = $('Build Classifier System Prompt').first().json.buNameToId;

// Extraer text de la respuesta de Anthropic
const rawText = (ai.content && ai.content[0] && ai.content[0].text) || '';
const stopReason = ai.stop_reason || 'unknown';

// Intentar extraer JSON aunque venga con preamble o texto extra
function extractJSON(text) {
  if (!text) return null;
  // Sacar code fences si existen
  let s = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  // Buscar el primer { y el último } balanceados
  const start = s.indexOf('{');
  if (start < 0) return null;
  // Match balanceado simple: contar { y }
  let depth = 0, end = -1;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return null;
  const candidate = s.slice(start, end + 1);
  try { return JSON.parse(candidate); } catch { return null; }
}

const parsed = extractJSON(rawText);

// Si NO se pudo parsear, marcar para review (no descartar silenciosamente)
if (!parsed) {
  return { json: {
    job_id: job.id,
    newStatus: 'discarded_review',
    match: false,
    score: 0,
    area: null,
    reason: `parse_failed: stop_reason=${stopReason}, raw_preview="${rawText.slice(0, 150)}"`,
    businessUnitId: null,
    _debug_raw: rawText.slice(0, 500),
  }};
}

// Extraer campos con defaults seguros
const area = (typeof parsed.area === 'string' && parsed.area.length > 0) ? parsed.area : null;
let score = typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : 0;
let match = !!parsed.match;
let reason = (typeof parsed.reason === 'string' && parsed.reason.trim().length > 0)
  ? parsed.reason.trim()
  : `no_reason_returned: match=${match} score=${score} area=${area}`;
const businessUnitId = area ? (buNameToId[area] || null) : null;

// Forbidden-phrase rescue (mantenida del código original)
const FORBIDDEN = [/\bticket\b/i, /\bbudget\b/i, /\bunderpriced\b/i, /\bfar\s+below\b/i, /\btoo\s+low\b/i, /\bengagement\s+minimum/i, /\bhourly\s+rate/i, /\$[0-9]+\s*(USD|hour|hr)/i];
if (!match && area && FORBIDDEN.some(re => re.test(reason))) {
  match = true;
  reason = '[forbidden-phrase rescue] ' + reason.slice(0, 120);
  if (score < 50) score = 50;
}

const newStatus = match ? 'qualified' : 'discarded';
return { json: { job_id: job.id, newStatus, match, score, area, reason, businessUnitId } };
