export type StatusMeta = {
  emoji: string
  label: string
  pillClass: string
}

export const STATUS_META: Record<string, StatusMeta> = {
  new:              { emoji: '🔍', label: 'Prospect',     pillClass: 'bg-slate-bg text-slate' },
  prequalified:     { emoji: '⚡', label: 'Prequalified', pillClass: 'bg-warning-bg text-warning' },
  qualified:        { emoji: '✅', label: 'Qualified',    pillClass: 'bg-accent-bg text-accent-fg' },
  proposal_drafted: { emoji: '📝', label: 'Proposal',     pillClass: 'bg-info-bg text-info' },
  ready_to_send:    { emoji: '📨', label: 'Ready',        pillClass: 'bg-violet-bg text-violet' },
  sent:             { emoji: '✓',  label: 'Sent',         pillClass: 'bg-fg text-bg' },
  responded:        { emoji: '🟢', label: 'Responded',    pillClass: 'bg-accent-bg text-accent-fg' },
  discarded:        { emoji: '✗',  label: 'Discarded',    pillClass: 'bg-slate-bg text-fg-subtle' },
  discarded_review: { emoji: '👀', label: 'Review',       pillClass: 'bg-orange-bg text-orange' },
}

const COUNTRY_FLAGS: Record<string, string> = {
  'united states': '🇺🇸',
  'usa': '🇺🇸',
  'us': '🇺🇸',
  'united kingdom': '🇬🇧',
  'uk': '🇬🇧',
  'canada': '🇨🇦',
  'australia': '🇦🇺',
  'germany': '🇩🇪',
  'france': '🇫🇷',
  'spain': '🇪🇸',
  'italy': '🇮🇹',
  'netherlands': '🇳🇱',
  'switzerland': '🇨🇭',
  'sweden': '🇸🇪',
  'norway': '🇳🇴',
  'denmark': '🇩🇰',
  'finland': '🇫🇮',
  'ireland': '🇮🇪',
  'belgium': '🇧🇪',
  'austria': '🇦🇹',
  'portugal': '🇵🇹',
  'japan': '🇯🇵',
  'china': '🇨🇳',
  'india': '🇮🇳',
  'singapore': '🇸🇬',
  'hong kong': '🇭🇰',
  'south korea': '🇰🇷',
  'korea': '🇰🇷',
  'brazil': '🇧🇷',
  'mexico': '🇲🇽',
  'argentina': '🇦🇷',
  'chile': '🇨🇱',
  'colombia': '🇨🇴',
  'peru': '🇵🇪',
  'uruguay': '🇺🇾',
  'new zealand': '🇳🇿',
  'south africa': '🇿🇦',
  'israel': '🇮🇱',
  'uae': '🇦🇪',
  'united arab emirates': '🇦🇪',
  'saudi arabia': '🇸🇦',
  'turkey': '🇹🇷',
  'poland': '🇵🇱',
  'czech republic': '🇨🇿',
  'romania': '🇷🇴',
  'greece': '🇬🇷',
  'russia': '🇷🇺',
  'ukraine': '🇺🇦',
}

export function countryFlag(country: string | null): string {
  if (!country) return ''
  const key = country.trim().toLowerCase()
  return COUNTRY_FLAGS[key] ?? ''
}

const MIN_MS = 60_000
const HOUR_MS = 60 * MIN_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

export function postedAgo(iso: string | null): string | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return null
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / MIN_MS))}m`
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)}h`
  if (ms < WEEK_MS) return `${Math.round(ms / DAY_MS)}d`
  return `${Math.round(ms / WEEK_MS)}w`
}

export function isFresh(iso: string | null, withinHours = 2): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < withinHours * HOUR_MS
}

export function isStale(iso: string | null, afterHours = 6): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() > afterHours * HOUR_MS
}

// Jobs "elegidos a mano" = alta prioridad: invites del cliente + los agregados por link.
// Se resaltan y van arriba de todo en las tablas. matched_keyword='by-link' lo setea /api/jobs/by-link.
export function prioritySource(
  j: { is_invite?: boolean | null; matched_keyword?: string | null },
): 'invite' | 'link' | null {
  if (j.is_invite) return 'invite'
  if (j.matched_keyword === 'by-link') return 'link'
  return null
}
