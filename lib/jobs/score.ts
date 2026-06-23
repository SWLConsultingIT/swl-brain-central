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

export function matchDetail(j: JobRow): string {
  const met = CRITERIA.filter((c) => c.test(j)).length
  return `${met}/${CRITERIA.length} criterios\n` + CRITERIA.map((c) => `${c.test(j) ? '✓' : '✗'} ${c.label}`).join('\n')
}
