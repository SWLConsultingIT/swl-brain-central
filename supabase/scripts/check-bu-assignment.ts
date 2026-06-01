// Diagnóstico: cuántas proposals tienen business_unit_id asignado.
// Determina si necesitamos clasificador batch antes del curador.
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

const { count: total }       = await supabase.from('proposals').select('*', { count: 'exact', head: true })
const { count: withBU }      = await supabase.from('proposals').select('*', { count: 'exact', head: true }).not('business_unit_id', 'is', null)
const { count: sent }        = await supabase.from('proposals').select('*', { count: 'exact', head: true }).eq('status', 'Sent')
const { count: sentWithBU }  = await supabase.from('proposals').select('*', { count: 'exact', head: true }).eq('status', 'Sent').not('business_unit_id', 'is', null)
const { count: lost }        = await supabase.from('proposals').select('*', { count: 'exact', head: true }).eq('status', 'Lost')
const { count: lostWithBU }  = await supabase.from('proposals').select('*', { count: 'exact', head: true }).eq('status', 'Lost').not('business_unit_id', 'is', null)

console.log(`Total proposals:               ${total}`)
console.log(`Con business_unit_id:          ${withBU}`)
console.log('')
console.log(`Sent total:                    ${sent}`)
console.log(`Sent con BU asignada:          ${sentWithBU}`)
console.log('')
console.log(`Lost total:                    ${lost}`)
console.log(`Lost con BU asignada:          ${lostWithBU}`)
