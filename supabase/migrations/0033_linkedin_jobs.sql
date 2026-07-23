-- ─────────────────────────────────────────────────────────────────
-- 0033 — LinkedIn Jobs CRM (espejo de la tabla `jobs` de Upwork)
--
-- Crea el pipeline paralelo para jobs scrapeados de LinkedIn (1099 / Contract USA).
-- Tabla + audit + máquina de estados SEPARADAS de Upwork, para no ensuciar `jobs`
-- ni el scoring/stats Upwork-específicos.
--
-- Reutiliza tal cual: `business_units` (RAG) y `proposals` (precedente para el pitch).
-- Reutiliza la función global `set_updated_at()` (definida en 0004).
--
-- Objetos creados:
--   1. linkedin_jobs                    — tabla central (columnas genéricas + LinkedIn)
--   2. linkedin_job_decisions           — audit trail (copia de job_decisions/0005)
--   3. linkedin_jobs_allowed_transitions — state machine (copia de 0011)
--   4. brain_transition_linkedin_job()  — RPC canónico de transición (copia de 0011)
--   5. linkedin_jobs_audit_status_change() + trigger — defensa en profundidad (copia de 0010)
-- ─────────────────────────────────────────────────────────────────

-- ── 1) linkedin_jobs ───────────────────────────────────────────────
create table if not exists linkedin_jobs (
  id                  uuid primary key default gen_random_uuid(),

  -- Identidad / dedup
  linkedin_id         text unique,          -- urn:li:jobPosting:<id> (dedup natural)
  link                text,                 -- https://www.linkedin.com/jobs/view/...

  -- Contenido del job
  title               text not null,
  description         text,

  -- Empresa / ubicación
  company_name        text,
  company_url         text,
  location            text,                 -- raw "City, ST" que devuelve LinkedIn
  city_region         text,
  country             text,
  industry            text,

  -- Señales LinkedIn (equivalentes a las de Upwork)
  employment_type     text,                 -- Contract | Freelance | Full-time | Part-time | Temporary
  workplace_type      text,                 -- Remote | Hybrid | On-site
  seniority           text,                 -- Not Applicable | Entry | Mid-Senior | ...
  job_function        text,
  applicants_count    integer,
  easy_apply          boolean,
  salary_raw          text,                 -- LinkedIn casi nunca lo trae; se guarda crudo
  posted_ago          text,                 -- "2 days ago" tal cual (respaldo de post_date)
  post_date           timestamptz,
  matched_keyword     text,                 -- keyword de búsqueda que lo trajo

  -- Pipeline state (MISMA máquina de estados que jobs)
  status              text not null default 'new'
    check (status in (
      'new',
      'prequalified',
      'qualified',
      'proposal_drafted',
      'ready_to_send',
      'sent',
      'responded',
      'discarded',
      'discarded_review'
    )),

  -- Output del classifier (cacheado sobre el job)
  classifier_match        boolean,
  classifier_score        smallint check (classifier_score is null or (classifier_score between 0 and 100)),
  classifier_area         text,
  classifier_reason       text,
  classifier_run_at       timestamptz,
  business_unit_id        uuid references business_units(id) on delete set null,
  match_score             smallint check (match_score is null or (match_score between 0 and 100)),

  -- Pitch / cover letter (nota de aplicación)
  cover_letter_draft      text,
  cover_letter_generated_at timestamptz,

  -- Notas humanas
  notes               text,

  -- Fila cruda del scrape por si algo falta
  raw_data            jsonb,

  -- Audit
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table  linkedin_jobs               is 'Jobs scrapeados de LinkedIn (1099/Contract USA). Espejo de jobs; pipeline separado.';
comment on column linkedin_jobs.linkedin_id   is 'ID nativo de LinkedIn (urn:li:jobPosting). Dedup natural.';
comment on column linkedin_jobs.status        is 'Estado en el funnel. Mismo enum que jobs.status.';
comment on column linkedin_jobs.employment_type is 'Contract/Freelance = objetivo (1099). Full-time se filtra en el prefilter.';

create index if not exists linkedin_jobs_status_idx    on linkedin_jobs (status);
create index if not exists linkedin_jobs_post_date_idx on linkedin_jobs (post_date desc nulls last);
create index if not exists linkedin_jobs_score_idx     on linkedin_jobs (classifier_score desc nulls last);

drop trigger if exists linkedin_jobs_set_updated_at on linkedin_jobs;
create trigger linkedin_jobs_set_updated_at
before update on linkedin_jobs
for each row execute function set_updated_at();

alter table linkedin_jobs enable row level security;


-- ── 2) linkedin_job_decisions (audit trail) ────────────────────────
create table if not exists linkedin_job_decisions (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references linkedin_jobs(id) on delete cascade,

  from_status       text,
  to_status         text not null,

  actor             text not null
    check (actor in ('scraper', 'brain_ticket_filter', 'brain_classifier', 'brain_cover_letter', 'human', 'unknown')),
  actor_detail      text,
  reason            text,

  classifier_score  smallint,
  classifier_match  boolean,
  classifier_area   text,

  created_at        timestamptz not null default now()
);

comment on table linkedin_job_decisions is 'Audit trail de cambios de status en linkedin_jobs. 1 fila por transición.';

create index if not exists linkedin_job_decisions_job_idx       on linkedin_job_decisions (job_id, created_at desc);
create index if not exists linkedin_job_decisions_to_status_idx on linkedin_job_decisions (to_status, created_at desc);

alter table linkedin_job_decisions enable row level security;


-- ── 3) linkedin_jobs_allowed_transitions (state machine) ───────────
create table if not exists linkedin_jobs_allowed_transitions (
  from_status text not null,
  to_status   text not null,
  primary key (from_status, to_status)
);

comment on table linkedin_jobs_allowed_transitions is
'Transiciones permitidas para linkedin_jobs.status. Fuera de esta lista falla en brain_transition_linkedin_job.';

insert into linkedin_jobs_allowed_transitions (from_status, to_status) values
  ('new', 'prequalified'),
  ('new', 'discarded'),
  -- LinkedIn no tiene prefilter de ticket como Upwork: el classifier va directo new→qualified.
  ('new', 'qualified'),
  ('prequalified', 'qualified'),
  ('prequalified', 'discarded'),
  ('qualified', 'proposal_drafted'),
  ('qualified', 'discarded'),
  ('proposal_drafted', 'ready_to_send'),
  ('proposal_drafted', 'discarded_review'),
  ('proposal_drafted', 'qualified'),
  ('ready_to_send', 'sent'),
  ('ready_to_send', 'discarded_review'),
  ('ready_to_send', 'proposal_drafted'),
  -- sent ↔ responded + discard-from-sent (equivalente a 0027/0031)
  ('sent', 'responded'),
  ('responded', 'sent'),
  ('sent', 'discarded_review'),
  ('responded', 'discarded_review'),
  -- recovery
  ('discarded', 'discarded_review'),
  ('discarded_review', 'qualified'),
  ('discarded_review', 'discarded'),
  ('discarded_review', 'proposal_drafted')
on conflict (from_status, to_status) do nothing;


-- ── 4) brain_transition_linkedin_job() (RPC canónico) ──────────────
create or replace function brain_transition_linkedin_job(
  p_job_id            uuid,
  p_to_status         text,
  p_actor             text,
  p_actor_detail      text default null,
  p_reason            text default null,
  p_classifier_match  boolean default null,
  p_classifier_score  integer default null,
  p_classifier_area   text default null,
  p_business_unit_id  uuid default null,
  p_cover_letter_draft text default null
)
returns table(from_status text, to_status text, decision_id uuid)
language plpgsql
security definer
as $$
declare
  v_current_status text;
  v_decision_id    uuid;
  v_allowed        boolean;
begin
  -- 1) Lock + read current status
  select linkedin_jobs.status into v_current_status from linkedin_jobs where id = p_job_id for update;
  if v_current_status is null then
    raise exception 'brain_transition_linkedin_job: job % not found', p_job_id;
  end if;

  -- 2) Idempotency
  if v_current_status = p_to_status then
    return query select v_current_status, p_to_status, null::uuid;
    return;
  end if;

  -- 3) Validate transition
  select exists(
    select 1 from linkedin_jobs_allowed_transitions t
    where t.from_status = v_current_status
      and t.to_status = p_to_status
  ) into v_allowed;

  if not v_allowed then
    raise exception 'Invalid transition: % → %. If valid, add it to linkedin_jobs_allowed_transitions.',
      v_current_status, p_to_status;
  end if;

  -- 4) Insert decision FIRST (same transaction → audit trigger no duplica)
  insert into linkedin_job_decisions (
    job_id, from_status, to_status, actor, actor_detail, reason,
    classifier_match, classifier_score, classifier_area
  ) values (
    p_job_id, v_current_status, p_to_status, p_actor, p_actor_detail, p_reason,
    p_classifier_match, p_classifier_score, p_classifier_area
  )
  returning id into v_decision_id;

  -- 5) Update job
  update linkedin_jobs set
    status                    = p_to_status,
    classifier_match          = coalesce(p_classifier_match, linkedin_jobs.classifier_match),
    classifier_score          = coalesce(p_classifier_score, linkedin_jobs.classifier_score),
    classifier_area           = coalesce(p_classifier_area, linkedin_jobs.classifier_area),
    classifier_reason         = case when p_classifier_match is not null then p_reason else linkedin_jobs.classifier_reason end,
    classifier_run_at         = case when p_classifier_match is not null then now() else linkedin_jobs.classifier_run_at end,
    business_unit_id          = coalesce(p_business_unit_id, linkedin_jobs.business_unit_id),
    cover_letter_draft        = coalesce(p_cover_letter_draft, linkedin_jobs.cover_letter_draft),
    cover_letter_generated_at = case when p_cover_letter_draft is not null then now() else linkedin_jobs.cover_letter_generated_at end
  where id = p_job_id;

  return query select v_current_status, p_to_status, v_decision_id;
end;
$$;

comment on function brain_transition_linkedin_job is
'Canonical RPC para transiciones de linkedin_jobs.status. Atómico: lockea + valida + loggea + actualiza. Espejo de brain_transition_job.';


-- ── 5) Audit trigger (defensa en profundidad, copia de 0010) ───────
create or replace function linkedin_jobs_audit_status_change()
returns trigger
language plpgsql
as $$
declare
  v_recent_decision_id uuid;
begin
  if old.status is distinct from new.status then
    select id into v_recent_decision_id
    from linkedin_job_decisions
    where job_id = new.id
      and to_status = new.status
      and created_at > (now() - interval '5 seconds')
    order by created_at desc
    limit 1;

    if v_recent_decision_id is null then
      insert into linkedin_job_decisions (job_id, from_status, to_status, actor, actor_detail, reason)
      values (
        new.id, old.status, new.status, 'unknown', 'audit_trigger_v1',
        format('Status changed from %s to %s without explicit decision', old.status, new.status)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists linkedin_jobs_audit_status_change_trg on linkedin_jobs;
create trigger linkedin_jobs_audit_status_change_trg
after update on linkedin_jobs
for each row
execute function linkedin_jobs_audit_status_change();

comment on trigger linkedin_jobs_audit_status_change_trg on linkedin_jobs is
'Captura cambios de linkedin_jobs.status sin decisión registrada. Buscar renegadas: select * from linkedin_job_decisions where actor = ''unknown''.';
