-- ─────────────────────────────────────────────────────────────────
-- 0009 — Vistas de salud diaria del Brain Central.
--
-- Objetivo: que con una sola query a Supabase Juan pueda ver si el
-- pipeline corrió bien hoy (scrape + trigger + classifier + cover letter)
-- y dónde se quedó.
-- ─────────────────────────────────────────────────────────────────

-- 1) Resumen diario por status (hoy + ayer + anteayer)
create or replace view v_brain_daily_funnel as
select
  date_trunc('day', created_at)::date as day,
  status,
  count(*)::int as count
from jobs
where created_at >= (now() - interval '7 days')
group by 1, 2
order by 1 desc, 2;

comment on view v_brain_daily_funnel is
  'Distribución de jobs por status por día (últimos 7 días). Útil para ver si el scrape diario funcionó y cuánto pasó cada filtro.';

-- 2) Actividad por etapa del brain hoy
create or replace view v_brain_today_activity as
select
  actor,
  to_status,
  count(*)::int as count,
  min(created_at)::timestamptz as first_at,
  max(created_at)::timestamptz as last_at
from job_decisions
where created_at >= date_trunc('day', now())
group by 1, 2
order by 1, 2;

comment on view v_brain_today_activity is
  'Qué hizo cada actor (brain_ticket_filter, brain_classifier, brain_cover_letter) hoy: cuántas transiciones, ventana temporal. Permite detectar si una etapa no corrió.';

-- 3) Salud por workflow n8n: jobs insertados hoy y BU mix
create or replace view v_brain_today_intake as
with today_jobs as (
  select id, status, classifier_area, ticket, country, created_at
  from jobs
  where created_at >= date_trunc('day', now())
)
select
  count(*)::int as total_jobs_today,
  count(*) filter (where status = 'discarded')::int as discarded,
  count(*) filter (where status = 'prequalified')::int as prequalified_pending,
  count(*) filter (where status = 'qualified')::int as qualified_pending,
  count(*) filter (where status = 'proposal_drafted')::int as drafts_pending,
  count(*) filter (where status = 'ready_to_send')::int as ready_to_send,
  count(*) filter (where status = 'sent')::int as sent_today,
  round(avg(ticket))::int as avg_ticket
from today_jobs;

comment on view v_brain_today_intake is
  'Snapshot rápido del día: cuántos jobs entraron y dónde están parados ahora. Para chequear si el pipeline procesó todo.';

-- 4) Drafts esperando revisión humana (todos los que el equipo debería ver)
create or replace view v_brain_drafts_pending_review as
select
  j.id,
  j.upwork_id,
  j.title,
  j.ticket,
  j.country,
  j.classifier_area,
  j.classifier_score,
  j.link,
  j.cover_letter_generated_at,
  -- Edad del draft en horas
  round(extract(epoch from (now() - j.cover_letter_generated_at)) / 3600)::int as hours_since_drafted
from jobs j
where j.status = 'proposal_drafted'
order by j.cover_letter_generated_at desc;

comment on view v_brain_drafts_pending_review is
  'Drafts listos para revisión humana. Si el equipo no los procesa, se ven acá envejeciendo.';

-- 5) Costo estimado del brain hoy (rough, basado en model + count)
-- Precios actuales: Haiku 4.5 ≈ $0.004/call, Sonnet 4.5 ≈ $0.016/call
create or replace view v_brain_today_cost_estimate as
select
  count(*) filter (where actor = 'brain_classifier')::int as classifier_calls,
  count(*) filter (where actor = 'brain_cover_letter')::int as cover_letter_calls,
  round(
    (count(*) filter (where actor = 'brain_classifier') * 0.004 +
     count(*) filter (where actor = 'brain_cover_letter') * 0.016)::numeric,
    3
  ) as estimated_cost_usd
from job_decisions
where created_at >= date_trunc('day', now());

comment on view v_brain_today_cost_estimate is
  'Estimación rough de costos LLM del día. Para chequear que no nos vamos del spend cap.';
