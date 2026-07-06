import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/jobs/[id]/connects
 * Body: { base?: number|null, boost?: number|null }
 * Guarda los connects gastados al postularse (base = cobro de Upwork, boost = extra).
 * Editable en cualquier momento desde el modal del job.
 */
function parseConnects(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = getServerClient()

  let body: { base?: unknown; boost?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const connects_base = parseConnects(body.base)
  const connects_boost = parseConnects(body.boost)

  const { error } = await supabase
    .from('jobs')
    .update({ connects_base, connects_boost })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, id, connects_base, connects_boost })
}
