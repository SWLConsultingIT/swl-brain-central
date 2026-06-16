// Reporte del run de las 12:00 ART con la nueva config
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const now = Date.now()
const HOUR = 60 * 60 * 1000

// 1. Jobs ingestados en últimos 20 min (=run de 12:00 ART)
const since20m = new Date(now - 20 * 60 * 1000).toISOString()
const { count: noonCount, data: noonJobs } = await supabase
  .from('jobs')
  .select('created_at, title, status, classifier_match, classifier_score', { count: 'exact' })
  .gte('created_at', since20m)
  .order('created_at', { ascending: false })

console.log('═'.repeat(70))
console.log('  REPORTE RUN 12:00 ART')
console.log('═'.repeat(70))
console.log(`\n📥 Jobs ingestados últimos 20 min: ${noonCount ?? 0}`)

if (noonCount === 0) {
  console.log('\n❌ No ingresó nada — el cron de las 12 no se disparó O todavía está corriendo')
  console.log('   Verificá en n8n Executions de los 4 scrapers')
} else {
  // Distribución por hora exacta
  const byHour = {}
  for (const j of noonJobs) {
    const h = j.created_at.slice(11, 16) // HH:MM
    byHour[h] = (byHour[h] || 0) + 1
  }
  console.log('\n⏰ Distribución por minuto:')
  for (const [h, n] of Object.entries(byHour).sort()) {
    console.log(`   ${h} UTC  →  ${n} jobs`)
  }

  // Status breakdown
  const byStatus = {}
  for (const j of noonJobs) byStatus[j.status] = (byStatus[j.status] || 0) + 1
  console.log('\n📊 Status de los nuevos:')
  for (const [s, n] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${s.padEnd(20)} ${n}`)
  }

  // ¿Cuántos ya clasificó?
  const classified = noonJobs.filter(j => j.classifier_match !== null).length
  console.log(`\n🧠 Ya clasificados: ${classified}/${noonCount}`)
  if (classified > 0) {
    const matches = noonJobs.filter(j => j.classifier_match === true).length
    console.log(`   - matches: ${matches}`)
    console.log(`   - no-match: ${classified - matches}`)
  }
}

// 2. Comparativa vs run de 06:00 ART (= 09:00 UTC)
console.log('\n' + '─'.repeat(70))
console.log('  COMPARATIVA vs run de 06:00 ART')
console.log('─'.repeat(70))

const start6am = new Date()
start6am.setUTCHours(9, 0, 0, 0)
const end6am = new Date()
end6am.setUTCHours(9, 30, 0, 0)
const { count: morningCount } = await supabase
  .from('jobs')
  .select('*', { count: 'exact', head: true })
  .gte('created_at', start6am.toISOString())
  .lt('created_at', end6am.toISOString())

console.log(`\n  Run 06:00 ART (09:00 UTC):  ${morningCount ?? 0} jobs`)
console.log(`  Run 12:00 ART (15:00 UTC):  ${noonCount ?? 0} jobs`)

// 3. Estado actual del board
const { count: drafted } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'proposal_drafted')
const { count: ready } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'ready_to_send')
const { count: review } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'discarded_review')

console.log('\n📋 ESTADO ACTUAL DEL BOARD')
console.log(`   proposal_drafted:    ${drafted}`)
console.log(`   ready_to_send:       ${ready}`)
console.log(`   discarded_review:    ${review}`)
