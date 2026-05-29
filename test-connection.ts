import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!url || !secretKey) {
  console.error('Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY')
  process.exit(1)
}

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

console.log(`Conectando a ${url} ...`)

const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1 })

if (error) {
  console.error('Error en la conexión:', error.message)
  process.exit(1)
}

console.log('Conexión OK')
console.log(`   Usuarios actuales en auth.users: ${data.users.length}`)
