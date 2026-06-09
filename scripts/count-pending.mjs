import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// ¿Cuántos jobs en prequalified sin classifier corrido?
const { count } = await supabase
  .from('jobs')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'prequalified')
  .is('classifier_run_at', null)

console.log(`Jobs prequalified pendientes de clasificar: ${count}`)

// Lista para ver qué son
const { data: pending } = await supabase
  .from('jobs')
  .select('title, ticket, created_at')
  .eq('status', 'prequalified')
  .is('classifier_run_at', null)
  .order('created_at', { ascending: false })
  .limit(20)

console.log('\nDetalle:')
for (const j of pending || []) {
  const age = Math.round((Date.now() - new Date(j.created_at).getTime()) / 60000)
  console.log(`  [${age}min atrás] $${j.ticket || '?'} - ${(j.title||'').slice(0,70)}`)
}
