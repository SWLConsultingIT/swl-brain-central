'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Switcher Upwork ⇄ LinkedIn (segmentado, estilo Linear). Va en el header de
// /prospects y /linkedin — el activo se resalta según la ruta actual.
export default function BrandSwitch() {
  const pathname = usePathname()
  const onLinkedIn = pathname?.startsWith('/linkedin')

  return (
    <div className="inline-flex items-center rounded-md border border-border bg-bg p-0.5 text-[12px] font-medium">
      <Link
        href="/prospects"
        className={`px-2.5 py-1 rounded transition-colors ${
          !onLinkedIn ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg'
        }`}
      >
        Upwork
      </Link>
      <Link
        href="/linkedin"
        className={`px-2.5 py-1 rounded transition-colors ${
          onLinkedIn ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg'
        }`}
      >
        LinkedIn
      </Link>
    </div>
  )
}
