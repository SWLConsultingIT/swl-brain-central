// Parser de los emails de Odoo "Sus leads / Tus leads" que llegan a sales@.
// Formato de cada lead (una línea):
//   "Nombre Apellido (Empresa) Registration, Empresa, País, email@dom.com, +54 ...”
// Puede haber varios leads numerados (1., 2., …). Devuelve un lead por línea con email.

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

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/
const PHONE_RE = /\+?\d[\d\s().\-]{6,}\d/

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

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!EMAIL_RE.test(line)) continue
    // Saltar la firma/footer del remitente de Odoo (kanm@odoo.com, etc.)
    if (/@odoo\.com/i.test(line)) continue

    const emailMatch = line.match(EMAIL_RE)
    if (!emailMatch) continue
    const email = emailMatch[0].toLowerCase()
    if (seen.has(email)) continue

    const parts = line.split(',').map((s) => s.trim()).filter(Boolean)
    const emailIdx = parts.findIndex((p) => EMAIL_RE.test(p))
    if (emailIdx === -1) continue

    // parts[0] = "Nombre (Empresa) Registration" (con posible "1." adelante)
    const first = parts[0].replace(/^\d+[.)]\s*/, '')
    const parenM = first.match(/\(([^)]*)\)/)
    const companyParen = parenM ? parenM[1].trim() : ''
    const name = first.split('(')[0].replace(/registration/gi, '').trim() || null

    const country = emailIdx >= 1 ? parts[emailIdx - 1] : null
    const company = companyParen || (emailIdx >= 2 ? parts[emailIdx - 2] : null)

    let phone: string | null = null
    const after = parts.slice(emailIdx + 1).join(' ')
    const pm = after.match(PHONE_RE)
    if (pm) phone = pm[0].trim()

    seen.add(email)
    out.push({ name, company: company || null, country: country || null, email, phone })
  }

  return out
}
