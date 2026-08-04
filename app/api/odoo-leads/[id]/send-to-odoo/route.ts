import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/odoo-leads/[id]/send-to-odoo
 *
 * Botón manual: manda un lead de Odoo a tu Odoo CRM (etapa PROSPECT) vía el mismo
 * webhook n8n que los jobs. Carga nombre, empresa, email y teléfono como campos
 * reales del CRM. Dedup por email (no duplica si ya está).
 */
const ODOO_LEAD_URL =
  process.env.N8N_ODOO_LEAD_URL ?? 'https://n8n.srv949269.hstgr.cloud/webhook/create-odoo-lead'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  const { data: lead } = await supabase
    .from('odoo_leads')
    .select('name, company, country, email, phone, portal_link, email_received_at')
    .eq('id', id)
    .single()

  if (!lead) return NextResponse.json({ error: 'lead not found' }, { status: 404 })

  const esc = (v: unknown) => String(v ?? '')
  const rows: string[] = ['<h3>Lead de Odoo</h3>', '<p><b>Origen:</b> Odoo lead</p>']
  const add = (label: string, val: unknown) => {
    if (val) rows.push(`<p><b>${label}:</b> ${esc(val)}</p>`)
  }
  add('Cliente', lead.name)
  add('Empresa', lead.company)
  add('Email', lead.email)
  add('Teléfono', lead.phone)
  add('País', lead.country)
  if (lead.portal_link) rows.push(`<p><b>Portal Odoo:</b> <a href="${lead.portal_link}">${lead.portal_link}</a></p>`)
  add('Recibido', lead.email_received_at)

  const payload = {
    clientName: lead.name || lead.email || '',
    source: 'Odoo lead',
    title: lead.name || lead.company || 'Odoo lead',
    company: lead.company || '',
    email: lead.email || '',
    phone: lead.phone || '',
    upworkId: lead.email || '', // clave de dedup en n8n
    coverLetterHtml: '',
    jobPostHtml: rows.join('\n'),
  }

  try {
    const res = await fetch(ODOO_LEAD_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return NextResponse.json({ error: `n8n ${res.status}` }, { status: 502 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  return NextResponse.json({ ok: true, id })
}
