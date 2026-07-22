/**
 * Login simple para toda la app: un único usuario+contraseña compartido
 * (variables de entorno) + cookie de sesión firmada (HMAC-SHA256).
 *
 * Sin base de datos, sin dependencias. Usa Web Crypto, así que funciona
 * tanto en el middleware (Edge runtime) como en los route handlers (Node).
 *
 * Variables de entorno requeridas (definirlas en Vercel):
 *   APP_USER       — usuario
 *   APP_PASSWORD   — contraseña
 *   AUTH_SECRET    — string aleatorio largo para firmar la cookie
 */

export const SESSION_COOKIE = 'swl_session'
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // 30 días, en segundos

const encoder = new TextEncoder()

function base64url(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBytes(s: string): Uint8Array {
  let str = s.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  const bin = atob(str)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function hmac(data: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return new Uint8Array(sig)
}

/** Comparación en tiempo constante para no filtrar info por timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Valida usuario+contraseña contra las variables de entorno. */
export function checkCredentials(user: string, password: string): boolean {
  const U = process.env.APP_USER
  const P = process.env.APP_PASSWORD
  if (!U || !P) return false
  // Comparamos ambos siempre (sin corto-circuito) para no filtrar cuál falló.
  const okUser = safeEqual(user, U)
  const okPass = safeEqual(password, P)
  return okUser && okPass
}

/** Crea el token de sesión firmado. Lanza si falta AUTH_SECRET. */
export async function createSessionToken(user: string): Promise<string> {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET no configurada')
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
  const payload = base64url(encoder.encode(JSON.stringify({ u: user, exp })))
  const sig = base64url(await hmac(payload, secret))
  return `${payload}.${sig}`
}

/** Verifica firma + expiración. Nunca lanza: ante cualquier problema devuelve false. */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  const secret = process.env.AUTH_SECRET
  if (!secret || !token) return false
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return false
  try {
    const expected = base64url(await hmac(payload, secret))
    if (!safeEqual(sig, expected)) return false
    const data = JSON.parse(new TextDecoder().decode(base64urlToBytes(payload))) as { exp?: unknown }
    if (typeof data.exp !== 'number' || data.exp < Math.floor(Date.now() / 1000)) return false
    return true
  } catch {
    return false
  }
}
