// Parser de los emails de Odoo "Sus leads / Tus leads" que llegan a sales@.
// Cada lead trae la firma consistente de Odoo:
//   "Nombre Apellido (Empresa) Registration, Empresa, País, email@dom.com, +54 ...”
// Nos anclamos a "(Empresa) Registration," con un regex global → así funciona aunque
// el email venga sin saltos de línea, y descarta líneas de intro / headers / footers.

export type ParsedLead = {
  name: string | null
  company: string | null
  country: string | null
  email: string
  phone: string | null
}

export type OdooEmailInput = {
  subject?: string | null
  text?: string | null
  html?: string | null
}

// Grupos: 1=nombre(+intro), 2=empresa(paréntesis), 3=empresa repetida (ignorada),
//         4=país, 5=email, 6=teléfono
const LEAD_RE =
  /([^\n(]{1,120}?)\s*\(([^)\n]*)\)\s*Registration\s*(?:\[\d+\])?\s*,\s*([^,\n]*),\s*([^,\n]+?)\s*,\s*([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\s*,\s*(\+?\d[\d \t().\-]{5,}\d)/g

function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

/** Limpia el nombre: saca intro ("… Consulting: 1. Nombre"), numeración y "Registration". */
function cleanName(raw: string): string | null {
  let name = raw.replace(/\s+/g, ' ').trim()
  const numM = name.match(/(?:^|\s)\d+[.)]\s*(.+)$/) // "…: 1. Nombre" → "Nombre"
  if (numM) name = numM[1].trim()
  else {
    const colonM = name.match(/:\s*(.+)$/) // "… algo: Nombre" → "Nombre"
    if (colonM) name = colonM[1].trim()
  }
  name = name.replace(/registration/gi, '').trim()
  return name || null
}

/** Link "portal del contacto" (best-effort desde el HTML). */
export function extractPortalLink(html: string | null | undefined): string | null {
  if (!html) return null
  const m = html.match(/href="([^"]+)"[^>]*>\s*(?:portal del contacto|portal)/i)
  return m ? m[1] : null
}

export function parseOdooLeads(input: OdooEmailInput): ParsedLead[] {
  let body = (input.text ?? '').replace(/\r/g, '')
  if (!body.trim() && input.html) body = htmlToText(input.html).replace(/\r/g, '')

  const out: ParsedLead[] = []
  const seen = new Set<string>()

  LEAD_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = LEAD_RE.exec(body)) !== null) {
    const email = m[5].toLowerCase()
    const domain = email.split('@')[1] ?? ''
    // Saltar la firma del remitente (odoo.com) y nuestra propia casilla.
    if (/odoo\.com$/i.test(domain) || /swlconsulting\.com$/i.test(domain)) continue
    if (seen.has(email)) continue
    seen.add(email)

    out.push({
      name: cleanName(m[1]),
      company: (m[2] || '').trim() || null,
      country: (m[4] || '').trim() || null,
      email,
      phone: (m[6] || '').trim() || null,
    })
  }

  return out
}
