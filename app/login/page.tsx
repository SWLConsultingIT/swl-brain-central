'use client'

import { useState } from 'react'

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
      {/* Fondo decorativo sutil: grilla tenue + glow cálido */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 75%)',
          opacity: 0.6,
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(600px 340px at 50% 12%, rgba(31,30,27,0.05), transparent 70%)' }}
      />

      <div className="relative w-full max-w-sm">
        {/* Marca */}
        <div className="flex flex-col items-center mb-7">
          <div className="size-12 rounded-xl bg-fg flex items-center justify-center text-bg font-bold text-xl tracking-tighter shadow-[0_4px_14px_-4px_rgba(31,30,27,0.5)]">
            B
          </div>
          <h1 className="mt-4 text-[22px] font-bold tracking-tight text-fg">Upwork Brain</h1>
          <p className="mt-1 text-[13px] text-fg-muted">Prospecting Upwork &amp; LinkedIn</p>
        </div>

        {/* Tarjeta */}
        <form
          onSubmit={onSubmit}
          className="bg-surface border border-border rounded-2xl p-6 shadow-[0_1px_3px_rgba(31,30,27,0.04),0_16px_40px_-12px_rgba(31,30,27,0.14)]"
        >
          <h2 className="text-[15px] font-semibold text-fg text-center">Iniciá sesión</h2>
          <p className="text-[12px] text-fg-subtle text-center mt-0.5 mb-5">Ingresá tus credenciales para continuar</p>

          <div className="space-y-2.5">
            {/* Usuario */}
            <div className="relative">
              <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
              </Icon>
              <input
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="Usuario"
                autoFocus
                autoComplete="username"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-bg text-fg text-[14px] border border-border placeholder:text-fg-subtle focus:outline-none focus:border-fg focus:bg-surface transition-colors"
              />
            </div>

            {/* Contraseña */}
            <div className="relative">
              <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle">
                <rect x="4.5" y="10.5" width="15" height="9" rx="2" />
                <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
              </Icon>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                autoComplete="current-password"
                className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-bg text-fg text-[14px] border border-border placeholder:text-fg-subtle focus:outline-none focus:border-fg focus:bg-surface transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                tabIndex={-1}
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg transition-colors p-0.5"
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
            <div className="mt-3 px-3 py-2 rounded-lg bg-destructive-bg text-destructive text-[12.5px] flex items-center gap-2">
              <Icon className="shrink-0"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16h.01" /></Icon>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !user || !password}
            className="w-full mt-4 text-[14px] font-medium px-4 py-2.5 rounded-lg bg-fg text-bg hover:bg-fg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-[11px] text-fg-subtle mt-5">SWL Consulting</p>
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
