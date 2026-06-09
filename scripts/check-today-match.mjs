// Verificar dónde está exactamente el job qualified de hoy
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// El job de hoy con match
const { data } = await supabase
  .from('jobs')
  .select('id, title, status, classifier_match, classifier_score, classifier_area, cover_letter_draft, cover_letter_generated_at, created_at, classifier_run_at')
  .eq('classifier_match', true)
  .gte('classifier_run_at', '2026-06-09T00:00:00Z')

console.log(`Jobs match=true clasificados hoy: ${data?.length || 0}\n`)
for (const j of data || []) {
  console.log(`📋 "${j.title}"`)
  console.log(`   status (kanban):       ${j.status}`)
  console.log(`   classifier_match:      ${j.classifier_match}`)
  console.log(`   classifier_score:      ${j.classifier_score}`)
  console.log(`   classifier_area:       ${j.classifier_area}`)
  console.log(`   cover_letter_draft:    ${j.cover_letter_draft ? `${j.cover_letter_draft.length} chars` : 'NULL'}`)
  console.log(`   cover_generated_at:    ${j.cover_letter_generated_at}`)
  console.log(`   created_at:            ${j.created_at}`)
  console.log()
}

console.log(`📍 En el kanban de /prospects este job aparece en la columna:`)
for (const j of data || []) {
  const colMap = {
    'new': 'Prospect',
    'prequalified': 'Prequalified',
    'qualified': 'Qualified',
    'proposal_drafted': 'Proposal',
    'ready_to_send': 'Ready to Send',
    'sent': 'Sent',
    'discarded': 'Discarded',
    'discarded_review': 'Revisar Discarded',
  }
  console.log(`   "${j.title.slice(0,50)}" → "${colMap[j.status] || j.status}"`)
}
