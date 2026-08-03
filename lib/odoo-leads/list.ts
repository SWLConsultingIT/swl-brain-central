import type { SupabaseClient } from '@supabase/supabase-js'

// Un lead que Odoo asignó a SWL (llega por email a sales@, lo ingesta n8n).
export type OdooLead = {
  id: string
  name: string | null
  company: string | null
  country: string | null
  email: string | null
  phone: string | null
  portal_link: string | null
  status: string
  source: string
  email_subject: string | null
  email_received_at: string | null
  notes: string | null
  created_at: string
  updated_at: string | null
}

export const ODOO_LEAD_STATUSES = ['new', 'contacted', 'interested', 'discarded'] as const

const SELECT =
  'id, name, company, country, email, phone, portal_link, status, source, ' +
  'email_subject, email_received_at, notes, created_at, updated_at'

export async function listOdooLeads(supabase: SupabaseClient): Promise<OdooLead[]> {
  const { data, error } = await supabase
    .from('odoo_leads')
    .select(SELECT)
    .order('email_received_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as OdooLead[]
}
