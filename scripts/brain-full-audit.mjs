// Auditoría completa del Brain — Partes A + B
// Cero costo: solo lecturas a Supabase y archivos del repo.
//
// Parte A: mecánica del pipeline (workflows n8n, status, keys, jobs en kanban)
// Parte B: HTML detallado de los 276 jobs del fin de semana

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const WINDOW_START = '2026-06-05T00:00:00Z'
const WINDOW_END   = '2026-06-08T23:59:59Z'

console.log('╔═══════════════════════════════════════════════════════════════╗')
console.log('║           BRAIN AUDIT — Partes A + B (cero costo)              ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

// ════════════════════════════════════════════════════════════════
// PARTE A — MECÁNICA DEL PIPELINE
// ════════════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════════════')
console.log('  PARTE A — MECÁNICA DEL PIPELINE')
console.log('═══════════════════════════════════════════════════════════════\n')

// 1. Workflows n8n del repo
console.log('🔧 WORKFLOWS N8N (lo que está en el repo):')
const n8nDirs = ['classifier', 'cover-letter', 'brain-pipeline', 'curator', 'notion-sync', 'prospect-automation', 'upwork-supabase-v2']
for (const dir of n8nDirs) {
  const fullDir = `n8n/${dir}`
  if (!existsSync(fullDir)) continue
  try {
    const files = readdirSync(fullDir).filter(f => f.endsWith('.json'))
    for (const f of files) {
      const wf = JSON.parse(readFileSync(path.join(fullDir, f), 'utf8'))
      const trigger = (() => {
        for (const n of wf.nodes || []) {
          const t = (n.type||'').toLowerCase()
          if (t.includes('scheduletrigger')) {
            const rule = n.parameters?.rule?.interval?.[0]
            if (rule?.expression) return `cron: ${rule.expression}`
            if (rule) return `schedule: ${JSON.stringify(rule).slice(0,40)}`
            return 'schedule'
          }
          if (t.includes('webhook')) return `webhook: ${n.parameters?.path || '?'}`
        }
        return 'no trigger'
      })()
      console.log(`   📄 ${(dir+'/'+f).padEnd(45)} active=${String(wf.active).padEnd(6)} ${trigger}`)
    }
  } catch (e) {
    console.log(`   ⚠️  ${dir}: ${e.message}`)
  }
}

// 2. Última actividad del classifier y cover letter
console.log('\n🤖 ÚLTIMA EJECUCIÓN DE COMPONENTES (en Supabase):')
const { data: lastClassif } = await supabase
  .from('jobs')
  .select('classifier_run_at')
  .not('classifier_run_at', 'is', null)
  .order('classifier_run_at', { ascending: false })
  .limit(1)
const { data: lastCover } = await supabase
  .from('jobs')
  .select('cover_letter_generated_at')
  .not('cover_letter_generated_at', 'is', null)
  .order('cover_letter_generated_at', { ascending: false })
  .limit(1)
const { data: lastIngest } = await supabase
  .from('jobs')
  .select('created_at')
  .order('created_at', { ascending: false })
  .limit(1)

const fmtAge = (iso) => {
  if (!iso) return 'NEVER'
  const age = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (age < 60) return `${age} min ago`
  if (age < 1440) return `${Math.round(age/60)} h ago`
  return `${Math.round(age/1440)} días ago`
}

console.log(`   Último job ingestado:        ${lastIngest?.[0]?.created_at?.slice(0,19) || 'NEVER'}  (${fmtAge(lastIngest?.[0]?.created_at)})`)
console.log(`   Último classifier run:       ${lastClassif?.[0]?.classifier_run_at?.slice(0,19) || 'NEVER'}  (${fmtAge(lastClassif?.[0]?.classifier_run_at)})`)
console.log(`   Última cover letter:         ${lastCover?.[0]?.cover_letter_generated_at?.slice(0,19) || 'NEVER'}  (${fmtAge(lastCover?.[0]?.cover_letter_generated_at)})`)

// 3. Jobs en cada status del kanban
console.log('\n📊 JOBS EN CADA STATUS (estado actual de la tabla):')
const { data: allStatus } = await supabase.from('jobs').select('status')
const statusCount = {}
for (const r of allStatus || []) statusCount[r.status] = (statusCount[r.status]||0) + 1
const statusOrder = ['new', 'prequalified', 'qualified', 'proposal_drafted', 'ready_to_send', 'sent', 'discarded', 'discarded_review']
for (const s of statusOrder) {
  if (statusCount[s] != null) console.log(`   ${s.padEnd(25)} ${statusCount[s]}`)
}
for (const [s, c] of Object.entries(statusCount)) {
  if (!statusOrder.includes(s)) console.log(`   ${s.padEnd(25)} ${c}`)
}

// 4. Jobs colgados (necesitan atención)
console.log('\n⏳ JOBS COLGADOS AHORA MISMO:')
const { count: stuckPreq } = await supabase
  .from('jobs').select('*', { count: 'exact', head: true })
  .eq('status', 'prequalified').is('classifier_run_at', null)
const { count: stuckQual } = await supabase
  .from('jobs').select('*', { count: 'exact', head: true })
  .eq('status', 'qualified').is('cover_letter_draft', null)
const { count: stuckReview } = await supabase
  .from('jobs').select('*', { count: 'exact', head: true })
  .eq('status', 'discarded_review')
console.log(`   Prequalified sin classify:    ${stuckPreq}  ${stuckPreq > 0 ? '⚠️' : '✅'}`)
console.log(`   Qualified sin cover letter:   ${stuckQual}  ${stuckQual > 0 ? '⚠️' : '✅'}`)
console.log(`   En discarded_review:          ${stuckReview}  ${stuckReview > 0 ? '👀 revisar manual' : '✅'}`)

// 5. Test rápido de keys
console.log('\n🔑 API KEYS:')
console.log(`   ANTHROPIC_API_KEY  ${process.env.ANTHROPIC_API_KEY ? '✅ presente ('+process.env.ANTHROPIC_API_KEY.length+' chars)' : '❌ FALTA'}`)
console.log(`   SUPABASE_SECRET_KEY  ${process.env.SUPABASE_SECRET_KEY ? '✅ presente' : '❌ FALTA'}`)
console.log(`   OPENAI_API_KEY  ${process.env.OPENAI_API_KEY ? '✅ presente' : '⚠️ FALTA'}`)
console.log(`   GITHUB_TOKEN  ${process.env.GITHUB_TOKEN ? '✅ presente' : '⚠️ FALTA'}`)

// 6. Tablas auxiliares
const { count: buCount } = await supabase.from('business_units').select('*', { count:'exact', head:true }).eq('is_active', true)
const { count: propCount } = await supabase.from('proposals').select('*', { count:'exact', head:true }).eq('status', 'Sent')
const { count: propWithCL } = await supabase.from('proposals').select('*', { count:'exact', head:true }).eq('status', 'Sent').not('cover_letter', 'is', null).neq('cover_letter', '')
console.log('\n🗃️  TABLAS DE CONOCIMIENTO:')
console.log(`   business_units activos:       ${buCount} BU cards`)
console.log(`   proposals Sent (precedent):   ${propCount} (${propWithCL} con texto de cover letter)`)
if (propWithCL === 0) console.log(`   ⚠️  CERO precedentes con texto — el brain clasifica/escribe SIN memoria real`)

// ════════════════════════════════════════════════════════════════
// PARTE B — HTML DETALLADO DEL FIN DE SEMANA
// ════════════════════════════════════════════════════════════════
console.log('\n\n═══════════════════════════════════════════════════════════════')
console.log('  PARTE B — HTML DETALLADO DEL FIN DE SEMANA')
console.log('═══════════════════════════════════════════════════════════════\n')

// Cargar todos los jobs del fin de semana
const { data: allJobs } = await supabase
  .from('jobs')
  .select('id, title, description, status, classifier_match, classifier_score, classifier_area, classifier_reason, classifier_run_at, cover_letter_draft, cover_letter_generated_at, ticket, hourly_average, created_at, business_unit_id, country, industry, link')
  .gte('created_at', WINDOW_START)
  .lte('created_at', WINDOW_END)
  .order('created_at')

const { data: bus } = await supabase.from('business_units').select('id, name')
const buNames = Object.fromEntries((bus||[]).map(b => [b.id, b.name]))

// Categorizar
const cat = {
  buggy: [],      // 33 jobs: classifier corrió pero score=0/reason=""
  legit: [],      // clasificados bien (reason no vacío)
  filtered: [],   // descartados antes del classifier (ticket bajo)
}
for (const j of allJobs || []) {
  if (j.classifier_run_at) {
    const reason = (j.classifier_reason || '').trim()
    if (j.classifier_score === 0 && !reason) cat.buggy.push(j)
    else cat.legit.push(j)
  } else {
    cat.filtered.push(j)
  }
}

console.log(`Total jobs en ventana: ${allJobs?.length || 0}`)
console.log(`   ✅ Bien clasificados:     ${cat.legit.length}`)
console.log(`   🐞 Mal por bug:           ${cat.buggy.length}`)
console.log(`   🚪 Filtrados por ticket:  ${cat.filtered.length}`)

// Helper para renderear job
const esc = s => (s||'').toString().replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))
const renderJob = (j, badge, badgeClass) => {
  const bu = buNames[j.business_unit_id] || ''
  const ticket = j.ticket ? `$${j.ticket}` : (j.hourly_average ? `$${j.hourly_average}/h` : '—')
  const cover = j.cover_letter_draft || ''
  return `<div class="job ${badgeClass}">
    <div class="hdr">
      <span class="badge ${badgeClass}">${badge}</span>
      <span class="ticket">${ticket}</span>
      <span class="date">${j.created_at.slice(0,16).replace('T',' ')}</span>
      ${j.link ? `<a href="${esc(j.link)}" target="_blank" class="link">↗ Upwork</a>` : ''}
    </div>
    <p class="title">${esc(j.title || '(sin título)')}</p>
    <div class="meta">
      ${j.country ? `📍 ${esc(j.country)}` : ''}
      ${j.industry ? `· 🏢 ${esc(j.industry)}` : ''}
      ${bu ? `· 🎯 BU: ${esc(bu)}` : ''}
      ${j.classifier_score != null ? `· score: ${j.classifier_score}` : ''}
      ${j.classifier_area ? `· area: ${esc(j.classifier_area)}` : ''}
    </div>
    ${j.classifier_reason ? `<div class="reason"><b>Reason:</b> ${esc(j.classifier_reason)}</div>` : ''}
    ${cover ? `<details class="cover-details"><summary>📄 Ver cover letter (${cover.length} chars)</summary><pre>${esc(cover)}</pre></details>` : ''}
  </div>`
}

const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Brain Audit Weekend — ${WINDOW_START.slice(0,10)} → ${WINDOW_END.slice(0,10)}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;max-width:1200px;margin:20px auto;padding:0 20px;color:#111;background:#fafafa}
  h1{font-size:24px;margin:0 0 5px}
  h2{font-size:20px;margin-top:40px;padding:10px 15px;border-radius:6px}
  h2.legit{background:#d1fae5;color:#065f46}
  h2.buggy{background:#fee2e2;color:#991b1b}
  h2.filtered{background:#e5e7eb;color:#374151}
  .summary{background:white;border:1px solid #ddd;border-radius:8px;padding:15px 20px;margin-bottom:30px;display:flex;gap:30px;flex-wrap:wrap}
  .stat{font-size:14px}
  .stat b{font-size:24px;display:block;color:#0066cc}
  .job{background:white;border:1px solid #e5e7eb;border-radius:6px;padding:14px;margin:8px 0}
  .job.legit{border-left:4px solid #10b981}
  .job.buggy{border-left:4px solid #ef4444}
  .job.filtered{border-left:4px solid #9ca3af}
  .hdr{display:flex;gap:12px;align-items:center;font-size:12px;color:#666;margin-bottom:6px}
  .badge{padding:2px 8px;border-radius:4px;font-weight:600;color:white;font-size:11px}
  .badge.legit{background:#10b981}
  .badge.legit.match{background:#059669}
  .badge.buggy{background:#ef4444}
  .badge.filtered{background:#9ca3af}
  .ticket{font-weight:600;color:#111}
  .link{margin-left:auto;color:#0066cc;text-decoration:none}
  .title{font-size:15px;font-weight:600;margin:5px 0}
  .meta{font-size:12px;color:#666;margin:5px 0}
  .reason{background:#fffbeb;padding:8px 12px;border-radius:4px;font-size:13px;color:#78350f;margin-top:8px}
  .cover-details{margin-top:10px;font-size:13px}
  .cover-details summary{cursor:pointer;color:#0066cc;padding:5px 0}
  .cover-details pre{background:#f3f4f6;padding:15px;border-radius:6px;white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.5;margin:8px 0 0}
</style></head><body>

<h1>🧠 Brain Audit — Fin de semana ${WINDOW_START.slice(0,10)} → ${WINDOW_END.slice(0,10)}</h1>
<p style="color:#666">Auditoría completa: cada job ingestado y qué decidió el brain con él.</p>

<div class="summary">
  <div class="stat"><b>${allJobs?.length||0}</b>Total ingestados</div>
  <div class="stat"><b>${cat.legit.length}</b>Bien clasificados</div>
  <div class="stat"><b>${cat.legit.filter(j=>j.classifier_match).length}</b>Match (qualified)</div>
  <div class="stat"><b>${(allJobs||[]).filter(j=>j.cover_letter_draft).length}</b>Cover letters generadas</div>
  <div class="stat"><b style="color:#dc2626">${cat.buggy.length}</b>Rotas por bug (rescatables)</div>
  <div class="stat"><b>${cat.filtered.length}</b>Filtradas por ticket</div>
</div>

<h2 class="legit">✅ ${cat.legit.length} jobs CLASIFICADOS BIEN (con razón legítima)</h2>
<p>Estos son los que pasaron filtros y el classifier les asignó match o discarded con una razón clara.</p>
${cat.legit.map(j => renderJob(j,
  j.classifier_match ? '✅ MATCH' : '❌ NO MATCH',
  'legit' + (j.classifier_match ? ' match' : ''))).join('\n')}

<h2 class="buggy">🐞 ${cat.buggy.length} jobs CON BUG (rescatables si los re-clasificamos)</h2>
<p>El classifier corrió pero devolvió score=0 / reason="" por el bug del max_tokens + parser que arreglamos hoy. <strong>Estos son los que se perdieron — al re-clasificarlos con el fix, probablemente ~12 sean match real y generen cover letters.</strong></p>
${cat.buggy.map(j => renderJob(j, '🐞 BUG', 'buggy')).join('\n')}

<h2 class="filtered">🚪 ${cat.filtered.length} jobs FILTRADOS POR TICKET (no llegaron al classifier)</h2>
<p>Hourly < $40 o no eran HOURLY. Descartados correctamente antes del LLM. <em>Solo muestro los 30 más recientes.</em></p>
${cat.filtered.slice(-30).reverse().map(j => renderJob(j, '🚪 FILTERED', 'filtered')).join('\n')}

</body></html>`

writeFileSync('brain-weekend-audit.html', html)
console.log(`\n📄 HTML generado: brain-weekend-audit.html`)
console.log(`   Total: ${(html.length/1024).toFixed(0)} KB`)
