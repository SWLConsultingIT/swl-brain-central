import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Borra la cookie de sesión. Se puede pegar desde cualquier página o desde /login. */
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
