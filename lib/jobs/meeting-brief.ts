// Genera el "Client Meeting Brief" (plantilla del jefe, 13 secciones) a partir del
// Job Post + Cover Letter. Salida = HTML semántico, que n8n convierte a un Google Doc
// (Drive convierte HTML → Doc con headings/tablas/negritas reales).
import type Anthropic from '@anthropic-ai/sdk'

// Haiku: es 1 llamada on-demand por doc; barato y suficiente para armar el brief.
export const MEETING_BRIEF_MODEL = 'claude-haiku-4-5'

export type BriefJob = {
  title: string
  description: string | null
  cover_letter_draft: string | null
  client_company_name: string | null
  country: string | null
  industry: string | null
  classifier_area: string | null
  skills: string[] | null
  hourly_min: number | null
  hourly_max: number | null
  ticket: number | null
  duration: string | null
}

// Plantilla exacta (13 secciones) que armó la dirección de SWL. El modelo la rellena.
const TEMPLATE_OUTLINE = `1. Client Business Description (Company Overview, Company Profile, Business Context, Sources of Information, Technology Stack, Interesting Insights)
2. Client Objective
3. Job Background
4. Client Challenges (tabla: Client Challenge | Why it Matters | Our Initial Approach)
5. Proposed Solution (workstreams: Business Discovery, Solution Design, Implementation, Testing & Validation, Deployment & Knowledge Transfer — cada uno con Objective / Activities / Expected Deliverables)
6. Our Understanding
7. Our Experience Relevant to this Project (Similar Industries, Similar Business Problems, Similar Technologies, Relevant Case Studies, Relevant Functional Expertise)
8. Benefits We Can Offer (tabla: Client Need | Our Approach | Expected Business Benefit)
9. Meeting Agenda (9.1 Introductions, 9.2 Understand the Business, 9.3 Validate Challenges, 9.4 Discovery Questions [Business, Operations, Technical, Data, AI/Automation, Timeline, Budget, Success Metrics], 9.5 Initial Solution Approach [Phase 1-5])
10. Potential Additional Opportunities
11. Suggested Closing
12. Meeting Notes (Key Discussion Points, Decisions Made, Open Questions, Follow-up Items — dejar vacíos para completar en la reunión)
13. Meeting Cheat Sheet (tabla Topic | Summary: Client, Industry, Main Objective, Business Context, Biggest Pain Point, Key Challenges, Expected Deliverables, Proposed Solution, Our Key Differentiator, Similar Experience, Biggest Risk, Critical Discovery Questions, Decision Maker(s), Timeline, Budget, Next Step)`

export async function generateMeetingBrief(job: BriefJob, anthropic: Anthropic): Promise<string> {
  const meta = [
    job.client_company_name ? `Empresa: ${job.client_company_name}` : '',
    job.country ? `País: ${job.country}` : '',
    job.industry ? `Industria: ${job.industry}` : '',
    job.classifier_area ? `Área SWL (BU): ${job.classifier_area}` : '',
    Array.isArray(job.skills) && job.skills.length ? `Skills: ${job.skills.join(', ')}` : '',
    job.hourly_min != null || job.hourly_max != null
      ? `Tarifa: $${job.hourly_min ?? '?'} - $${job.hourly_max ?? '?'}/h`
      : job.ticket != null ? `Presupuesto: $${job.ticket}` : '',
    job.duration ? `Duración: ${job.duration}` : '',
  ].filter(Boolean).join('\n')

  const system =
    `You prepare pre-meeting briefs for SWL Consulting, a boutique consultancy that delivers ` +
    `AI, automation, data, financial advisory and digital solutions. You are writing an internal ` +
    `"Client Meeting Brief" that the consultant reads before a first call with a prospect who just replied on Upwork.\n\n` +
    `ABSOLUTE RULE — 100% GROUNDED, NO INVENTION:\n` +
    `- The ONLY sources of truth are the Job Post + our Cover Letter + the metadata below. You have NO web access and NO outside knowledge about this company.\n` +
    `- NEVER state any fact about the client or their company — name, website, headquarters, size, industry, revenue, funding, customers, tech stack, tools, existing systems, dates, metrics or dollar amounts — UNLESS that exact fact appears in the inputs. If it is not in the inputs, do not write it and do not guess or infer it.\n` +
    `- If a section, subsection, table, row or bullet has NO content that is directly supported by the inputs, OMIT IT ENTIRELY. Do not output the heading, do not write placeholders, "(a confirmar)", "N/A", "example", or generic filler. A short brief that only contains real, supported content is the goal.\n` +
    `- Do NOT fabricate SWL's experience, past projects, case studies, clients or metrics. Only mention our experience if it is stated in the cover letter; otherwise omit "Our Experience" and "Benefits" specifics.\n` +
    `- Sections 5 (Proposed Solution), 9.4/9.5 (Discovery Questions & approach) may reason from the challenges the client actually described — they are suggestions/questions, not factual claims — but must reference ONLY what the client wrote. No assumed tools, systems or context.\n` +
    `- Every sentence must be traceable to the Job Post or the Cover Letter. If in doubt, leave it out.\n` +
    `- Be short, dense, bullet-first. Professional English.\n\n` +
    `Include ONLY the sections (from the template below) that you can fill with supported content. Skip the rest entirely.\n\n` +
    `OUTPUT FORMAT: clean semantic HTML only. Use <h1> for the title, <h2> for numbered sections, <h3> for sub-sections, ` +
    `<p>, <ul><li>, <strong>, and <table><thead><tr><th>…</thead><tbody><tr><td>…</table> for the tables. ` +
    `No markdown, no code fences, no <html>/<head>/<body> wrappers — just the body content starting with <h1>.\n\n` +
    `TEMPLATE (use only the sections you can support with the inputs; skip the rest):\n${TEMPLATE_OUTLINE}`

  const user =
    `# JOB TITLE\n${job.title}\n\n` +
    `# METADATA\n${meta || '(sin metadata adicional)'}\n\n` +
    `# JOB POST (client's posting)\n${job.description ?? '(sin descripción)'}\n\n` +
    `# OUR COVER LETTER (what we already told the client)\n${job.cover_letter_draft ?? '(sin cover letter)'}\n\n` +
    `Generate the full Client Meeting Brief as HTML now.`

  const resp = await anthropic.messages.create({
    model: MEETING_BRIEF_MODEL,
    max_tokens: 8000,
    system,
    messages: [{ role: 'user', content: user }],
  })

  const html = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
    // por si el modelo igual mete fences
    .replace(/^```html\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  return html
}
