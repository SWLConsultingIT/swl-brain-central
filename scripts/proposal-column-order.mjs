// Verifica el orden de los 17 jobs en la columna "Proposal" del kanban
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const { data } = await supabase
  .from('jobs')
  .select('title, created_at, cover_letter_generated_at, hourly_average, ticket')
  .eq('status', 'proposal_drafted')
  .order('created_at', { ascending: false })

console.log(`📋 Orden de los ${data?.length || 0} jobs en columna "Proposal" del kanban:\n`)
data?.forEach((j, i) => {
  const isToday = j.created_at?.startsWith('2026-06-09')
  const mark = isToday ? '👈 HOY' : ''
  const ticket = j.ticket ? `$${j.ticket}` : `$${j.hourly_average}/h`
  console.log(`${String(i+1).padStart(2)}. ${j.created_at.slice(0,16).replace('T',' ')}  ${ticket.padEnd(10)}  "${(j.title||'').slice(0, 60)}"  ${mark}`)
})
