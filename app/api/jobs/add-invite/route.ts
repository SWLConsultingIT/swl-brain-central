import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerClient } from '@/lib/supabase/server'
import { llmClassify } from '@/lib/classifier/llm-classifier'
import { generateCoverLetter } from '@/lib/cover-letter/generator'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/jobs/add-invite  { title, description, link? }
 *
 * Alta manual de un INVITE. Juan abre el invite en Upwork, copia TÍTULO + DESCRIPCIÓN
 * y los pega acá (el link del job no se puede leer por API — el token no tiene scope
 * para leer propuestas ni el título/descripción de un job por id).
 *
 * Con el texto pegado hacemos TODO inline, igual que el pipeline normal:
 *   1) insertar como is_invite
 *   2) clasificar (elegir Business Unit) — a los invites NUNCA se los descarta
 *   3) generar la cover letter -> queda en 'proposal_drafted', listo para revisar
 *
 * Al quedar en proposal_drafted con post_date=hoy, ningún cron lo toca.
 */
function extractUpworkId(link: string): string | null {
  const cipher = link.match(/~0?2?(\d{10,})/)
  if (cipher) return cipher[1]
  const bare = link.match(/(\d{15,})/)
  if (bare) return bare[1]
  return null
}

export async function POST(request: Request) {
  const supabase = getServerClient()

  let body: { title?: unknown; description?: unknown; link?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const title = String(body.title ?? '').trim()
  const description = String(body.description ?? '').trim()
  const link = String(body.link ?? '').trim() || null

  if (!title) {
    return NextResponse.json({ error: 'Pegá el título del invite' }, { status: 400 })
  }
  if (description.length < 30) {
    return NextResponse.json(
      { error: 'Pegá la descripción del job (así generamos la cover letter)' },
      { status: 400 },
    )
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing in env' }, { status: 503 })
  }
  const anthropic = new Anthropic({ apiKey })

  // 1) Insertar el invite. post_date=hoy para que no lo expire el cron y ordene fresco.
  const nowIso = new Date().toISOString()
  const { data: inserted, error: insErr } = await supabase
    .from('jobs')
    .insert({
      upwork_id: link ? extractUpworkId(link) : null,
      link,
      is_invite: true,
      title,
      description,
      status: 'new',
      post_date: nowIso,
    })
    .select('id')
    .single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  const jobId = inserted.id

  // 2) Clasificar para elegir la Business Unit. A los invites NUNCA los descartamos:
  //    aunque el classifier dude, forzamos match y usamos la BU sugerida (o la primera activa).
  let buId: string | null = null
  let area: string | null = null
  let score = 0
  let reason = 'Invite del cliente (no se descarta)'
  try {
    const cls = await llmClassify(
      { title, description, ticket: null, industry: null },
      supabase,
      anthropic,
    )
    buId = cls.business_unit_id
    area = cls.area
    score = cls.score
    if (cls.reason) reason = `Invite — ${cls.reason}`
  } catch {
    // si falla la clasificación seguimos igual: es un invite, hay que responderlo
  }
  if (!buId) {
    const { data: fallbackBu } = await supabase
      .from('business_units')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    buId = fallbackBu?.id ?? null
  }

  await supabase
    .from('jobs')
    .update({
      status: 'qualified',
      business_unit_id: buId,
      classifier_area: area,
      classifier_match: true,
      classifier_score: score,
      match_score: score,
      classifier_reason: reason,
      classifier_run_at: nowIso,
    })
    .eq('id', jobId)

  // 3) Generar la cover letter -> proposal_drafted. Si no hay BU no se puede: queda qualified.
  if (buId) {
    try {
      const result = await generateCoverLetter(
        { title, description, ticket: null, industry: null, country: null, duration: null },
        buId,
        supabase,
        anthropic,
      )
      await supabase.rpc('brain_transition_job', {
        p_job_id: jobId,
        p_to_status: 'proposal_drafted',
        p_actor: 'brain_cover_letter',
        p_actor_detail: result.model,
        p_reason: `Invite — cover letter generada (${result.precedent_count} precedentes)`,
        p_cover_letter_draft: result.cover_letter,
      })
    } catch (e) {
      return NextResponse.json({
        ok: true,
        id: jobId,
        cover_letter: false,
        warning: `Invite creado y clasificado, pero falló la cover letter: ${(e as Error).message}`,
      })
    }
  }

  return NextResponse.json({ ok: true, id: jobId, cover_letter: Boolean(buId) })
}
