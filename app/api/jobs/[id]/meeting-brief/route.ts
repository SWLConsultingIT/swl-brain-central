import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerClient } from '@/lib/supabase/server'
import { generateMeetingBrief, type BriefJob } from '@/lib/jobs/meeting-brief'

export const dynamic = 'force-dynamic'
// Haiku escribe 13 secciones + n8n crea el Doc: puede tardar 20-40s. Sin esto,
// Vercel corta la función (~10-15s) y el botón queda colgado en "Generando…".
export const maxDuration = 60

/**
 * POST /api/jobs/[id]/meeting-brief
 *
 * "Generar brief" (vista Client Reply): arma el Client Meeting Brief (Job Post +
 * Cover Letter) con Anthropic Haiku → HTML → lo manda al webhook n8n que crea el
 * Google Doc → guarda el link en jobs.meeting_brief_url y lo devuelve.
 * Si ya existe el link, no regenera (devuelve el existente) salvo body { force:true }.
 */
const BRIEF_URL =
  process.env.N8N_MEETING_BRIEF_URL ?? 'https://n8n.srv949269.hstgr.cloud/webhook/create-meeting-brief'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  let force = false
  try {
    const body = (await request.json()) as { force?: unknown }
    if (typeof body?.force === 'boolean') force = body.force
  } catch {
    /* sin body */
  }

  const { data: job, error: fetchErr } = await supabase
    .from('jobs')
    .select(
      'id, title, description, cover_letter_draft, client_company_name, country, industry, ' +
        'classifier_area, skills, hourly_min, hourly_max, ticket, duration, meeting_brief_url',
    )
    .eq('id', id)
    .single()

  if (fetchErr || !job) return NextResponse.json({ error: 'job not found' }, { status: 404 })

  const existing = (job as { meeting_brief_url?: string | null }).meeting_brief_url
  if (existing && !force) return NextResponse.json({ ok: true, id, url: existing, cached: true })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing in env' }, { status: 503 })

  // 1) generar el HTML del brief
  let html: string
  try {
    html = await generateMeetingBrief(job as unknown as BriefJob, new Anthropic({ apiKey }))
  } catch (e) {
    return NextResponse.json({ error: `brief generation failed: ${(e as Error).message}` }, { status: 500 })
  }
  if (!html) return NextResponse.json({ error: 'empty brief from model' }, { status: 502 })

  // 2) n8n crea el Google Doc y devuelve { url }
  const title = `Client Meeting Brief — ${(job as { title?: string }).title ?? 'Upwork'}`
  let url = ''
  try {
    const res = await fetch(BRIEF_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, html }),
    })
    if (!res.ok) return NextResponse.json({ error: `n8n ${res.status}` }, { status: 502 })
    const out = (await res.json().catch(() => ({}))) as { url?: string; documentUrl?: string; link?: string }
    url = out.url ?? out.documentUrl ?? out.link ?? ''
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
  if (!url) return NextResponse.json({ error: 'n8n no devolvió el link del Doc' }, { status: 502 })

  // 3) persistir el link
  const { error: updErr } = await supabase.from('jobs').update({ meeting_brief_url: url }).eq('id', id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, id, url })
}
