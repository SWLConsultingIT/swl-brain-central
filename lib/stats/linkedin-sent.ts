import type { SupabaseClient } from '@supabase/supabase-js'
import type { SentRow } from './sent'

// Estadísticas de aplicaciones ENVIADAS en LinkedIn (espejo de getSentProposals).
// Fuente: linkedin_job_decisions con to_status='sent', cruzado con linkedin_jobs.
// LinkedIn no tiene connects → connects siempre null (la StatsView oculta esa columna).
export async function getLinkedInSent(supabase: SupabaseClient): Promise<SentRow[]> {
  const { data: decisions, error } = await supabase
    .from('linkedin_job_decisions')
    .select('job_id, created_at')
    .eq('to_status', 'sent')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  const decs = decisions ?? []
  if (decs.length === 0) return []

  const seen = new Set<string>()
  const uniq: { job_id: string; created_at: string }[] = []
  for (const d of decs) {
    if (seen.has(d.job_id)) continue
    seen.add(d.job_id)
    uniq.push(d)
  }

  const ids = uniq.map((d) => d.job_id)
  type JobLite = { id: string; title: string; classifier_area: string | null; link: string | null; status: string }
  const jobsById = new Map<string, JobLite>()
  const CHUNK = 200
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { data } = await supabase
      .from('linkedin_jobs')
      .select('id, title, classifier_area, link, status')
      .in('id', chunk)
    for (const j of data ?? []) jobsById.set(j.id, j as JobLite)
  }

  return uniq.map((d) => {
    const j = jobsById.get(d.job_id)
    return {
      job_id: d.job_id,
      sent_at: d.created_at,
      title: j?.title ?? '(sin título)',
      category: j?.classifier_area ?? null,
      link: j?.link ?? null,
      responded: j?.status === 'responded',
      connects: null,
    }
  })
}
