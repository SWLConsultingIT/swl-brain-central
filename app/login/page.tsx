'use client'

import { useRef, useState } from 'react'

/** Solo permite redirigir a rutas internas (evita open-redirect). */
function safeNext(): string {
  if (typeof window === 'undefined') return '/prospects'
  const next = new URLSearchParams(window.location.search).get('next')
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return '/prospects'
}

export default function LoginPage() {
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const cardRef = useRef<HTMLFormElement>(null)

  /** Actualiza el spotlight que sigue al cursor (sin re-render). */
  function onCardMove(e: React.MouseEvent<HTMLFormElement>) {
    const el = cardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, password }),
      })
      if (res.ok) {
        window.location.href = safeNext()
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      setError(data.error || 'No se pudo iniciar sesión')
    } catch {
      setError('Error de conexión')
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen relative flex items-center justify-center px-4 overflow-hidden bg-bg">
      {/* ── Fondo en capas ───────────────────────────────────── */}
      {/* Grilla tenue con máscara radial */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse 68% 58% at 50% 38%, black 18%, transparent 74%)',
          WebkitMaskImage: 'radial-gradient(ellipse 68% 58% at 50% 38%, black 18%, transparent 74%)',
          opacity: 0.55,
        }}
      />
      {/* Aurora cálida que respira detrás de la tarjeta */}
      <div
        aria-hidden
        className="absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] rounded-full pointer-events-none blur-3xl animate-login-breathe"
        style={{
          background:
            'radial-gradient(closest-side, rgba(31,30,27,0.10), rgba(31,30,27,0.04) 55%, transparent 78%)',
        }}
      />
      {/* Vignette inferior para asentar el pie */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(31,30,27,0.035), transparent)' }}
      />
      {/* Grano sutil para profundidad */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.035] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: '140px 140px',
        }}
      />

      {/* ── Contenido ────────────────────────────────────────── */}
      <div className="relative w-full max-w-sm">
        {/* Marca */}
        <div className="flex flex-col items-center mb-8 animate-login-rise">
          <div className="relative">
            {/* glow cónico rotando lento detrás del logo */}
            <div
              aria-hidden
              className="absolute -inset-4 rounded-full blur-md opacity-70 animate-login-spin-slow"
              style={{
                background:
                  'conic-gradient(from 0deg, transparent, rgba(31,30,27,0.18), transparent 45%, rgba(31,30,27,0.12), transparent 75%)',
              }}
            />
            {/* halo detrás del logo */}
            <div
              aria-hidden
              className="absolute -inset-3 rounded-[20px] blur-lg"
              style={{ background: 'radial-gradient(closest-side, rgba(31,30,27,0.22), transparent 72%)' }}
            />
            <div className="relative size-[52px] rounded-2xl flex items-center justify-center overflow-hidden text-bg font-extrabold text-2xl tracking-tighter shadow-[0_8px_22px_-6px_rgba(31,30,27,0.55),inset_0_1px_0_rgba(255,255,255,0.18)] bg-gradient-to-b from-[#2C2A26] to-[#1F1E1B]">
              <span className="relative z-10">B</span>
              {/* sheen superior */}
              <span
                aria-hidden
                className="absolute inset-x-1 top-1 h-1/3 rounded-t-xl"
                style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.14), transparent)' }}
              />
              {/* destello que barre en diagonal */}
              <span
                aria-hidden
                className="absolute inset-y-0 -left-1/2 w-2/5 animate-login-shine"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }}
              />
            </div>
          </div>
          <h1 className="mt-4 text-[23px] font-bold tracking-tight text-fg">Upwork Brain</h1>
          <p className="mt-1 text-[13px] text-fg-muted">Prospecting Upwork &amp; LinkedIn</p>
        </div>

        {/* Tarjeta */}
        <form
          ref={cardRef}
          onSubmit={onSubmit}
          onMouseMove={onCardMove}
          className="group/card relative bg-surface border border-border rounded-2xl p-6 shadow-[0_1px_3px_rgba(31,30,27,0.05),0_20px_50px_-16px_rgba(31,30,27,0.20)] animate-login-rise"
          style={{ ['--mx' as string]: '50%', ['--my' as string]: '0%', animationDelay: '90ms' }}
        >
          {/* spotlight que sigue el cursor */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
            style={{ background: 'radial-gradient(260px circle at var(--mx) var(--my), rgba(31,30,27,0.06), transparent 60%)' }}
          />
          {/* filo superior brillante */}
          <div
            aria-hidden
            className="absolute inset-x-6 top-0 h-px"
            style={{ background: 'linear-gradient(to right, transparent, rgba(31,30,27,0.10), transparent)' }}
          />

          <h2 className="relative text-[15px] font-semibold text-fg text-center">Iniciá sesión</h2>
          <p className="relative text-[12px] text-fg-subtle text-center mt-0.5 mb-5">Ingresá tus credenciales para continuar</p>

          <div className="relative space-y-2.5">
            {/* Usuario */}
            <div className="group relative">
              <label htmlFor="login-user" className="sr-only">Usuario</label>
              <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle transition-colors group-focus-within:text-fg">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
              </Icon>
              <input
                id="login-user"
                name="user"
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="Usuario"
                autoFocus
                autoComplete="username"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-bg text-fg text-[14px] border border-border placeholder:text-fg-subtle focus:outline-none focus:border-fg focus:bg-surface focus:shadow-[0_0_0_3px_rgba(31,30,27,0.08)] transition-all"
              />
            </div>

            {/* Contraseña */}
            <div className="group relative">
              <label htmlFor="login-password" className="sr-only">Contraseña</label>
              <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle transition-colors group-focus-within:text-fg">
                <rect x="4.5" y="10.5" width="15" height="9" rx="2" />
                <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
              </Icon>
              <input
                id="login-password"
                name="password"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                autoComplete="current-password"
                className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-bg text-fg text-[14px] border border-border placeholder:text-fg-subtle focus:outline-none focus:border-fg focus:bg-surface focus:shadow-[0_0_0_3px_rgba(31,30,27,0.08)] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPass}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg rounded transition-colors p-0.5 focus:outline-none focus:text-fg focus-visible:shadow-[0_0_0_2px_rgba(31,30,27,0.25)]"
              >
                {showPass ? (
                  <Icon><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.4 5.2A9.6 9.6 0 0 1 12 5c5 0 9 5 9 7a12 12 0 0 1-2.2 2.8M6.2 6.2C3.9 7.6 2 10 2 12c0 2 4 7 10 7a10 10 0 0 0 2.6-.3" /></Icon>
                ) : (
                  <Icon><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></Icon>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" aria-live="polite" className="relative mt-3 px-3 py-2 rounded-lg bg-destructive-bg text-destructive text-[12.5px] flex items-center gap-2">
              <Icon className="shrink-0"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16h.01" /></Icon>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !user || !password}
            className="group relative w-full mt-4 text-[14px] font-medium px-4 py-2.5 rounded-lg bg-fg text-bg hover:bg-fg-muted transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] flex items-center justify-center gap-2 shadow-[0_6px_16px_-8px_rgba(31,30,27,0.6)]"
          >
            {loading ? (
              <>
                <Spinner />
                <span>Entrando…</span>
              </>
            ) : (
              <>
                <span>Entrar</span>
                <Icon className="transition-transform group-hover:translate-x-0.5">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </Icon>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-fg-subtle">
          <Icon className="size-3">
            <rect x="4.5" y="10.5" width="15" height="9" rx="2" />
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
          </Icon>
          <span className="font-mono text-[10.5px] tracking-wider uppercase">Conexión segura · SWL</span>
        </div>
      </div>
    </main>
  )
}

function Icon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  )
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
