// Arma el payload para el webhook n8n "create-odoo-lead" a partir de un job de LinkedIn.
// Mismo contrato que lib/jobs/odoo-lead.ts (Upwork): n8n escribe coverLetterHtml y
// jobPostHtml en los campos visibles de la pestaña Upwork del lead.
//   source = "LinkedIn job"  ·  upworkId = linkedin_id (para el dedup en n8n).
import type { OdooLeadPayload } from '@/lib/jobs/odoo-lead'

type AnyJob = Record<string, any>

export function buildLinkedInOdooLeadPayload(j: AnyJob, clientName: string): OdooLeadPayload {
  const source = 'LinkedIn job'
  const nl2br = (t: unknown) => String(t ?? '').replace(/\n/g, '<br/>')

  const rows: string[] = []
  const add = (label: string, val: unknown) => {
    if (val !== null && val !== undefined && val !== '') rows.push(`<p><b>${label}:</b> ${val}</p>`)
  }

  const dedupId = j.linkedin_id != null ? String(j.linkedin_id) : String(j.id ?? '')

  add('Origen', source)
  if (clientName) add('Cliente', clientName)
  add('Empresa', j.company_name)
  if (j.link) rows.push(`<p><b>Link LinkedIn:</b> <a href="${j.link}">${j.link}</a></p>`)
  add('Área / BU', j.classifier_area)
  add('País', j.country ? `${j.country}${j.city_region ? ' — ' + j.city_region : ''}` : (j.location ?? ''))
  add('Tipo de empleo', j.employment_type)
  add('Modalidad', j.workplace_type)
  add('Seniority', j.seniority)
  add('Función', j.job_function)
  add('Industria', j.industry)
  add('Rango salarial', j.salary_raw)
  add('Applicants', j.applicants_count)
  add('Score', j.match_score ?? j.classifier_score)
  add('Posteado', j.post_date ?? j.posted_ago)
  add('LinkedIn ID', dedupId)

  const jobPostHtml =
    `${rows.join('\n')}\n<hr/>\n<p><b>Descripción del job:</b></p>\n${nl2br(j.description)}`
  const coverLetterHtml = nl2br(j.cover_letter_draft)

  return {
    clientName,
    source,
    title: j.title ?? '',
    company: j.company_name ?? '',
    upworkId: dedupId,
    coverLetterHtml,
    jobPostHtml,
  }
}

// Columnas de linkedin_jobs necesarias para armar el lead completo.
export const LINKEDIN_ODOO_LEAD_SELECT =
  'id, linkedin_id, title, description, link, company_name, country, city_region, location, classifier_area, ' +
  'employment_type, workplace_type, seniority, job_function, industry, salary_raw, applicants_count, ' +
  'match_score, classifier_score, post_date, posted_ago, cover_letter_draft, client_contact_name'
