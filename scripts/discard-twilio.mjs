// Mueve el job Twilio (falso positivo) de proposal_drafted → discarded_review.
// Usa el RPC canónico brain_transition_job para que quede en el audit trail.
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const JOB_ID = 'b124865e-ea17-4405-a960-a35d9bc5e1ec'

const { data: before } = await supabase
  .from('jobs')
  .select('id, title, status')
  .eq('id', JOB_ID)
  .single()
console.log('Antes:', before)

const { data, error } = await supabase.rpc('brain_transition_job', {
  p_job_id: JOB_ID,
  p_to_status: 'discarded_review',
  p_actor: 'human',
  p_actor_detail: 'manual_retroactive_correction',
  p_reason: 'False positive — scope is single 60-90 min consultation call (now caught by HARD_EXCLUSION #17 SHORT SESSION DELIVERABLES). Not retried.',
})

if (error) { console.error('RPC error:', error); process.exit(1) }
console.log('Transition:', data)

const { data: after } = await supabase
  .from('jobs')
  .select('id, title, status')
  .eq('id', JOB_ID)
  .single()
console.log('Después:', after)
