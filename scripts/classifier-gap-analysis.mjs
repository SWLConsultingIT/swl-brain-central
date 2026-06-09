import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// 1. Last classifier_run_at globally
const { data: lastRun } = await supabase
  .from('jobs')
  .select('id, title, classifier_run_at, status')
  .not('classifier_run_at', 'is', null)
  .order('classifier_run_at', { ascending: false })
  .limit(5)

console.log('═══ ÚLTIMAS 5 CORRIDAS DEL CLASSIFIER ═══')
for (const j of lastRun || []) {
  console.log(`  ${j.classifier_run_at}  [${j.status.padEnd(20)}]  ${(j.title||'').slice(0,55)}`)
}

// 2. Classifier runs per hour for the last 7 days
const { data: all } = await supabase
  .from('jobs')
  .select('classifier_run_at')
  .not('classifier_run_at', 'is', null)
  .gte('classifier_run_at', '2026-06-01T00:00:00Z')
  .order('classifier_run_at')

const byHour = {}
for (const r of all || []) {
  const hour = r.classifier_run_at.slice(0, 13)  // YYYY-MM-DDTHH
  byHour[hour] = (byHour[hour] || 0) + 1
}

console.log('\n═══ CORRIDAS POR HORA (junio 1+) ═══')
const hours = Object.keys(byHour).sort()
for (const h of hours) {
  const bar = '█'.repeat(Math.min(byHour[h], 40))
  console.log(`  ${h}  ${String(byHour[h]).padStart(3)}  ${bar}`)
}

// 3. Find the biggest gap
let lastT = null
let gaps = []
for (const r of all || []) {
  const t = new Date(r.classifier_run_at).getTime()
  if (lastT) {
    const diff = (t - lastT) / 60000  // minutes
    if (diff > 30) {
      gaps.push({ from: new Date(lastT).toISOString(), to: r.classifier_run_at, minutes: Math.round(diff) })
    }
  }
  lastT = t
}

console.log('\n═══ HUECOS > 30 MIN ENTRE CORRIDAS ═══')
for (const g of gaps.slice(-15)) {
  console.log(`  ${g.from.slice(0,19)} → ${g.to.slice(0,19)}   (${g.minutes} min sin actividad)`)
}

// 4. ¿Hay un patrón? Frecuencia típica
if (all && all.length > 1) {
  const diffs = []
  for (let i = 1; i < all.length; i++) {
    const d = (new Date(all[i].classifier_run_at) - new Date(all[i-1].classifier_run_at)) / 60000
    if (d < 60) diffs.push(d)
  }
  diffs.sort((a,b) => a-b)
  const median = diffs[Math.floor(diffs.length/2)]
  const p90 = diffs[Math.floor(diffs.length*0.9)]
  console.log(`\n═══ INTERVALO TÍPICO ENTRE CORRIDAS ═══`)
  console.log(`  Median: ${median?.toFixed(1)} min`)
  console.log(`  P90:    ${p90?.toFixed(1)} min`)
  console.log(`  Sample count: ${diffs.length}`)
}

// 5. ¿Hay jobs prequalified VIEJOS (> 24h) sin clasificar?
const oneDayAgo = new Date(Date.now() - 86400000).toISOString()
const { count: oldStuck } = await supabase
  .from('jobs')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'prequalified')
  .is('classifier_run_at', null)
  .lt('created_at', oneDayAgo)

console.log(`\n═══ JOBS PREQUALIFIED COLGADOS > 24h ═══`)
console.log(`  ${oldStuck} jobs (si > 0 = el classifier está caído hace mucho)`)

// 6. Histórico: cuántos jobs hubo en cada día de prequalified ingresados vs classified
const days = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07', '2026-06-08']
console.log(`\n═══ INGESTADOS vs CLASIFICADOS POR DÍA ═══`)
console.log(`  Día         Prequalif. del día   Classifier corrió ese día`)
for (const d of days) {
  const start = `${d}T00:00:00Z`
  const end = `${d}T23:59:59Z`
  const [{ count: prequals }, { count: classified }] = await Promise.all([
    supabase.from('jobs').select('*', { count: 'exact', head: true })
      .gte('created_at', start).lte('created_at', end),
    supabase.from('jobs').select('*', { count: 'exact', head: true })
      .gte('classifier_run_at', start).lte('classifier_run_at', end)
  ])
  console.log(`  ${d}   ${String(prequals).padStart(6)}                  ${String(classified).padStart(6)}`)
}
