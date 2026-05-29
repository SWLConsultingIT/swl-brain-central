// Aplica la migración 0003: UPDATE proposals SET cover_letter=NULL donde es basura.
// Usa la REST API de Supabase (PATCH) en vez de SQL crudo porque no hay endpoint pgsql público.
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const secretKey = process.env.SUPABASE_SECRET_KEY!
const supabase = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })

// Pre-conteo
const { count: before } = await supabase
  .from('proposals')
  .select('*', { count: 'exact', head: true })
  .like('cover_letter', 'Untitled (%')

console.log(`Filas a limpiar (cover_letter like 'Untitled (%'): ${before}`)

// UPDATE
const { error, count } = await supabase
  .from('proposals')
  .update({ cover_letter: null }, { count: 'exact' })
  .like('cover_letter', 'Untitled (%')

if (error) {
  console.error('ERROR aplicando migración:', error)
  process.exit(1)
}

console.log(`Filas actualizadas:                                ${count}`)

// Post-conteo
const { count: after } = await supabase
  .from('proposals')
  .select('*', { count: 'exact', head: true })
  .like('cover_letter', 'Untitled (%')

console.log(`Quedan con basura (debe ser 0):                    ${after}`)

const { count: totalWithCL } = await supabase
  .from('proposals')
  .select('*', { count: 'exact', head: true })
  .not('cover_letter', 'is', null)

console.log(`Total con cover_letter ahora (debe ser 0):         ${totalWithCL}`)
