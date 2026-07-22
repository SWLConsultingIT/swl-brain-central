'use client'

import { useState } from 'react'

/** Botón "Salir": borra la cookie de sesión y vuelve al login. */
export default function LogoutButton() {
  const [loading, setLoading] = useState(false)

  async function logout() {
    setLoading(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // aunque falle el fetch, mandamos al login igual
    }
    window.location.href = '/login'
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      title="Cerrar sesión"
      className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg transition-colors font-medium disabled:opacity-50"
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 14H3.75A1.75 1.75 0 0 1 2 12.25v-8.5A1.75 1.75 0 0 1 3.75 2H6" />
        <path d="M10.5 11 14 8l-3.5-3M14 8H6.5" />
      </svg>
      {loading ? 'Saliendo…' : 'Salir'}
    </button>
  )
}
