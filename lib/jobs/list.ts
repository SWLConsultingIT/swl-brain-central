import type { SupabaseClient } from '@supabase/supabase-js'

export type JobRow = {
  id: string
  upwork_id: string | null
  title: string
  link: string | null
  description: string | null
  ticket: number | null
  ticket_currency: string | null
  hourly_average: number | null
  duration: string | null
  proposals_count: number | null
  status: string
  classifier_match: boolean | null
  classifier_score: number | null
  match_score: number | null
  classifier_area: string | null
  classifier_reason: string | null
  classifier_run_at: string | null
  business_unit_id: string | null
  cover_letter_draft: string | null
  cover_letter_generated_at: string | null
  industry: string | null
  country: string | null
  post_date: string | null
  created_at: string
  updated_at: string | null
  notes: string | null
  questions: { question: string; sequenceNumber: number }[] | null
  questions_answers: { question: string; sequenceNumber: number; answer: string; edited_at: string | null }[] | null
  // Campos de scrape completo (migración 0023) + hourly_min/max (0019)
  matched_keyword: string | null
  preferred_location: string[] | null
  preferred_location_mandatory: boolean | null
  experience_level: string | null
  engagement: string | null
  hourly_min: number | null
  hourly_max: number | null
  weekly_budget: number | null
  skills: string[] | null
  client_total_hires: number | null
  client_total_spent: number | null
  client_verification: string | null
  client_total_reviews: number | null
  client_rating: number | null
  client_company_name: string | null
  total_applicants: number | null
  invites_sent: number | null
  interviewing: number | null
  unanswered_invites: number | null
  total_hired: number | null
  viewed_by_client: boolean | null
  published_date: string | null
  // Motivo real registrado al descartar (job_decisions.reason). Solo se llena para discarded.
  discard_reason: string | null
  // true si una persona lo descartó/mandó a revisar a mano (tachito), para resaltarlo en la UI.
  discarded_by_human?: boolean
  // Connects gastados al postularse (migración 0030): base = cobro de Upwork, boost = extra.
  connects_base: number | null
  connects_boost: number | null
}

const SELECT = 'id, upwork_id, title, link, description, ticket, ticket_currency, hourly_average, duration, proposals_count, status, ' +
  'classifier_match, classifier_score, classifier_area, classifier_reason, classifier_run_at, match_score, ' +
  'business_unit_id, cover_letter_draft, cover_letter_generated_at, industry, country, post_date, created_at, updated_at, notes, questions, questions_answers, ' +
  'matched_keyword, preferred_location, preferred_location_mandatory, experience_level, engagement, hourly_min, hourly_max, weekly_budget, skills, ' +
  'client_total_hires, client_total_spent, client_verification, client_total_reviews, client_rating, client_company_name, ' +
  'total_applicants, invites_sent, interviewing, unanswered_invites, total_hired, viewed_by_client, published_date, ' +
  'connects_base, connects_boost'

const ACTIVE_STATUSES = ['prequalified', 'qualified', 'proposal_drafted', 'ready_to_send', 'sent', 'responded', 'discarded_review']
const DISCARDED_LIMIT = 800
const PROSPECTS_LIMIT = 400

export async function listJobs(supabase: SupabaseClient): Promise<JobRow[]> {
  const [active, recentDiscarded, prospects] = await Promise.all([
    supabase
      .from('jobs')
      .select(SELECT)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false }),
    supabase
      .from('jobs')
      .select(SELECT)
      .eq('status', 'discarded')
      .order('updated_at', { ascending: false })
      .limit(DISCARDED_LIMIT),
    supabase
      .from('jobs')
      .select(SELECT)
      .eq('status', 'new')
      .order('post_date', { ascending: false })
      .limit(PROSPECTS_LIMIT),
  ])

  if (active.error) throw new Error(active.error.message)
  if (recentDiscarded.error) throw new Error(recentDiscarded.error.message)
  if (prospects.error) throw new Error(prospects.error.message)

  const activeRows = (active.data ?? []) as unknown as JobRow[]
  const discarded = (recentDiscarded.data ?? []) as unknown as JobRow[]

  // Adjuntar el motivo REAL guardado al descartar (job_decisions.reason), en vez de re-adivinarlo.
  // Aplica a los descartados duros (status='discarded') Y a los que cayeron a revisión
  // (status='discarded_review', p. ej. movidos por el botón Update por saturación/interviews),
  // para que la solapa "Para Chequear" muestre el motivo real.
  const needReason = [
    ...discarded,
    ...activeRows.filter((j) => j.status === 'discarded_review'),
  ]
  if (needReason.length > 0) {
    const ids = needReason.map((j) => j.id)
    // .in() va por GET: con cientos de ids la URL excede el límite y da Bad Request.
    // Por eso consultamos en chunks de 200 y juntamos.
    const CHUNK = 200
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK))

    const results = await Promise.all(
      chunks.map((chunk) =>
        supabase
          .from('job_decisions')
          .select('job_id, reason, actor, actor_detail, created_at')
          .in('to_status', ['discarded', 'discarded_review'])
          .in('job_id', chunk)
          .order('created_at', { ascending: false }),
      ),
    )

    // Preferimos la razón REAL (actor != 'unknown'). El audit trigger agrega una
    // decisión sintética actor='unknown' ("without explicit decision") DESPUÉS del
    // descarte real, que de otro modo taparía el motivo verdadero por ser más reciente.
    const realByJob = new Map<string, string>()
    const fallbackByJob = new Map<string, string>()
    // Jobs que descartó una persona a mano (tachito / a-revisar), para resaltarlos en la UI.
    const humanDiscard = new Set<string>()
    for (const { data: decisions } of results) {
      for (const d of decisions ?? []) {
        if (d.actor === 'human' && (d.actor_detail === 'ui_discard' || d.actor_detail === 'ui_to_review')) {
          humanDiscard.add(d.job_id)
        }
        if (!d.reason) continue
        if (d.actor !== 'unknown') {
          if (!realByJob.has(d.job_id)) realByJob.set(d.job_id, d.reason)
        } else if (!fallbackByJob.has(d.job_id)) {
          fallbackByJob.set(d.job_id, d.reason)
        }
      }
    }
    for (const j of needReason) {
      j.discard_reason = realByJob.get(j.id) ?? fallbackByJob.get(j.id) ?? null
      j.discarded_by_human = humanDiscard.has(j.id)
    }
  }

  return [
    ...(active.data ?? []),
    ...discarded,
    ...(prospects.data ?? []),
  ] as unknown as JobRow[]
}
