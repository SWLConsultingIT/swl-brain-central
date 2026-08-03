'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Switcher Upwork ⇄ LinkedIn ⇄ Odoo (segmentado, estilo Linear). Va en el header de
// /prospects, /linkedin y /odoo — el activo se resalta según la ruta actual.
export default function BrandSwitch() {
  const pathname = usePathname()
  const onLinkedIn = pathname?.startsWith('/linkedin')
  const onOdoo = pathname?.startsWith('/odoo')
  const onUpwork = !onLinkedIn && !onOdoo

  const item = (active: boolean) =>
    `px-2.5 py-1 rounded transition-colors ${active ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg'}`

  return (
    <div className="inline-flex items-center rounded-md border border-border bg-bg p-0.5 text-[12px] font-medium">
      <Link href="/prospects" className={item(!!onUpwork)}>Upwork</Link>
      <Link href="/linkedin" className={item(!!onLinkedIn)}>LinkedIn</Link>
      <Link href="/odoo" className={item(!!onOdoo)}>Odoo</Link>
    </div>
  )
}
