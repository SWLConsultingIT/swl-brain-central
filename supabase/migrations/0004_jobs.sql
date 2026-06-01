-- ─────────────────────────────────────────────────────────────────
-- 0004 — jobs: tabla central de oportunidades scraped de Upwork
--
-- Refleja la máquina de estados real que SWL opera hoy en Notion:
--   new → prequalified → qualified → proposal_drafted → ready_to_send → sent
--   con desvíos a discarded / discarded_review
-- ─────────────────────────────────────────────────────────────────

create table if not exists jobs (
  id                  uuid primary key default gen_random_uuid(),

  -- Identidad / dedup
  upwork_id           text unique,
  link                text,

  -- Contenido del job
  title               text not null,
  description         text,

  -- Ticket / pricing
  ticket              numeric,
  ticket_raw          text,
  ticket_currency     text default 'USD',
  hourly_average      numeric,
  duration            text,

  -- Cliente
  country             text,
  city_region         text,
  english_level       text,
  talent_type         text,
  industry            text,

  -- Señales Upwork
  proposals_count     integer,
  post_date           timestamptz,

  -- Pipeline state
  status              text not null default 'new'
    check (status in (
      'new',
      'prequalified',
      'qualified',
      'proposal_drafted',
      'ready_to_send',
      'sent',
      'discarded',
      'discarded_review'
    )),

  -- Output del classifier (cacheado sobre el job para queries rápidos)
  classifier_match        boolean,
  classifier_score        smallint check (classifier_score is null or (classifier_score between 0 and 100)),
  classifier_area         text,
  classifier_reason       text,
  classifier_run_at       timestamptz,
  business_unit_id        uuid references business_units(id) on delete set null,

  -- Cover letter
  cover_letter_draft      text,
  cover_letter_generated_at timestamptz,

  -- Audit
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table  jobs                       is 'Oportunidades scraped de Upwork. Máquina de estados completa del funnel SWL.';
comment on column jobs.upwork_id             is 'ID nativo de Upwork (dedup natural).';
comment on column jobs.status                is 'Estado en el funnel. Ver check constraint para valores válidos.';
comment on column jobs.ticket_currency       is 'Moneda del ticket. El classifier sólo acepta jobs USD.';
comment on column jobs.classifier_score      is 'Score 0-100 del classifier LLM. NULL si no corrió todavía.';
comment on column jobs.business_unit_id      is 'BU asignada por el classifier. NULL si no match.';

-- Índices para queries frecuentes del brain
create index if not exists jobs_status_idx       on jobs (status);
create index if not exists jobs_post_date_idx    on jobs (post_date desc nulls last);
create index if not exists jobs_classifier_score_idx on jobs (classifier_score desc nulls last);

-- Trigger para updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_set_updated_at on jobs;
create trigger jobs_set_updated_at
before update on jobs
for each row execute function set_updated_at();

-- RLS encendido sin policies (se definen cuando armemos auth en Next.js)
alter table jobs enable row level security;
