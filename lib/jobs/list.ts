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
}

const SELECT = 'id, upwork_id, title, link, description, ticket, ticket_currency, hourly_average, duration, proposals_count, status, ' +
  'classifier_match, classifier_score, classifier_area, classifier_reason, classifier_run_at, match_score, ' +
  'business_unit_id, cover_letter_draft, cover_letter_generated_at, industry, country, post_date, created_at, updated_at, notes, questions, questions_answers, ' +
  'matched_keyword, preferred_location, preferred_location_mandatory, experience_level, engagement, hourly_min, hourly_max, weekly_budget, skills, ' +
  'client_total_hires, client_total_spent, client_verification, client_total_reviews, client_rating, client_company_name, ' +
  'total_applicants, invites_sent, interviewing, unanswered_invites, total_hired, viewed_by_client, published_date'

const ACTIVE_STATUSES = ['qualified', 'proposal_drafted', 'ready_to_send', 'sent', 'responded', 'discarded_review']
const DISCARDED_WINDOW_DAYS = 3
const PROSPECTS_LIMIT = 400

export async function listJobs(supabase: SupabaseClient): Promise<JobRow[]> {
  const sinceWindow = new Date(Date.now() - DISCARDED_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

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
      .gte('updated_at', sinceWindow)
      .order('created_at', { ascending: false }),
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

  return [
    ...(active.data ?? []),
    ...(recentDiscarded.data ?? []),
    ...(prospects.data ?? []),
  ] as unknown as JobRow[]
}
