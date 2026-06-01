// Ticket filter — primer gate del classifier, sin LLM.
// Regla: el job pasa si currency === 'USD' AND ticket >= 40.
// Confirmado por SWL 2026-06-01.

export const TICKET_MIN_USD = 40

export type TicketFilterInput = {
  ticket: number | null
  ticket_currency: string | null
}

export type TicketFilterResult =
  | { passes: true; reason: string }
  | { passes: false; reason: string }

export function ticketFilter(input: TicketFilterInput): TicketFilterResult {
  const { ticket, ticket_currency } = input

  if (ticket == null) {
    return { passes: false, reason: 'no ticket value' }
  }

  if ((ticket_currency ?? 'USD').toUpperCase() !== 'USD') {
    return { passes: false, reason: `currency ${ticket_currency} not USD` }
  }

  if (ticket < TICKET_MIN_USD) {
    return { passes: false, reason: `ticket ${ticket} USD below $${TICKET_MIN_USD} threshold` }
  }

  return { passes: true, reason: `ticket ${ticket} USD ≥ $${TICKET_MIN_USD}` }
}
