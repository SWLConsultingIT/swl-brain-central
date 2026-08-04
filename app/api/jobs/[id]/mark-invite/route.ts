import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/mark-invite   { invite: boolean }
 * Marca a mano si el job vino por invite (Client Reply). Domina sobre la detección
 * automática para el origen en Odoo. NO manda a Odoo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  let invite: boolean | null = null
  try {
    const body = (await request.json()) as { invite?: unknown }
    if (typeof body?.invite === 'boolean') invite = body.invite
  } catch {
    /* sin body → null */
  }

  const { error } = await supabase.from('jobs').update({ marked_invite: invite }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id, marked_invite: invite })
}
