import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Brain Central — SWL Consulting',
  description: 'AI-native prospecting brain',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
