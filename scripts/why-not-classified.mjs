// Desglose exacto: por qué quedaron 228 jobs sin clasificar (no pasaron el filtro pre-classifier)
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const WINDOW_START = '2026-06-05T00:00:00Z'
const WINDOW_END = '2026-06-08T23:59:59Z'

// Cargar todos los jobs del weekend que NO fueron clasificados
const { data: notClassified } = await supabase
  .from('jobs')
  .select('id, title, hourly_average, ticket, ticket_currency, post_date, proposals_count, status, created_at')
  .gte('created_at', WINDOW_START)
  .lte('created_at', WINDOW_END)
  .is('classifier_run_at', null)
  .order('created_at', { ascending: false })

console.log(`Total no clasificados: ${notClassified?.length || 0}\n`)

// Aplicar la misma lógica del SQL filter (0012_brain_prefilter_hourly_only.sql):
//   1. No hourly (fixed-price) → hourly_average IS NULL
//   2. Hourly <= $40 (estricto)
//   3. Posteado > 24h atrás (si tiene post_date)
//   4. Más de 50 proposals
const reasons = {
  'fixed_price (sin hourly_average)': [],
  'hourly_rate <= $40 (debajo del piso)': [],
  'posted > 24h (job viejo)': [],
  'proposals_count > 50 (saturado)': [],
  'otro / sin razón clara': [],
}

const now = new Date()
for (const j of notClassified || []) {
  if (j.hourly_average == null) {
    reasons['fixed_price (sin hourly_average)'].push(j)
  } else if (j.hourly_average <= 40) {
    reasons['hourly_rate <= $40 (debajo del piso)'].push(j)
  } else if (j.post_date && (now - new Date(j.post_date)) > 24*60*60*1000) {
    reasons['posted > 24h (job viejo)'].push(j)
  } else if (j.proposals_count != null && j.proposals_count > 50) {
    reasons['proposals_count > 50 (saturado)'].push(j)
  } else {
    reasons['otro / sin razón clara'].push(j)
  }
}

console.log('╔═══════════════════════════════════════════════════════════════╗')
console.log('║   DESGLOSE: POR QUÉ NO LLEGARON AL CLASSIFIER                  ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

for (const [reason, jobs] of Object.entries(reasons).sort((a,b) => b[1].length - a[1].length)) {
  const pct = ((jobs.length / (notClassified?.length || 1)) * 100).toFixed(0)
  console.log(`📌 ${reason.padEnd(45)} ${String(jobs.length).padStart(4)}  (${pct}%)`)
}

console.log(`\n═══════════════════════════════════════════════════════════════`)
console.log('  EJEMPLOS por cada razón')
console.log('═══════════════════════════════════════════════════════════════\n')

for (const [reason, jobs] of Object.entries(reasons)) {
  if (jobs.length === 0) continue
  console.log(`\n── ${reason} (${jobs.length}) ── primeros 5:`)
  for (const j of jobs.slice(0, 5)) {
    const hourly = j.hourly_average != null ? `$${j.hourly_average}/h` : 'NO hourly'
    const tickStr = j.ticket ? ` ticket=$${j.ticket}` : ''
    const props = j.proposals_count != null ? ` prop=${j.proposals_count}` : ''
    const age = j.post_date ? `${Math.round((now - new Date(j.post_date))/3600000)}h atrás` : 'sin fecha'
    console.log(`   ${hourly.padEnd(12)} ${age.padEnd(15)} ${props.padStart(8)} ${tickStr.padStart(14)}  "${(j.title||'').slice(0, 55)}"`)
  }
}

// Casos hourly bajos: ¿qué tan bajos son? distribución
console.log(`\n\n═══════════════════════════════════════════════════════════════`)
console.log(`  DISTRIBUCIÓN DE HOURLY RATES (los descartados por rate bajo)`)
console.log(`═══════════════════════════════════════════════════════════════`)
const hourlyLow = reasons['hourly_rate <= $40 (debajo del piso)']
const buckets = { '$0-$10': 0, '$10-$20': 0, '$20-$30': 0, '$30-$40': 0 }
for (const j of hourlyLow) {
  const h = j.hourly_average
  if (h < 10) buckets['$0-$10']++
  else if (h < 20) buckets['$10-$20']++
  else if (h < 30) buckets['$20-$30']++
  else buckets['$30-$40']++
}
for (const [b, c] of Object.entries(buckets)) {
  const bar = '█'.repeat(Math.min(c, 80))
  console.log(`   ${b.padEnd(10)} ${String(c).padStart(4)}  ${bar}`)
}

console.log(`\n💡 Conclusión: si bajamos el piso de $40 a $30, recuperamos ${buckets['$30-$40']} jobs adicionales para clasificar.`)
console.log(`   Si bajamos a $25, recuperamos ${buckets['$30-$40'] + buckets['$20-$30']} jobs.`)
