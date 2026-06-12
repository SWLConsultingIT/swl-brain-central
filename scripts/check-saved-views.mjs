// Validar si los counts de las saved views son reales o bug
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const now = Date.now()
const since = (h) => new Date(now - h * 60 * 60 * 1000).toISOString()

// Cargar todos los jobs con campos relevantes
const { data: jobs } = await supabase
  .from('jobs')
  .select('id, status, post_date, classifier_run_at, cover_letter_draft, classifier_match')

const isFresh = (postDate, hours) => {
  if (!postDate) return false
  return now - new Date(postDate).getTime() < hours * 60 * 60 * 1000
}
const isStale = (runAt, hours) => {
  if (!runAt) return true
  return now - new Date(runAt).getTime() > hours * 60 * 60 * 1000
}

const counts = {
  all: jobs.length,
  hot: jobs.filter(j => j.status === 'qualified' && isFresh(j.post_date, 6)).length,
  fresh: jobs.filter(j => isFresh(j.post_date, 2)).length,
  drafts: jobs.filter(j => !!j.cover_letter_draft && (j.status === 'qualified' || j.status === 'proposal_drafted')).length,
  ready: jobs.filter(j => j.status === 'ready_to_send').length,
  stale: jobs.filter(j => j.status === 'qualified' && !j.cover_letter_draft && isStale(j.classifier_run_at, 6)).length,
  review: jobs.filter(j => j.status === 'discarded_review').length,
}

console.log('\n=== Saved view counts (real-time) ===')
for (const [k, v] of Object.entries(counts)) {
  console.log(`  ${k.padEnd(8)} ${v}`)
}

// Histórico — ¿alguna vez Hot/Fresh tuvieron jobs?
console.log('\n=== ¿Cuántos jobs alguna vez podrían haber caído en Hot/Fresh? ===')
const ever24h = jobs.filter(j => isFresh(j.post_date, 24)).length
const ever48h = jobs.filter(j => isFresh(j.post_date, 48)).length
const qualifiedEver = jobs.filter(j => j.status === 'qualified').length
console.log(`  Jobs posteados < 24h:  ${ever24h}`)
console.log(`  Jobs posteados < 48h:  ${ever48h}`)
console.log(`  Jobs en status='qualified' (cualquier momento): ${qualifiedEver}`)

// Distribución de status para entender el funnel
console.log('\n=== Distribución de status (todos los jobs) ===')
const byStatus = {}
for (const j of jobs) byStatus[j.status] = (byStatus[j.status] || 0) + 1
for (const [s, n] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s.padEnd(20)} ${n}`)
}
