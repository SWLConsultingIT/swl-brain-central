import type { JobRow } from './list'

// ── Match score DETERMINÍSTICO: cuántas condiciones reales cumple el job ──────
// (no es la opinión de la IA; es objetivo, sobre los datos guardados)
// El score NO premia el mínimo (el scraper ya lo garantiza: ≥$40, ≥1 hire, verificado,
// ≤40 propuestas, etc.). Premia cuánto SUPERA ese mínimo → así rankea calidad real.
export const CRITERIA: { label: string; test: (j: JobRow) => boolean }[] = [
  { label: 'Tarifa ≥ $60/h (sobre el piso de $40)', test: (j) => (j.hourly_max ?? j.ticket ?? 0) >= 60 },
  { label: 'Tarifa premium ≥ $100/h', test: (j) => (j.hourly_max ?? j.ticket ?? 0) >= 100 },
  { label: 'Muy poca competencia (≤ 5 propuestas)', test: (j) => j.proposals_count != null && j.proposals_count <= 5 },
  { label: 'Poca competencia (≤ 10 propuestas)', test: (j) => j.proposals_count != null && j.proposals_count <= 10 },
  { label: 'Cliente invierte fuerte (gastó ≥ $5k)', test: (j) => (j.client_total_spent ?? 0) >= 5000 },
  { label: 'Cliente muy activo (≥ 5 contrataciones)', test: (j) => (j.client_total_hires ?? 0) >= 5 },
  { label: 'Rating excelente (≥ 4.7★)', test: (j) => (j.client_rating ?? 0) >= 4.7 },
  { label: 'Entrás muy temprano (≤ 2 invitaciones)', test: (j) => (j.invites_sent ?? 0) <= 2 },
]

export function matchPct(j: JobRow): number {
  if (j.match_score != null) return j.match_score // valor exacto guardado en Supabase
  const met = CRITERIA.filter((c) => c.test(j)).length // fallback local (misma lógica)
  return Math.round((met / CRITERIA.length) * 100)
}

// "Aplicá ya" / lead caliente: vale la pena saltar sobre este job YA.
// Los primeros en postularse ganan → score alto + poca competencia + fresco (o cliente activo recién).
export function isHotLead(j: JobRow): boolean {
  // Solo tiene sentido en jobs a los que todavía te podés postular.
  if (['sent', 'responded', 'discarded', 'discarded_review'].includes(j.status)) return false
  const DAY = 86400000
  const score = matchPct(j)
  const fewProposals = j.proposals_count != null && j.proposals_count <= 5
  const fresh = !!j.post_date && Date.now() - new Date(j.post_date).getTime() < DAY
  const clientActive = !!j.last_client_activity && Date.now() - new Date(j.last_client_activity).getTime() < 2 * DAY
  return score >= 60 && fewProposals && (fresh || clientActive)
}

export function matchDetail(j: JobRow): string {
  const met = CRITERIA.filter((c) => c.test(j)).length
  return `${met}/${CRITERIA.length} criterios\n` + CRITERIA.map((c) => `${c.test(j) ? '✓' : '✗'} ${c.label}`).join('\n')
}

const ALLOWED_COUNTRIES = new Set([
  'United States', 'USA', 'Canada', 'Argentina', 'Spain', 'Mexico', 'Bahamas', 'Brazil',
  'British Virgin Islands', 'Chile', 'Colombia', 'Costa Rica', 'Dominican Republic', 'Ireland',
  'Italy', 'Panama', 'Peru', 'Paraguay', 'United Kingdom', 'Switzerland', 'Uruguay',
])

// Humaniza los motivos generados por máquina del pre-filtro (brain_ticket_filter).
// Hay varias redacciones según la versión del prefiltro (SQL vs n8n); cubrimos todas.
function humanizeFilterReason(reason: string): string {
  // Frescura: "posted 98 hours ago, outside 48h window" | "outside 48h window"
  const posted = reason.match(/posted\s+(\d+)\s+hours?\s+ago/i)
  if (posted) return `Posteado hace ${posted[1]}h al scrapearlo (fuera de la ventana de 48h)`
  if (/outside\s+\d+h\s+window/i.test(reason)) return 'Posteado fuera de la ventana de 48h'
  // Tarifa: "not above $40/h" | "below $40/h threshold" | "ticket 30 USD below $40"
  if (/not above/i.test(reason) || /below\s+\$?\d+.*threshold/i.test(reason) || /below\s+\$\d+\/h/i.test(reason))
    return 'Tarifa por debajo del piso de $40/h'
  // Precio fijo
  if (/fixed-price/i.test(reason)) return 'Proyecto a precio fijo (sin tarifa horaria)'
  // Competencia saturada
  if (/proposals exceeds/i.test(reason) || /saturated/i.test(reason))
    return 'Demasiada competencia (propuestas por encima del límite)'
  // Decisión sin actor explícito: no inventamos un motivo, lo decimos tal cual.
  if (/without explicit decision/i.test(reason)) return 'Descartado sin decisión explícita (cambio directo de estado)'
  return reason // ya legible (p. ej. razón del classifier)
}

// Motivo legible de por qué un job fue descartado. Prioriza la razón REAL registrada
// en job_decisions al descartar (j.discard_reason); si no existe, deriva del estado:
// 1) razón del classifier (rechazo por fit), 2) ticket bajo, 3) país fuera de los 20,
// 4) frescura (posteado >48h antes de scrapearlo), 5) genérico.
export function discardReason(j: JobRow): string {
  if (j.discard_reason) return humanizeFilterReason(j.discard_reason)
  if (j.classifier_reason) return j.classifier_reason
  const rate = j.hourly_max ?? (j.ticket_currency === 'USD' ? j.ticket : null)
  if (rate != null && rate < 40) return `Tarifa $${rate}/h, por debajo del piso de $40/h`
  if (j.country && !ALLOWED_COUNTRIES.has(j.country)) return `País del cliente (${j.country}) fuera de los 20 permitidos`
  if (j.post_date && j.created_at) {
    const ageH = Math.round((new Date(j.created_at).getTime() - new Date(j.post_date).getTime()) / 3_600_000)
    if (ageH > 48) return `Posteado hace ${ageH}h al scrapearlo (fuera de la ventana de 48h)`
  }
  return 'Descartado por filtros automáticos (frescura o ticket)'
}
