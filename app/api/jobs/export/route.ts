import ExcelJS from 'exceljs'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/jobs/export
// Baja UN Excel con TODOS los jobs y todas las columnas útiles (sin cover letter).
// Incluye: universo, estado, fecha de postulación, cliente, competencia, connects, etc.

const SELECT =
  'id, upwork_id, title, classifier_area, business_unit_id, status, match_score, classifier_score, ' +
  'classifier_match, ticket_raw, ticket, hourly_min, hourly_max, hourly_average, proposals_count, ' +
  'total_applicants, invites_sent, interviewing, unanswered_invites, country, city_region, ' +
  'client_rating, client_total_spent, client_total_hires, client_verification, duration, engagement, ' +
  'experience_level, skills, matched_keyword, connects_base, connects_boost, questions, questions_answers, ' +
  'link, post_date, published_date, created_at, updated_at, last_client_activity, industry, description'

const dt = (v: string | null | undefined) => (v ? String(v).slice(0, 16).replace('T', ' ') : '')

export async function GET() {
  const supabase = getServerClient()

  // 1) todos los jobs (paginado)
  type Row = Record<string, unknown>
  const jobs: Row[] = []
  const STEP = 1000
  for (let off = 0; ; off += STEP) {
    const { data, error } = await supabase
      .from('jobs')
      .select(SELECT)
      .order('created_at', { ascending: false })
      .range(off, off + STEP - 1)
    if (error) return new Response(`error: ${error.message}`, { status: 500 })
    const batch = (data ?? []) as unknown as Row[]
    jobs.push(...batch)
    if (batch.length < STEP) break
  }

  // 2) fecha de postulación (primer evento to_status='sent' por job)
  const sentBy = new Map<string, string>()
  const { data: sent } = await supabase
    .from('job_decisions')
    .select('job_id, created_at')
    .eq('to_status', 'sent')
    .order('created_at', { ascending: true })
  for (const d of sent ?? []) if (!sentBy.has(d.job_id)) sentBy.set(d.job_id, d.created_at)

  // 3) nombres de BU
  const { data: bus } = await supabase.from('business_units').select('id, name')
  const buName = new Map<string, string>()
  for (const b of bus ?? []) buName.set(b.id, b.name)

  // 4) armar Excel
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Upwork')
  ws.columns = [
    { header: 'Upwork ID', key: 'upwork_id', width: 18 },
    { header: 'Título', key: 'title', width: 40 },
    { header: 'Universo', key: 'universo', width: 22 },
    { header: 'Business Unit', key: 'bu', width: 22 },
    { header: 'Estado', key: 'status', width: 16 },
    { header: 'Fecha postulación', key: 'sent_date', width: 16 },
    { header: 'Score', key: 'match_score', width: 8 },
    { header: 'Score IA', key: 'classifier_score', width: 9 },
    { header: 'Viable IA', key: 'classifier_match', width: 9 },
    { header: 'Tarifa', key: 'ticket_raw', width: 16 },
    { header: 'Tarifa mín', key: 'hourly_min', width: 10 },
    { header: 'Tarifa máx', key: 'hourly_max', width: 10 },
    { header: 'Propuestas', key: 'proposals_count', width: 11 },
    { header: 'Aplicantes', key: 'total_applicants', width: 11 },
    { header: 'Invitaciones', key: 'invites_sent', width: 11 },
    { header: 'En entrevista', key: 'interviewing', width: 12 },
    { header: 'País', key: 'country', width: 16 },
    { header: 'Ciudad', key: 'city_region', width: 16 },
    { header: 'Rating cliente', key: 'client_rating', width: 12 },
    { header: 'Cliente gastó (USD)', key: 'client_total_spent', width: 14 },
    { header: 'Cliente contrataciones', key: 'client_total_hires', width: 13 },
    { header: 'Verificación', key: 'client_verification', width: 12 },
    { header: 'Duración', key: 'duration', width: 17 },
    { header: 'Dedicación', key: 'engagement', width: 17 },
    { header: 'Experiencia', key: 'experience_level', width: 12 },
    { header: 'Industria', key: 'industry', width: 16 },
    { header: 'Skills', key: 'skills', width: 34 },
    { header: 'Keyword', key: 'matched_keyword', width: 16 },
    { header: 'Connects base', key: 'connects_base', width: 12 },
    { header: 'Connects boost', key: 'connects_boost', width: 13 },
    { header: '# Preguntas', key: 'n_questions', width: 11 },
    { header: 'Cliente respondió', key: 'responded', width: 14 },
    { header: 'Link', key: 'link', width: 42 },
    { header: 'Fecha publicación', key: 'post_date', width: 18 },
    { header: 'Fecha scrapeado', key: 'created_at', width: 18 },
    { header: 'Última actividad cliente', key: 'last_client_activity', width: 16 },
    { header: 'Descripción', key: 'description', width: 50 },
  ]

  for (const j of jobs) {
    const uuid = j.id ? String(j.id) : undefined
    const skills = Array.isArray(j.skills) ? (j.skills as string[]).join(', ') : ''
    const nq = Array.isArray(j.questions) ? (j.questions as unknown[]).length : 0
    ws.addRow({
      upwork_id: j.upwork_id ?? '',
      title: j.title ?? '',
      universo: j.classifier_area ?? '',
      bu: j.business_unit_id ? buName.get(String(j.business_unit_id)) ?? '' : '',
      status: j.status ?? '',
      sent_date: uuid && sentBy.has(uuid) ? dt(sentBy.get(uuid)) : '',
      match_score: j.match_score ?? '',
      classifier_score: j.classifier_score ?? '',
      classifier_match: j.classifier_match === true ? 'Sí' : j.classifier_match === false ? 'No' : '',
      ticket_raw: j.ticket_raw ?? '',
      hourly_min: j.hourly_min ?? '',
      hourly_max: j.hourly_max ?? '',
      proposals_count: j.proposals_count ?? '',
      total_applicants: j.total_applicants ?? '',
      invites_sent: j.invites_sent ?? '',
      interviewing: j.interviewing ?? '',
      country: j.country ?? '',
      city_region: j.city_region ?? '',
      client_rating: j.client_rating ?? '',
      client_total_spent: j.client_total_spent ?? '',
      client_total_hires: j.client_total_hires ?? '',
      client_verification: j.client_verification ?? '',
      duration: j.duration ?? '',
      engagement: j.engagement ?? '',
      experience_level: j.experience_level ?? '',
      industry: j.industry ?? '',
      skills,
      matched_keyword: j.matched_keyword ?? '',
      connects_base: j.connects_base ?? '',
      connects_boost: j.connects_boost ?? '',
      n_questions: nq,
      responded: j.status === 'responded' ? 'Sí' : '',
      link: j.link ?? '',
      post_date: dt(j.post_date as string),
      created_at: dt(j.created_at as string),
      last_client_activity: dt(j.last_client_activity as string),
      description: j.description ?? '',
    })
  }

  // Header con color + filtros + panel congelado
  const header = ws.getRow(1)
  header.height = 24
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false }
    c.border = { bottom: { style: 'thin', color: { argb: 'FF111827' } } }
  })
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }

  const buf = await wb.xlsx.writeBuffer()
  const today = new Date().toISOString().slice(0, 10)
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="upwork-export-${today}.xlsx"`,
    },
  })
}
