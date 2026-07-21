import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/add-invite  { link: string }
 *
 * Alta manual de un INVITE: Juan pega el link del job del invite.
 * Se inserta un placeholder (is_invite=true, title "procesando…"); n8n lo enriquece
 * después (trae el job de Upwork, clasifica, genera cover letter).
 * Si el job ya existe (mismo upwork_id), solo lo marca como invite.
 */
function extractUpworkId(link: string): string | null {
  // Formatos: .../apply/<slug>_~02<id>/  |  /jobs/~02<id>  |  ~02<id>  |  id numérico largo suelto
  const cipher = link.match(/~0?2?(\d{10,})/)
  if (cipher) return cipher[1]
  const bare = link.match(/(\d{15,})/)
  if (bare) return bare[1]
  return null
}

export async function POST(request: Request) {
  const supabase = getServerClient()

  let body: { link?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  const link = String(body.link ?? '').trim()
  if (!link || !/upwork\.com/i.test(link)) {
    return NextResponse.json({ error: 'Pegá un link válido de Upwork' }, { status: 400 })
  }

  const upworkId = extractUpworkId(link)
  if (!upworkId) {
    return NextResponse.json(
      { error: 'No pude sacar el ID del job de ese link. Pegá el link del JOB (no el de "View proposal").' },
      { status: 400 },
    )
  }

  // ¿Ya existe el job?
  const { data: existing } = await supabase
    .from('jobs')
    .select('id, title, status, is_invite')
    .eq('upwork_id', upworkId)
    .maybeSingle()

  if (existing) {
    if (!existing.is_invite) {
      await supabase.from('jobs').update({ is_invite: true }).eq('id', existing.id)
    }
    return NextResponse.json({ ok: true, id: existing.id, existed: true, title: existing.title })
  }

  // Placeholder: n8n lo completa (título/tarifa/cliente/cover). Aparece ya en Invites como "procesando".
  const { data: inserted, error } = await supabase
    .from('jobs')
    .insert({
      upwork_id: upworkId,
      link,
      is_invite: true,
      title: '⏳ Invite — procesando…',
      status: 'new',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: inserted.id, existed: false })
}
