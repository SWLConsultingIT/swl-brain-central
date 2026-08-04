import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/client-name   { name: string }
 * Guarda (persiste) el nombre del cliente cargado a mano en Client Reply, así queda
 * fijo y compartido entre usuarios (antes vivía solo en el navegador).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  let name = ''
  try {
    const body = (await request.json()) as { name?: unknown }
    if (typeof body?.name === 'string') name = body.name.trim()
  } catch {
    /* sin body → vacío */
  }

  const { error } = await supabase
    .from('jobs')
    .update({ client_contact_name: name || null })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id, client_contact_name: name })
}
