import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

/**
 * Puerta de entrada: exige sesión en toda la app.
 *
 * Quedan ABIERTOS (sin login) a propósito:
 *   - /login y /api/auth/*        → para poder iniciar sesión
 *   - /api/jobs/ingest-questions  → lo llama el userscript de Tampermonkey
 *                                    (corre en upwork.com, cross-origin, no lleva la cookie)
 *
 * Todo lo demás (páginas + APIs llamadas por el navegador) requiere sesión.
 * Las llamadas del front ya viajan con la cookie, así que nada se rompe.
 */
const PUBLIC_PATHS = ['/login', '/api/auth/', '/api/jobs/ingest-questions']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next()
  }

  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next()
  }

  // API sin sesión → 401 JSON. Páginas → redirect al login (recordando el destino).
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  // Corre en todo salvo assets estáticos de Next y archivos con extensión.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
}
