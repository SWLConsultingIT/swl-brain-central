import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

const { data } = await supabase
  .from('jobs')
  .select('id, title, description')
  .gte('created_at', SEVEN_DAYS_AGO)
  .eq('status', 'proposal_drafted')
  .eq('duration', 'Less than 1 month')

for (const j of data) {
  console.log('═'.repeat(80))
  console.log('TITLE:', j.title)
  console.log('═'.repeat(80))
  console.log(j.description)
  console.log()
}
