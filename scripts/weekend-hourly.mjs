// ¿Los scrapers n8n corrieron el sábado y domingo?
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const days = [
  { label: 'Sábado 13/06', start: '2026-06-13T00:00:00Z', end: '2026-06-14T00:00:00Z' },
  { label: 'Domingo 14/06', start: '2026-06-14T00:00:00Z', end: '2026-06-15T00:00:00Z' },
  { label: 'Lunes 15/06',  start: '2026-06-15T00:00:00Z', end: '2026-06-16T00:00:00Z' },
]

for (const d of days) {
  console.log('\n' + '─'.repeat(60))
  console.log(`${d.label}`)
  console.log('─'.repeat(60))

  const { data, count } = await supabase
    .from('jobs')
    .select('created_at', { count: 'exact' })
    .gte('created_at', d.start)
    .lt('created_at', d.end)
    .order('created_at', { ascending: true })

  console.log(`Total ingestados: ${count}`)

  if (!data || data.length === 0) {
    console.log('   (cero — scrapers no corrieron o no había jobs)')
    continue
  }

  // Distribución por hora del día (UTC)
  const byHour = new Array(24).fill(0)
  for (const j of data) {
    const h = new Date(j.created_at).getUTCHours()
    byHour[h]++
  }

  console.log('\nDistribución por hora (UTC):')
  const hoursWithJobs = byHour.filter(n => n > 0).length
  console.log(`Horas con actividad: ${hoursWithJobs}/24\n`)
  console.log('  Hora UTC  Jobs    Bar')
  for (let h = 0; h < 24; h++) {
    const n = byHour[h]
    if (n === 0) continue
    const bar = '█'.repeat(n)
    console.log(`    ${String(h).padStart(2, '0')}:00   ${String(n).padStart(4)}    ${bar}`)
  }

  // Primer y último ingest del día
  console.log(`\nPrimer ingest del día: ${data[0].created_at.slice(11, 19)} UTC`)
  console.log(`Último ingest del día: ${data[data.length - 1].created_at.slice(11, 19)} UTC`)
}
