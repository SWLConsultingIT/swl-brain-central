// Investigación: jobs con hourly > $40 que NO se clasificaron — caso por caso
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const WINDOW_START = '2026-06-05T00:00:00Z'
const WINDOW_END = '2026-06-08T23:59:59Z'

// Todos los jobs del weekend con hourly > $40 (que DEBERÍAN haber pasado a classifier)
const { data: highRate } = await supabase
  .from('jobs')
  .select('id, title, hourly_average, ticket, ticket_currency, post_date, proposals_count, status, classifier_run_at, classifier_match, classifier_reason, created_at')
  .gte('created_at', WINDOW_START)
  .lte('created_at', WINDOW_END)
  .gt('hourly_average', 40)
  .order('hourly_average', { ascending: false })

console.log(`Total jobs weekend con hourly > $40: ${highRate?.length || 0}\n`)

// Separar: clasificados vs no clasificados
const classified = highRate.filter(j => j.classifier_run_at)
const notClass = highRate.filter(j => !j.classifier_run_at)

console.log(`✅ Clasificados (pasaron el filtro):   ${classified.length}`)
console.log(`❌ NO clasificados (no pasaron):       ${notClass.length}\n`)

// Para los NO clasificados con hourly > 40, ¿qué los descartó?
console.log('═══════════════════════════════════════════════════════════════')
console.log('  JOBS HOURLY > $40 QUE NO LLEGARON AL CLASSIFIER')
console.log('═══════════════════════════════════════════════════════════════\n')

const now = new Date()
const breakdown = {
  'post_date > 24h (job viejo)': [],
  'post_date NULL (sin fecha de post)': [],
  'currency != USD': [],
  'proposals > 50 (saturado)': [],
  '❓ misterio (debería haber pasado)': [],
}

for (const j of notClass) {
  if (j.ticket_currency && j.ticket_currency.toUpperCase() !== 'USD') {
    breakdown['currency != USD'].push(j)
  } else if (j.post_date == null) {
    breakdown['post_date NULL (sin fecha de post)'].push(j)
  } else if ((now - new Date(j.post_date)) > 24*60*60*1000) {
    breakdown['post_date > 24h (job viejo)'].push(j)
  } else if (j.proposals_count != null && j.proposals_count > 50) {
    breakdown['proposals > 50 (saturado)'].push(j)
  } else {
    breakdown['❓ misterio (debería haber pasado)'].push(j)
  }
}

for (const [reason, jobs] of Object.entries(breakdown)) {
  if (jobs.length === 0) continue
  console.log(`\n📌 ${reason}: ${jobs.length} jobs`)
  for (const j of jobs.slice(0, 15)) {
    const postAge = j.post_date ? `${Math.round((now - new Date(j.post_date))/3600000)}h` : 'NULL'
    const created = `${Math.round((now - new Date(j.created_at))/3600000)}h ago`
    console.log(`   $${String(j.hourly_average).padEnd(6)} post=${postAge.padEnd(6)} ingreso=${created.padEnd(10)} status=${j.status.padEnd(12)} curr=${j.ticket_currency || 'NULL'}  "${(j.title||'').slice(0, 55)}"`)
  }
}

// ¿Qué status tienen los que no se clasificaron?
console.log('\n\n📊 STATUS de los jobs no clasificados (con hourly > $40):')
const statusCount = {}
for (const j of notClass) statusCount[j.status] = (statusCount[j.status]||0) + 1
for (const [s, c] of Object.entries(statusCount).sort((a,b) => b[1] - a[1])) {
  console.log(`   ${s.padEnd(25)} ${c}`)
}
