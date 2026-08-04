import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { buildOdooLeadPayload, ODOO_LEAD_SELECT } from '@/lib/jobs/odoo-lead'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/send-to-odoo   { clientName?: string }
 *
 * "Hubo fit" → crea el lead en Odoo (PROSPECT) con todos los datos del job + el nombre.
 * Solo se dispara cuando el operador marca fit (NO al marcar Client Reply).
 * El webhook n8n dedupea por título, así que clickear dos veces no crea el lead dos veces.
 */
const ODOO_LEAD_URL =
  process.env.N8N_ODOO_LEAD_URL ?? 'https://n8n.srv949269.hstgr.cloud/webhook/create-odoo-lead'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  let clientName = ''
  try {
    const body = (await request.json()) as { clientName?: unknown }
    if (typeof body?.clientName === 'string') clientName = body.clientName.trim()
  } catch {
    /* sin body → sin nombre */
  }

  const { data } = await supabase.from('jobs').select(ODOO_LEAD_SELECT).eq('id', id).single()
  if (!data) return NextResponse.json({ error: 'job not found' }, { status: 404 })

  // Si no vino nombre en el request, usar el persistido en la base.
  const rec = data as unknown as Record<string, unknown>
  if (!clientName && typeof rec.client_contact_name === 'string') clientName = rec.client_contact_name.trim()

  try {
    const res = await fetch(ODOO_LEAD_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildOdooLeadPayload(rec, clientName)),
    })
    if (!res.ok) return NextResponse.json({ error: `n8n ${res.status}` }, { status: 502 })
    // El webhook devuelve {success:true,...} o {error:'...'} — detectar el fallo real.
    const out = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; odooLeadId?: number }
    if (out.error || out.success !== true) {
      return NextResponse.json({ error: out.error ?? 'Odoo no confirmó la creación del lead' }, { status: 502 })
    }
    return NextResponse.json({ ok: true, id, odooLeadId: out.odooLeadId })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
