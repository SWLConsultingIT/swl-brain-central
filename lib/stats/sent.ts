import type { SupabaseClient } from '@supabase/supabase-js'

// Estadísticas de propuestas ENVIADAS desde la app (de ahora en adelante).
// Fuente: job_decisions con to_status='sent' (cada evento = una propuesta enviada),
// cruzado con el job para la categoría (classifier_area) y datos.
// NO incluye la tabla `proposals` histórica (decisión del usuario 2026-07: solo de ahora).

export type SentRow = {
  job_id: string
  sent_at: string
  title: string
  category: string | null
  link: string | null
  responded: boolean // el cliente respondió (status 'responded' = "Client Reply")
  connects: number | null // base + boost gastados en la propuesta (null si no se cargó)
}

export async function getSentProposals(supabase: SupabaseClient): Promise<SentRow[]> {
  const { data: decisions, error } = await supabase
    .from('job_decisions')
    .select('job_id, created_at')
    .eq('to_status', 'sent')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  const decs = decisions ?? []
  if (decs.length === 0) return []

  // Un envío por job (el más reciente si hubiera duplicados).
  const seen = new Set<string>()
  const uniq: { job_id: string; created_at: string }[] = []
  for (const d of decs) {
    if (seen.has(d.job_id)) continue
    seen.add(d.job_id)
    uniq.push(d)
  }

  const ids = uniq.map((d) => d.job_id)
  type JobLite = { title: string; classifier_area: string | null; link: string | null; status: string; connects_base: number | null; connects_boost: number | null }
  const jobsById = new Map<string, JobLite>()
  const CHUNK = 200
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { data } = await supabase
      .from('jobs')
      .select('id, title, classifier_area, link, status, connects_base, connects_boost')
      .in('id', chunk)
    for (const j of data ?? []) jobsById.set(j.id, j as never)
  }

  return uniq.map((d) => {
    const j = jobsById.get(d.job_id)
    const connects =
      j && (j.connects_base != null || j.connects_boost != null)
        ? (j.connects_base ?? 0) + (j.connects_boost ?? 0)
        : null
    return {
      job_id: d.job_id,
      sent_at: d.created_at,
      title: j?.title ?? '(sin título)',
      category: j?.classifier_area ?? null,
      link: j?.link ?? null,
      responded: j?.status === 'responded',
      connects,
    }
  })
}
