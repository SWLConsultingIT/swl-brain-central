import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/linkedin/[id]/fit   { fit: true | false | null }
 * Marca "Hubo fit / No hubo fit" en Client Reply de LinkedIn. NO manda a Odoo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  let fit: boolean | null = null
  try {
    const body = (await request.json()) as { fit?: unknown }
    if (typeof body?.fit === 'boolean') fit = body.fit
    else if (body?.fit === null) fit = null
  } catch {
    /* sin body → null */
  }

  const { error } = await supabase.from('linkedin_jobs').update({ had_fit: fit }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id, had_fit: fit })
}
