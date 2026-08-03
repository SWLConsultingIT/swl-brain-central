import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { buildOdooLeadPayload, ODOO_LEAD_SELECT } from '@/lib/jobs/odoo-lead'

export const dynamic = 'force-dynamic'

// Webhook n8n que crea el lead en Odoo (etapa PROSPECT). Best-effort: si falla, el marcado igual funciona.
const ODOO_LEAD_URL =
  process.env.N8N_ODOO_LEAD_URL ?? 'https://n8n.srv949269.hstgr.cloud/webhook/create-odoo-lead'

/** Manda el job (recién marcado como respondido) a Odoo como lead con TODOS los datos. No lanza. */
async function sendToOdoo(supabase: ReturnType<typeof getServerClient>, id: string, clientName: string) {
  try {
    const { data } = await supabase.from('jobs').select(ODOO_LEAD_SELECT).eq('id', id).single()
    if (!data) return
    await fetch(ODOO_LEAD_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildOdooLeadPayload(data as unknown as Record<string, unknown>, clientName)),
    })
  } catch {
    /* best-effort: no romper el marcado si Odoo/n8n falla */
  }
}

/**
 * POST /api/jobs/[id]/mark-responded
 *
 * Toggle whether a client replied on Upwork.
 * Body: { responded?: boolean }  (default true)
 *   true  → sent → responded
 *   false → responded → sent   (undo if marked by mistake)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = getServerClient()

  let responded = true
  let clientName = ''
  try {
    const body = (await request.json()) as { responded?: unknown; clientName?: unknown }
    if (typeof body?.responded === 'boolean') responded = body.responded
    if (typeof body?.clientName === 'string') clientName = body.clientName.trim()
  } catch {
    /* sin body → marcar como respondido */
  }

  const target = responded ? 'responded' : 'sent'
  const expectedFrom = responded ? 'sent' : 'responded'

  const { data: job, error: fetchErr } = await supabase
    .from('jobs')
    .select('id, status')
    .eq('id', id)
    .single()

  if (fetchErr || !job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 })
  }

  if (job.status === target) {
    return NextResponse.json({ ok: true, id, status: target, noop: true })
  }

  if (job.status !== expectedFrom) {
    return NextResponse.json(
      { error: `job must be in '${expectedFrom}' (current: ${job.status})` },
      { status: 409 },
    )
  }

  const { error: rpcErr } = await supabase.rpc('brain_transition_job', {
    p_job_id: id,
    p_to_status: target,
    p_actor: 'human',
    p_actor_detail: 'ui_toggle_responded',
    p_reason: responded
      ? 'operator marked: client replied on Upwork'
      : 'operator unmarked: no reply after all',
  })

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  // Al marcar "respondió" → crear el lead en Odoo (PROSPECT). Best-effort, no bloquea la respuesta.
  if (responded) {
    await sendToOdoo(supabase, id, clientName)
  }

  return NextResponse.json({ ok: true, id, status: target })
}
