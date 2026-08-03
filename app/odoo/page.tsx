import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import { listOdooLeads, type OdooLead } from '@/lib/odoo-leads/list'
import Board from './board'
import LogoutButton from '@/app/logout-button'
import BrandSwitch from '@/app/brand-switch'

export const dynamic = 'force-dynamic'

export default async function OdooPage() {
  const supabase = getServerClient()
  let leads: OdooLead[] = []
  let error: string | null = null
  try {
    leads = await listOdooLeads(supabase)
  } catch (e) {
    error = (e as Error).message
  }

  return (
    <main className="min-h-screen bg-bg">
      <header className="bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70 border-b border-border sticky top-0 z-10">
        <div className="px-8 py-3.5 flex items-center justify-between max-w-[2400px] mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <h1 className="text-[14px] font-semibold tracking-tight text-fg group-hover:text-fg-muted transition-colors">
                CRM Jobs
              </h1>
            </Link>
            <span className="text-fg-subtle text-[13px]" aria-hidden>/</span>
            <span className="text-fg-muted text-[13px] font-medium">Odoo</span>
          </div>

          <div className="flex items-center gap-5 text-[13px]">
            <BrandSwitch />
            <span className="text-fg-muted font-mono tabular-nums">
              <span className="font-semibold text-fg">{leads.length}</span>
              <span className="text-fg-subtle ml-1">leads</span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      {error && (
        <div className="px-8 py-3 bg-destructive-bg border-b border-destructive/20 text-destructive text-sm">
          {error} — ¿corriste la migración <code>0037_odoo_leads.sql</code>?
        </div>
      )}

      <Board leads={leads} />
    </main>
  )
}
