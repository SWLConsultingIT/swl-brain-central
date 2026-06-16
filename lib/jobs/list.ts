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
}

const SELECT = 'id, upwork_id, title, link, description, ticket, ticket_currency, hourly_average, duration, proposals_count, status, ' +
  'classifier_match, classifier_score, classifier_area, classifier_reason, classifier_run_at, ' +
  'business_unit_id, cover_letter_draft, cover_letter_generated_at, industry, country, post_date, created_at, updated_at, notes'

const ACTIVE_STATUSES = ['qualified', 'proposal_drafted', 'ready_to_send', 'sent', 'responded', 'discarded_review']
const DISCARDED_WINDOW_DAYS = 3

export async function listJobs(supabase: SupabaseClient): Promise<JobRow[]> {
  const sinceWindow = new Date(Date.now() - DISCARDED_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const [active, recentDiscarded] = await Promise.all([
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
  ])

  if (active.error) throw new Error(active.error.message)
  if (recentDiscarded.error) throw new Error(recentDiscarded.error.message)

  return [...(active.data ?? []), ...(recentDiscarded.data ?? [])] as unknown as JobRow[]
}
