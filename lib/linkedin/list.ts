import type { SupabaseClient } from '@supabase/supabase-js'

// Fila de un job de LinkedIn (espejo reducido de JobRow, sin lo Upwork-específico).
export type LinkedInJobRow = {
  id: string
  linkedin_id: string | null
  link: string | null
  title: string
  description: string | null
  company_name: string | null
  company_url: string | null
  location: string | null
  city_region: string | null
  country: string | null
  industry: string | null
  employment_type: string | null
  workplace_type: string | null
  seniority: string | null
  job_function: string | null
  applicants_count: number | null
  easy_apply: boolean | null
  salary_raw: string | null
  posted_ago: string | null
  post_date: string | null
  matched_keyword: string | null
  status: string
  classifier_match: boolean | null
  classifier_score: number | null
  classifier_area: string | null
  classifier_reason: string | null
  classifier_run_at: string | null
  business_unit_id: string | null
  match_score: number | null
  cover_letter_draft: string | null
  cover_letter_generated_at: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
}

const SELECT =
  'id, linkedin_id, link, title, description, company_name, company_url, location, city_region, country, industry, ' +
  'employment_type, workplace_type, seniority, job_function, applicants_count, easy_apply, salary_raw, posted_ago, ' +
  'post_date, matched_keyword, status, classifier_match, classifier_score, classifier_area, classifier_reason, ' +
  'classifier_run_at, business_unit_id, match_score, cover_letter_draft, cover_letter_generated_at, notes, created_at, updated_at'

// Estados que muestra el board (mismos que Upwork, sin invites/connects).
const ACTIVE_STATUSES = ['qualified', 'proposal_drafted', 'ready_to_send', 'sent', 'responded', 'discarded_review']
const DISCARDED_LIMIT = 400
const NEW_LIMIT = 400

export async function listLinkedInJobs(supabase: SupabaseClient): Promise<LinkedInJobRow[]> {
  const [active, recentDiscarded, fresh] = await Promise.all([
    supabase.from('linkedin_jobs').select(SELECT).in('status', ACTIVE_STATUSES).order('created_at', { ascending: false }),
    supabase.from('linkedin_jobs').select(SELECT).eq('status', 'discarded').order('updated_at', { ascending: false }).limit(DISCARDED_LIMIT),
    supabase.from('linkedin_jobs').select(SELECT).in('status', ['new', 'prequalified']).order('post_date', { ascending: false }).limit(NEW_LIMIT),
  ])

  if (active.error) throw new Error(active.error.message)
  if (recentDiscarded.error) throw new Error(recentDiscarded.error.message)
  if (fresh.error) throw new Error(fresh.error.message)

  const merged = [
    ...(active.data ?? []),
    ...(recentDiscarded.data ?? []),
    ...(fresh.data ?? []),
  ] as unknown as LinkedInJobRow[]

  const seen = new Set<string>()
  const out: LinkedInJobRow[] = []
  for (const j of merged) {
    if (seen.has(j.id)) continue
    seen.add(j.id)
    if (!j.link && j.linkedin_id) j.link = `https://www.linkedin.com/jobs/view/${j.linkedin_id}`
    out.push(j)
  }
  return out
}
