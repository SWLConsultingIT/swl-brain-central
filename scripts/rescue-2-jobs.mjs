// Rescata 2 jobs mal descartados (Business Ops Manager + Business Proposals)
// Los mueve a discarded_review para que el usuario los vea en la cola de Review
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const RESCUES = [
  {
    pattern: 'Business Operations Manager',
    reason: 'False negative: classifier read as "full-time hire" but Upwork is freelance-only. UPWORK PLATFORM CONTEXT directive (added 2026-06-16) prevents this going forward.',
  },
  {
    pattern: 'Business Proposals and Storytelling',
    reason: 'False negative: classifier read "30-45 min narrative" as the total scope, but a pitch deck creation is typically 20+ hours. SHORT TOTAL WORK SCOPE rule (recalibrated to hours-based, 2026-06-16) corrects this.',
  },
]

for (const r of RESCUES) {
  const { data } = await supabase
    .from('jobs')
    .select('id, title, status')
    .ilike('title', `%${r.pattern}%`)
    .eq('status', 'discarded')
    .limit(1)
  if (!data || data.length === 0) {
    console.log(`Not found or not discarded: ${r.pattern}`)
    continue
  }
  const job = data[0]
  const { data: t, error } = await supabase.rpc('brain_transition_job', {
    p_job_id: job.id,
    p_to_status: 'discarded_review',
    p_actor: 'human',
    p_actor_detail: 'manual_rescue_after_prompt_recalibration_2026_06_16',
    p_reason: r.reason,
  })
  if (error) {
    console.error('Error:', error)
  } else {
    console.log(`✅ Rescued: ${job.title}`)
    console.log(`   transition: ${t[0].from_status} → ${t[0].to_status}`)
  }
}
