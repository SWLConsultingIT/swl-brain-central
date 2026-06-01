import type { SupabaseClient } from '@supabase/supabase-js'

export type JobRow = {
  id: string
  upwork_id: string | null
  title: string
  link: string | null
  ticket: number | null
  ticket_currency: string | null
  status: string
  classifier_match: boolean | null
  classifier_score: number | null
  classifier_area: string | null
  classifier_reason: string | null
  classifier_run_at: string | null
  business_unit_id: string | null
  industry: string | null
  country: string | null
  post_date: string | null
  created_at: string
}

export async function listJobs(supabase: SupabaseClient): Promise<JobRow[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select(
      'id, upwork_id, title, link, ticket, ticket_currency, status, ' +
        'classifier_match, classifier_score, classifier_area, classifier_reason, classifier_run_at, ' +
        'business_unit_id, industry, country, post_date, created_at',
    )
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as JobRow[]
}
