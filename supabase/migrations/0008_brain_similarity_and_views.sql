-- ─────────────────────────────────────────────────────────────────
-- 0008 — Brain en Postgres: similarity search + views de analytics
--
-- Suma 3 cosas al brain dentro de Supabase, todas usables desde el LLM,
-- la UI o SQL directo:
--   1. Extensión pg_trgm + función find_similar_proposals(...) → memoria
--      semántica del histórico SWL por similitud de texto.
--   2. Índices en proposals para que las queries grandes sean rápidas.
--   3. Views de analytics: v_funnel_today, v_bu_winrate, v_recent_decisions.
-- ─────────────────────────────────────────────────────────────────

-- ── Extensión para similitud de texto ──────────────────────────────
create extension if not exists pg_trgm;

-- ── Índices para queries del brain ─────────────────────────────────
create index if not exists proposals_status_idx
  on proposals (status);

create index if not exists proposals_sent_date_idx
  on proposals (sent_date desc nulls last);

create index if not exists proposals_business_unit_idx
  on proposals (business_unit_id)
  where business_unit_id is not null;

-- Índice trigram en job_title para búsqueda por similitud rápida.
create index if not exists proposals_job_title_trgm_idx
  on proposals using gin (job_title gin_trgm_ops);

-- ── Función: find_similar_proposals ────────────────────────────────
-- Dado un texto (típicamente un job title o descripción), devuelve los
-- N más parecidos del histórico Sent. Opcionalmente filtra por BU.
-- El score `similarity` es 0-1 (1 = idéntico).

create or replace function find_similar_proposals(
  p_text     text,
  p_bu_id    uuid default null,
  p_limit    int default 5,
  p_min_sim  real default 0.1
)
returns table (
  proposal_id      uuid,
  job_title        text,
  business_unit_id uuid,
  sent_date        date,
  similarity       real
)
language sql
stable
as $$
  select
    p.id,
    p.job_title,
    p.business_unit_id,
    p.sent_date,
    similarity(p.job_title, p_text) as similarity
  from proposals p
  where p.status = 'Sent'
    and p.job_title is not null
    and (p_bu_id is null or p.business_unit_id = p_bu_id)
    and similarity(p.job_title, p_text) >= p_min_sim
  order by similarity(p.job_title, p_text) desc, p.sent_date desc nulls last
  limit p_limit;
$$;

comment on function find_similar_proposals(text, uuid, int, real) is
  'Memoria semántica del brain: devuelve los Sent más parecidos a un texto. Usable desde el classifier, la UI o ad-hoc SQL.';

-- ── View: v_funnel_today ──────────────────────────────────────────
-- Counts por status — alimentación natural para un dashboard.

create or replace view v_funnel_today as
select status, count(*)::int as count
from jobs
group by status
order by
  case status
    when 'new' then 1
    when 'prequalified' then 2
    when 'qualified' then 3
    when 'proposal_drafted' then 4
    when 'ready_to_send' then 5
    when 'sent' then 6
    when 'discarded' then 7
    when 'discarded_review' then 8
  end;

comment on view v_funnel_today is 'Snapshot del funnel actual — cuántos jobs en cada estado.';

-- ── View: v_bu_winrate ────────────────────────────────────────────
-- Métricas por unidad de negocio: cuántas Sent, cuántas Lost, win rate.
-- Sirve para decirle al equipo "¿dónde estamos ganando?".

create or replace view v_bu_winrate as
select
  bu.id          as business_unit_id,
  bu.name        as business_unit,
  count(*) filter (where p.status = 'Sent')        as sent_count,
  count(*) filter (where p.status = 'Lost')        as lost_count,
  count(*) filter (where p.status = 'Client Reply') as client_reply_count,
  count(*) filter (where p.status = 'Closed')      as closed_count,
  count(*)                                          as total,
  round(
    100.0 * count(*) filter (where p.status = 'Sent')
    / nullif(count(*), 0)::numeric,
    1
  ) as sent_pct
from business_units bu
left join proposals p on p.business_unit_id = bu.id
group by bu.id, bu.name
order by sent_count desc nulls last;

comment on view v_bu_winrate is 'Stats por BU: counts y % de Sent vs total. Útil para identificar dónde SWL gana más.';

-- ── View: v_recent_decisions ──────────────────────────────────────
-- Las últimas decisiones del brain (auditoría human-readable).

create or replace view v_recent_decisions as
select
  jd.created_at,
  j.title         as job_title,
  jd.from_status,
  jd.to_status,
  jd.actor,
  jd.actor_detail,
  jd.reason,
  j.classifier_score,
  j.classifier_area
from job_decisions jd
join jobs j on j.id = jd.job_id
order by jd.created_at desc;

comment on view v_recent_decisions is 'Últimas transiciones del brain en orden cronológico inverso. Para debugging y dashboard.';
