import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { ODOO_LEAD_STATUSES } from '@/lib/odoo-leads/list'

export const dynamic = 'force-dynamic'

/**
 * POST /api/odoo-leads/[id]/status   { status: 'new'|'contacted'|'interested'|'discarded' }
 * Cambia el estado de un lead de Odoo (pipeline simple, sin state-machine).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getServerClient()

  let status = ''
  try {
    const body = (await request.json()) as { status?: unknown }
    if (typeof body?.status === 'string') status = body.status
  } catch {
    /* sin body */
  }

  if (!ODOO_LEAD_STATUSES.includes(status as (typeof ODOO_LEAD_STATUSES)[number])) {
    return NextResponse.json({ error: `status inválido: ${status}` }, { status: 400 })
  }

  const { error } = await supabase
    .from('odoo_leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id, status })
}
