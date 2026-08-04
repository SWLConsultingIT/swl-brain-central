import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerClient } from '@/lib/supabase/server'
import { generateMeetingBrief, type BriefJob } from '@/lib/jobs/meeting-brief'

export const dynamic = 'force-dynamic'
// Haiku (13 secciones) + creación del Doc en n8n puede tardar 20-40s.
export const maxDuration = 60

/**
 * POST /api/linkedin/[id]/meeting-brief
 *
 * Igual que el de Upwork pero para linkedin_jobs: arma el Client Meeting Brief
 * (Job Post + Cover Letter) con Haiku → webhook n8n crea el Google Doc → guarda
 * el link en linkedin_jobs.meeting_brief_url.
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
    .from('linkedin_jobs')
    .select(
      'id, title, description, cover_letter_draft, company_name, country, industry, ' +
        'classifier_area, seniority, employment_type, salary_raw, meeting_brief_url',
    )
    .eq('id', id)
    .single()

  if (fetchErr || !job) return NextResponse.json({ error: 'job not found' }, { status: 404 })

  const j = job as unknown as Record<string, unknown>
  const existing = j.meeting_brief_url as string | null
  if (existing && !force) return NextResponse.json({ ok: true, id, url: existing, cached: true })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing in env' }, { status: 503 })

  // Mapear los campos de LinkedIn al shape que espera el generador.
  const briefJob: BriefJob = {
    title: (j.title as string) ?? '',
    description: (j.description as string) ?? null,
    cover_letter_draft: (j.cover_letter_draft as string) ?? null,
    client_company_name: (j.company_name as string) ?? null,
    country: (j.country as string) ?? null,
    industry: (j.industry as string) ?? null,
    classifier_area: (j.classifier_area as string) ?? null,
    skills: null,
    hourly_min: null,
    hourly_max: null,
    ticket: null,
    duration: (j.seniority as string) ?? (j.employment_type as string) ?? null,
  }

  let html: string
  try {
    html = await generateMeetingBrief(briefJob, new Anthropic({ apiKey }))
  } catch (e) {
    return NextResponse.json({ error: `brief generation failed: ${(e as Error).message}` }, { status: 500 })
  }
  if (!html) return NextResponse.json({ error: 'empty brief from model' }, { status: 502 })

  const title = `Client Meeting Brief — ${(j.title as string) ?? 'LinkedIn'}`
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

  const { error: updErr } = await supabase.from('linkedin_jobs').update({ meeting_brief_url: url }).eq('id', id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, id, url })
}
