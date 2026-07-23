import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerClient } from '@/lib/supabase/server'
import { llmClassify } from '@/lib/classifier/llm-classifier'
import { generateCoverLetter } from '@/lib/cover-letter/generator'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/jobs/by-link  { link, title }
 *
 * Alta de un job pegando SOLO el link + el título (los que Juan ve en la página del job).
 *
 * La API de Upwork NO deja leer un job por su id (scope denegado), pero la BÚSQUEDA sí
 * trae todo el contenido. Así que:
 *   1) si ya lo scrapeó el pipeline, lo devolvemos (existing)
 *   2) si no, pedimos al webhook n8n "brain-job-by-link" que busque por título exacto y
 *      matchee por ciphertext -> devuelve el nodo completo (título, desc, budget, cliente, skills)
 *   3) lo insertamos igual que el scraper + clasificamos + cover letter -> proposal_drafted
 *
 * Como Juan lo eligió a mano, NUNCA se descarta (igual que un invite). Guardamos el link
 * que pegó, así el modal muestra el botón "abrir/postularse" como en los jobs normales.
 */

const N8N_URL =
  process.env.N8N_JOB_BY_LINK_URL ?? 'https://n8n.srv949269.hstgr.cloud/webhook/brain-job-by-link'
const N8N_KEY = process.env.N8N_JOB_BY_LINK_KEY ?? '' // opcional; el webhook lo valida si != CHANGE_ME
// Webhook aparte para las screening questions (por-id). Si no está o falla, seguimos sin questions.
const N8N_SCREENING_URL =
  process.env.N8N_SCREENING_URL ?? 'https://n8n.srv949269.hstgr.cloud/webhook/brain-screening'

/** Trae las screening questions del job vía webhook n8n. Best-effort: cualquier error → []. */
async function fetchScreeningQuestions(jobId: string): Promise<any[]> {
  try {
    const res = await fetch(N8N_SCREENING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: jobId, key: N8N_KEY }),
    })
    const json = await res.json()
    const payload = Array.isArray(json) ? json[0] : json
    return payload && Array.isArray(payload.questions) ? payload.questions : []
  } catch {
    return []
  }
}

/** upwork_id como lo guarda el scraper (node.id, sin el prefijo ~02). */
function extractUpworkId(link: string): string | null {
  const cipher = link.match(/~0?2?(\d{10,})/)
  if (cipher) return cipher[1]
  const bare = link.match(/(\d{15,})/)
  if (bare) return bare[1]
  return null
}

/** ciphertext completo (con dígitos del prefijo) para que el webhook matchee por dígitos. */
function extractCipher(link: string): string | null {
  const m = link.match(/~?0?\d{2}\d{10,}/)
  return m ? m[0] : null
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function rawNum(x: any): number | null {
  return x && typeof x === 'object' ? toNum(x.rawValue) : toNum(x)
}

/** Mapea el nodo del marketplaceJobPostingsSearch a las columnas de `jobs` (igual que el scraper). */
function mapNode(node: any, link: string, nowIso: string, questions: any[]) {
  const client = node.client ?? {}
  const loc = client.location ?? {}
  const act = ((node.job ?? {}).activityStat ?? {}).jobActivity ?? {}
  const occ = node.occupations ?? {}
  const hmin = rawNum(node.hourlyBudgetMin)
  const hmax = rawNum(node.hourlyBudgetMax)
  const hourlyAvg = hmin != null && hmax != null ? (hmin + hmax) / 2 : hmin ?? hmax ?? null
  const ticketRaw =
    hmin != null || hmax != null ? `$${hmin ?? '?'} - $${hmax ?? '?'}` : null

  return {
    upwork_id: node.id != null ? String(node.id) : null,
    link,
    is_invite: false,
    title: node.title ?? '',
    description: node.description ?? '',
    questions: Array.isArray(questions) ? questions : [],
    ticket: hourlyAvg,
    ticket_raw: ticketRaw,
    ticket_currency: 'USD',
    hourly_average: hourlyAvg,
    hourly_min: hmin,
    hourly_max: hmax,
    duration: node.duration ?? null,
    duration_label: node.durationLabel ?? null,
    talent_type: null,
    country: loc.country ?? null,
    city_region: loc.city ?? null,
    client_state: loc.state ?? null,
    client_timezone: loc.timezone ?? null,
    proposals_count: toNum(node.totalApplicants),
    total_applicants: toNum(node.totalApplicants),
    // post_date = ahora: lo agregó Juan hoy, así queda fresco y ningún cron lo expira (igual que add-invite)
    post_date: nowIso,
    published_date: node.publishedDateTime ?? null,
    renewed_date: node.renewedDateTime ?? null,
    industry: occ.category?.prefLabel ?? null,
    matched_keyword: 'by-link',
    experience_level: node.experienceLevel ?? null,
    engagement: node.engagement ?? null,
    weekly_budget: rawNum(node.weeklyBudget),
    freelancers_to_hire: toNum(node.freelancersToHire),
    skills: (node.skills ?? []).map((s: any) => s?.name).filter(Boolean),
    subcategory: node.subcategory ?? null,
    is_premium: node.premium ?? null,
    is_enterprise: node.enterprise ?? null,
    preferred_location: JSON.stringify(node.preferredFreelancerLocation ?? []),
    preferred_location_mandatory: node.preferredFreelancerLocationMandatory ?? null,
    client_total_hires: toNum(client.totalHires),
    client_total_posted_jobs: toNum(client.totalPostedJobs),
    client_total_spent: rawNum(client.totalSpent),
    client_verification: client.verificationStatus ?? null,
    client_total_reviews: toNum(client.totalReviews),
    client_rating: toNum(client.totalFeedback),
    client_member_since: client.memberSinceDateTime ?? null,
    client_company_name: client.companyName ?? null,
    invites_sent: toNum(act.invitesSent),
    interviewing: toNum(act.totalInvitedToInterview),
    total_hired: toNum(act.totalHired),
    unanswered_invites: toNum(act.totalUnansweredInvites),
    total_offered: toNum(act.totalOffered),
    last_client_activity: act.lastClientActivity ?? null,
    raw_data: node,
  }
}

export async function POST(request: Request) {
  const supabase = getServerClient()

  let body: { link?: unknown; title?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const link = String(body.link ?? '').trim()
  const title = String(body.title ?? '').trim()

  if (!link || !/upwork\.com/i.test(link)) {
    return NextResponse.json({ error: 'Pegá el link del job de Upwork' }, { status: 400 })
  }
  if (!title) {
    return NextResponse.json({ error: 'Pegá el título del job' }, { status: 400 })
  }

  const cipher = extractCipher(link)
  const candidateId = extractUpworkId(link)
  if (!cipher) {
    return NextResponse.json({ error: 'No pude leer el id del link' }, { status: 400 })
  }

  // 1) ¿Ya lo tenemos? (el scraper probablemente ya lo trajo)
  if (candidateId) {
    const { data: existing } = await supabase
      .from('jobs')
      .select('id, status')
      .eq('upwork_id', candidateId)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ ok: true, existing: true, id: existing.id, status: existing.status })
    }
  }

  // 2) Traer el nodo completo vía el webhook n8n (busca por título, matchea por ciphertext)
  let payload: { found?: boolean; node?: any } = {}
  try {
    const res = await fetch(N8N_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, ciphertext: cipher, key: N8N_KEY }),
    })
    const json = await res.json()
    payload = Array.isArray(json) ? json[0] : json
  } catch (e) {
    return NextResponse.json(
      { error: `No pude consultar Upwork: ${(e as Error).message}` },
      { status: 502 },
    )
  }

  if (!payload?.found || !payload.node) {
    // Upwork no lo devolvió (job viejo/cerrado o título distinto) -> la UI cae al paste manual
    return NextResponse.json({ ok: false, found: false })
  }

  const node = payload.node
  const nowIso = new Date().toISOString()

  // por si otro proceso lo insertó entre medio: chequear por el id autoritativo del nodo
  if (node.id != null) {
    const { data: dup } = await supabase
      .from('jobs')
      .select('id, status')
      .eq('upwork_id', String(node.id))
      .maybeSingle()
    if (dup) {
      return NextResponse.json({ ok: true, existing: true, id: dup.id, status: dup.status })
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing in env' }, { status: 503 })
  }
  const anthropic = new Anthropic({ apiKey })

  // 3) Traer screening questions (best-effort) e insertar el job con todos los datos reales
  const questions = node.id != null ? await fetchScreeningQuestions(String(node.id)) : []
  const row = mapNode(node, link, nowIso, questions)
  const { data: inserted, error: insErr } = await supabase
    .from('jobs')
    .insert({ ...row, status: 'new' })
    .select('id')
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  const jobId = inserted.id

  // 4) Clasificar (elegir Business Unit). Lo eligió Juan a mano => NUNCA se descarta.
  let buId: string | null = null
  let area: string | null = null
  let score = 0
  let reason = 'Agregado por link (no se descarta)'
  try {
    const cls = await llmClassify(
      { title: row.title, description: row.description, ticket: row.ticket, industry: row.industry },
      supabase,
      anthropic,
    )
    buId = cls.business_unit_id
    area = cls.area
    score = cls.score
    if (cls.reason) reason = `Por link — ${cls.reason}`
  } catch {
    // seguimos igual: Juan lo eligió, hay que dejarlo listo
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

  // 5) Cover letter -> proposal_drafted (listo para revisar y postularse desde el link)
  if (buId) {
    try {
      const result = await generateCoverLetter(
        {
          title: row.title,
          description: row.description,
          ticket: row.ticket,
          industry: row.industry,
          country: row.country,
          duration: row.duration,
        },
        buId,
        supabase,
        anthropic,
      )
      await supabase.rpc('brain_transition_job', {
        p_job_id: jobId,
        p_to_status: 'proposal_drafted',
        p_actor: 'brain_cover_letter',
        p_actor_detail: result.model,
        p_reason: `Por link — cover letter generada (${result.precedent_count} precedentes)`,
        p_cover_letter_draft: result.cover_letter,
      })
    } catch (e) {
      return NextResponse.json({
        ok: true,
        found: true,
        id: jobId,
        cover_letter: false,
        warning: `Job agregado y clasificado, pero falló la cover letter: ${(e as Error).message}`,
      })
    }
  }

  return NextResponse.json({ ok: true, found: true, id: jobId, cover_letter: Boolean(buId) })
}
