// Arma el payload para el webhook n8n "create-odoo-lead" con TODOS los datos del job.
// La app construye el HTML completo; n8n solo lo usa como description del lead.
// Así, agregar más campos NO requiere tocar n8n.

type AnyJob = Record<string, any>

export type OdooLeadPayload = {
  clientName: string
  source: string
  title: string
  company: string
  descriptionHtml: string
}

export function odooSource(j: AnyJob): string {
  if (j.is_invite || j.matched_keyword === 'by-link') return 'Upwork invite'
  return 'Upwork job'
}

function rateLabel(j: AnyJob): string {
  if (j.hourly_min != null || j.hourly_max != null) {
    return `$${j.hourly_min ?? '?'} - $${j.hourly_max ?? '?'}/h`
  }
  if (j.ticket != null) return `${j.ticket_currency ?? 'USD'} ${j.ticket}`
  return ''
}

export function buildOdooLeadPayload(j: AnyJob, clientName: string): OdooLeadPayload {
  const source = odooSource(j)
  const nl2br = (t: unknown) => String(t ?? '').replace(/\n/g, '<br/>')

  const rows: string[] = []
  const add = (label: string, val: unknown) => {
    if (val !== null && val !== undefined && val !== '') rows.push(`<p><b>${label}:</b> ${val}</p>`)
  }

  add('Origen', source)
  if (clientName) add('Cliente', clientName)
  add('Empresa', j.client_company_name)
  add('Job', j.title)
  add('Área / BU', j.classifier_area)
  add('País', j.country ? `${j.country}${j.city_region ? ' — ' + j.city_region : ''}` : '')
  add('Tarifa', rateLabel(j))
  add('Presupuesto semanal', j.weekly_budget != null ? `$${j.weekly_budget}` : '')
  add('Duración', j.duration)
  add('Experiencia', j.experience_level)
  add('Dedicación', j.engagement)
  add('Propuestas', j.proposals_count ?? j.total_applicants)
  add('Invites enviadas', j.invites_sent)
  add('Entrevistando', j.interviewing)
  add('Skills', Array.isArray(j.skills) ? j.skills.join(', ') : j.skills)
  add('Score', j.match_score ?? j.classifier_score)

  const cli = [
    j.client_total_spent ? `$${j.client_total_spent} gastado` : '',
    j.client_total_hires ? `${j.client_total_hires} hires` : '',
    j.client_rating ? `${j.client_rating}★` : '',
    j.client_total_reviews ? `${j.client_total_reviews} reviews` : '',
    j.client_verification || '',
  ].filter(Boolean).join(' · ')
  add('Cliente Upwork', cli)
  add('Cliente desde', j.client_member_since)
  add('Posteado', j.published_date ?? j.post_date)
  add('Upwork ID', j.upwork_id)
  if (j.link) rows.push(`<p><b>Link:</b> <a href="${j.link}">${j.link}</a></p>`)

  const blocks: string[] = ['<h3>Cliente respondió</h3>', ...rows]
  if (j.description) blocks.push(`<hr/><p><b>Descripción del job:</b><br/>${nl2br(j.description)}</p>`)

  const qa = Array.isArray(j.questions_answers) ? j.questions_answers : []
  const qs = Array.isArray(j.questions) ? j.questions : []
  if (qa.length) {
    blocks.push('<hr/><p><b>Screening Q&amp;A:</b></p>')
    for (const a of qa) blocks.push(`<p><b>${a?.question ?? ''}</b><br/>${nl2br(a?.answer)}</p>`)
  } else if (qs.length) {
    blocks.push('<hr/><p><b>Screening questions:</b></p>')
    for (const q of qs) blocks.push(`<p>${q?.question ?? ''}</p>`)
  }

  if (j.cover_letter_draft) {
    blocks.push(`<hr/><p><b>Cover letter enviada:</b><br/>${nl2br(j.cover_letter_draft)}</p>`)
  }

  return {
    clientName,
    source,
    title: j.title ?? '',
    company: j.client_company_name ?? '',
    descriptionHtml: blocks.join('\n'),
  }
}

// Columnas de jobs necesarias para armar el lead completo.
export const ODOO_LEAD_SELECT =
  'title, description, link, country, city_region, classifier_area, hourly_min, hourly_max, ticket, ticket_currency, ' +
  'weekly_budget, duration, experience_level, engagement, proposals_count, total_applicants, invites_sent, interviewing, ' +
  'skills, match_score, classifier_score, client_company_name, client_total_spent, client_total_hires, client_rating, ' +
  'client_total_reviews, client_verification, client_member_since, published_date, post_date, upwork_id, ' +
  'cover_letter_draft, questions, questions_answers, matched_keyword, is_invite'
