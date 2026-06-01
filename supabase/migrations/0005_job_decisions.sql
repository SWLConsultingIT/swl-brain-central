-- ─────────────────────────────────────────────────────────────────
-- 0005 — job_decisions: audit trail de transiciones de estado
--
-- Cada vez que un job cambia de status (auto o manual), se inserta
-- una fila acá. Permite reconstruir el historial completo + medir
-- match-rate, false positives, etc.
-- ─────────────────────────────────────────────────────────────────

create table if not exists job_decisions (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references jobs(id) on delete cascade,

  -- Transición
  from_status       text,        -- NULL en la primera decisión
  to_status         text not null,

  -- Quién / qué la causó
  actor             text not null
    check (actor in ('scraper', 'brain_ticket_filter', 'brain_classifier', 'brain_cover_letter', 'human')),
  actor_detail      text,        -- ej. 'gpt-4o-mini', email del humano, etc.

  -- Por qué (para audit + debugging)
  reason            text,

  -- Snapshot de scoring al momento de la decisión (NULL si no aplica)
  classifier_score  smallint,
  classifier_match  boolean,
  classifier_area   text,

  created_at        timestamptz not null default now()
);

comment on table  job_decisions             is 'Audit trail de cambios de status en jobs. 1 fila por transición.';
comment on column job_decisions.actor       is 'Qué/quién hizo la transición.';
comment on column job_decisions.actor_detail is 'Detalle libre: nombre del modelo, email del operador, etc.';

create index if not exists job_decisions_job_idx        on job_decisions (job_id, created_at desc);
create index if not exists job_decisions_to_status_idx  on job_decisions (to_status, created_at desc);

alter table job_decisions enable row level security;
