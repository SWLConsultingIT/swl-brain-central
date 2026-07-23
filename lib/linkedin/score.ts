import type { LinkedInJobRow } from './list'

// Score de un LinkedIn job. A diferencia de Upwork (score determinístico sobre
// ticket/proposals/cliente), acá usamos el score del classifier (match_score si
// se guardó, sino classifier_score). LinkedIn no expone las señales de cliente
// de Upwork, así que el score IA es la mejor referencia.
export function linkedinPct(j: LinkedInJobRow): number | null {
  return j.match_score ?? j.classifier_score ?? null
}

// Lead caliente: vale la pena aplicar YA. Alto score + poca competencia + fresco.
// Solo aplica a jobs a los que todavía te podés postular.
export function isHotLead(j: LinkedInJobRow): boolean {
  if (['sent', 'responded', 'discarded', 'discarded_review'].includes(j.status)) return false
  const score = linkedinPct(j) ?? 0
  const fewApplicants = j.applicants_count != null && j.applicants_count <= 10
  const DAY = 86400000
  const fresh = !!j.post_date && Date.now() - new Date(j.post_date).getTime() < 3 * DAY
  return score >= 70 && fewApplicants && fresh
}

// Motivo legible de por qué se descartó. Prioriza la razón del classifier.
export function discardReason(j: LinkedInJobRow): string {
  if (j.classifier_reason) return j.classifier_reason
  return 'Descartado por el classifier'
}
