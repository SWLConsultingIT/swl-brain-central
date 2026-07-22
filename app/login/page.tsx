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
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-xs text-center">
        <div className="size-12 rounded-lg bg-fg flex items-center justify-center text-bg font-bold text-xl mx-auto mb-6 tracking-tighter">
          B
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-fg">Upwork Brain</h1>
        <p className="text-sm text-fg-muted mt-1.5 mb-8">Iniciá sesión para continuar</p>

        <div className="space-y-2.5 text-left">
          <input
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="Usuario"
            autoFocus
            autoComplete="username"
            className="w-full px-3 py-2.5 rounded-md bg-surface text-fg text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-border-focus transition"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            autoComplete="current-password"
            className="w-full px-3 py-2.5 rounded-md bg-surface text-fg text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-border-focus transition"
          />
        </div>

        {error && <p className="text-sm text-destructive mt-3 text-left">{error}</p>}

        <button
          type="submit"
          disabled={loading || !user || !password}
          className="w-full mt-5 text-sm font-medium px-4 py-2.5 rounded-md bg-fg text-bg hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
