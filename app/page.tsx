import { redirect } from 'next/navigation'

// La app abre directo en Prospects. Dejamos "/" como redirect (no como página)
// para que cualquier link a la raíz —el logo del header, etc.— siga funcionando.
export default function Home() {
  redirect('/prospects')
}
