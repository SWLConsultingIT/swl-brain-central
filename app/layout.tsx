import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CRM Jobs — SWL Consulting',
  description: 'CRM de jobs — Upwork & LinkedIn',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
