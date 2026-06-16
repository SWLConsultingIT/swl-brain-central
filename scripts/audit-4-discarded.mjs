import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const patterns = [
  'Business Operations Manager',
  'Business Proposals and Storytelling',
  'CFO-Controller for Odoo',
  'Strategic Finance Advisor',
]

for (const pat of patterns) {
  const { data } = await supabase
    .from('jobs')
    .select('id, title, status, classifier_score, classifier_reason, classifier_area, classifier_run_at, ticket, duration')
    .ilike('title', `%${pat}%`)
    .order('classifier_run_at', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) {
    console.log(`No encontrado: ${pat}\n`)
    continue
  }
  const j = data[0]
  console.log('═'.repeat(80))
  console.log('TITLE:', j.title)
  console.log(`Status actual: ${j.status} | Score: ${j.classifier_score} | Area: ${j.classifier_area}`)
  console.log(`Ticket: $${j.ticket}/h | Duration: ${j.duration}`)
  console.log(`Classifier corrió: ${j.classifier_run_at?.slice(0, 16)?.replace('T', ' ')} UTC`)
  console.log(`Reason:`)
  console.log('  ' + (j.classifier_reason || '').slice(0, 500))
  console.log()
}
