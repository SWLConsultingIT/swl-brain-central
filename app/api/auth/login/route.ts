import { NextResponse } from 'next/server'
import { SESSION_COOKIE, SESSION_MAX_AGE, checkCredentials, createSessionToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: { user?: unknown; password?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const user = String(body.user ?? '')
  const password = String(body.password ?? '')

  if (!checkCredentials(user, password)) {
    return NextResponse.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 })
  }

  let token: string
  try {
    token = await createSessionToken(user)
  } catch {
    return NextResponse.json({ error: 'Falta configurar AUTH_SECRET en el servidor' }, { status: 500 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
  return res
}
