import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { parseOdooLeads, extractPortalLink } from '@/lib/odoo-leads/parse'

export const dynamic = 'force-dynamic'

/**
 * POST /api/odoo-leads/ingest
 *
 * Lo llama el workflow n8n (Gmail sales@) con el email crudo de Odoo "Sus leads".
 * Parsea los leads del cuerpo y hace upsert en odoo_leads (dedup por email).
 * Body: { subject?, text?, html?, date?, secret? }  (o header x-ingest-secret)
 *
 * Seguridad: si está seteado ODOO_INGEST_SECRET en el env, exige que coincida.
 * Si no está seteado, acepta igual (para que ande antes de configurar el secreto).
 */
export async function POST(request: Request) {
  const expected = process.env.ODOO_INGEST_SECRET
  let body: { subject?: unknown; text?: unknown; html?: unknown; date?: unknown; secret?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  if (expected) {
    const provided = request.headers.get('x-ingest-secret') ?? (typeof body.secret === 'string' ? body.secret : '')
    if (provided !== expected) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const subject = typeof body.subject === 'string' ? body.subject : null
  const text = typeof body.text === 'string' ? body.text : null
  const html = typeof body.html === 'string' ? body.html : null
  const dateRaw = typeof body.date === 'string' || typeof body.date === 'number' ? body.date : null

  let receivedAt: string | null = null
  if (dateRaw != null) {
    const d = new Date(typeof dateRaw === 'number' || /^\d+$/.test(String(dateRaw)) ? Number(dateRaw) : String(dateRaw))
    if (!isNaN(d.getTime())) receivedAt = d.toISOString()
  }

  const leads = parseOdooLeads({ subject, text, html })
  if (leads.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, reason: 'no leads found in email', subject })
  }

  const portal = extractPortalLink(html)
  const rows = leads.map((l) => ({
    name: l.name,
    company: l.company,
    country: l.country,
    email: l.email,
    phone: l.phone,
    portal_link: portal,
    source: 'odoo',
    status: 'new',
    email_subject: subject,
    email_received_at: receivedAt,
    raw_text: `${l.name ?? ''} | ${l.company ?? ''} | ${l.country ?? ''} | ${l.email} | ${l.phone ?? ''}`,
    updated_at: new Date().toISOString(),
  }))

  const supabase = getServerClient()
  // Upsert por email: si el lead ya existe no lo duplica (ignoreDuplicates para no
  // pisar el estado que ya le pusieron a mano).
  const { data, error } = await supabase
    .from('odoo_leads')
    .upsert(rows, { onConflict: 'email', ignoreDuplicates: true })
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, parsed: leads.length, inserted: (data ?? []).length })
}
