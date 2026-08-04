import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { buildLinkedInOdooLeadPayload, LINKEDIN_ODOO_LEAD_SELECT } from '@/lib/linkedin/odoo-lead'

export const dynamic = 'force-dynamic'

/**
 * POST /api/linkedin/[id]/send-to-odoo   { clientName?: string }
 *
 * "Hubo fit" → crea el lead en Odoo (PROSPECT) con todos los datos del job de LinkedIn
 * + el nombre. source = "LinkedIn job". El webhook n8n dedupea por id.
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

  const { data } = await supabase.from('linkedin_jobs').select(LINKEDIN_ODOO_LEAD_SELECT).eq('id', id).single()
  if (!data) return NextResponse.json({ error: 'job not found' }, { status: 404 })

  const rec = data as unknown as Record<string, unknown>
  if (!clientName && typeof rec.client_contact_name === 'string') clientName = rec.client_contact_name.trim()

  try {
    const res = await fetch(ODOO_LEAD_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildLinkedInOdooLeadPayload(rec, clientName)),
    })
    if (!res.ok) return NextResponse.json({ error: `n8n ${res.status}` }, { status: 502 })
    const out = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; odooLeadId?: number }
    if (out.error || out.success !== true) {
      return NextResponse.json({ error: out.error ?? 'Odoo no confirmó la creación del lead' }, { status: 502 })
    }
    return NextResponse.json({ ok: true, id, odooLeadId: out.odooLeadId })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
