// Rescata el job CFO-Controller que fue mal descartado
// Lo mueve: discarded → discarded_review (donde lo podés promover manual desde la UI)
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const { data } = await supabase
  .from('jobs')
  .select('id, title, status, classifier_reason')
  .ilike('title', '%CFO-Controller for Odoo%')
  .eq('status', 'discarded')
  .limit(1)

if (!data || data.length === 0) {
  console.log('❌ No se encontró el job')
  process.exit(1)
}

const job = data[0]
console.log('Encontrado:', job.title)
console.log('Status actual:', job.status)
console.log('ID:', job.id)

const { data: transition, error } = await supabase.rpc('brain_transition_job', {
  p_job_id: job.id,
  p_to_status: 'discarded_review',
  p_actor: 'human',
  p_actor_detail: 'manual_rescue_false_negative_2026_06_16',
  p_reason: 'Wrongly discarded — CFO-Controller + Odoo clearly matches F&A and Business Ops BUs. Classifier over-inferred "full-time hire" from operational/team-mgmt language. Prompt fix pending.',
})

if (error) {
  console.error('Error:', error)
  process.exit(1)
}

console.log('\n✅ Transition:', transition)
console.log('\nAhora va a aparecer en tu UI bajo el filtro "Review"')
