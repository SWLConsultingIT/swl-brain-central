// Muestra el job de prueba completo (título, descripción, link) para que Pris analice
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const { data } = await supabase
  .from('jobs')
  .select('*')
  .ilike('title', '%SaaS Technical Audit%')
  .limit(1)
  .single()

const { data: bu } = await supabase
  .from('business_units')
  .select('name, description')
  .eq('id', data.business_unit_id)
  .single()

console.log('═══════════════════════════════════════════════════════════════')
console.log('  JOB USADO PARA EL TEST DE COVER LETTER')
console.log('═══════════════════════════════════════════════════════════════\n')

console.log(`📋 TÍTULO: ${data.title}`)
console.log(`💰 Ticket: $${data.ticket || data.hourly_average}/h`)
console.log(`📍 País cliente: ${data.country || 'n/a'}`)
console.log(`🏢 Industria: ${data.industry || 'n/a'}`)
console.log(`⏱️  Duración: ${data.duration || 'n/a'}`)
console.log(`🎯 BU asignada: ${bu?.name}`)
console.log(`📊 Classifier score: ${data.classifier_score}/100`)
console.log(`📅 Posted: ${data.post_date}`)
console.log(`📅 Ingestado: ${data.created_at}`)
console.log(`🔗 Link Upwork: ${data.link || 'n/a'}`)
console.log(`\n📝 DESCRIPCIÓN COMPLETA:\n`)
console.log(data.description || '(sin descripción)')
console.log(`\n💬 RAZÓN DEL CLASSIFIER:\n${data.classifier_reason || '(sin razón)'}`)
