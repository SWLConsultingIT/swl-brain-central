-- Brain Central — Core schema
-- Run order: este archivo primero, después seeds/business_units.sql

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────
-- 1. business_units — las fichas RAG por unidad de negocio
--    Template de 7 secciones que define el criterio del agente
-- ─────────────────────────────────────────────────────────────────
create table if not exists business_units (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,
  description       text not null,
  scopes            text[] not null default '{}',
  keywords          text[] not null default '{}',
  good_fit_signals  text not null default '',
  red_flags         text not null default '',
  decision_logic    text not null default '',
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table business_units is 'RAG cards por unidad de negocio. Template de 7 secciones definido por usuario. Seed inicial desde PDF SWL; enriquecido por curador desde proposals.';
comment on column business_units.scopes is 'Array de scopes posibles que SWL ejecuta en esta BU.';
comment on column business_units.keywords is 'Keywords que disparan match (incluye tools/platforms). El agente filtra por estas.';
comment on column business_units.good_fit_signals is 'Patrones que indican qualified.';
comment on column business_units.red_flags is 'Patrones que indican discarded.';
comment on column business_units.decision_logic is 'Regla resumen para decidir match.';


-- ─────────────────────────────────────────────────────────────────
-- 2. proposals — histórico de propuestas enviadas (las 1200 + las futuras)
--    Fuente de verdad de "qué realmente aplicó SWL".
-- ─────────────────────────────────────────────────────────────────
create table if not exists proposals (
  id                uuid primary key default gen_random_uuid(),
  upwork_id         text unique,                  -- dedup natural
  job_title         text not null,
  description       text,
  ai_summary        text,
  cover_letter      text,
  ticket            numeric,
  ticket_raw        text,
  keyword           text,
  status            text,                         -- 'Sent', 'Qualified', etc.
  business_unit_id  uuid references business_units(id) on delete set null,
  sent_date         date,
  link              text,
  tools             text[] default '{}',
  country           text,
  payment_method    text,
  total_spent       numeric,
  proposals_count   integer,
  interviewing      boolean,
  raw_data          jsonb,                        -- fila original por si algo falta
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table proposals is 'Historial de propuestas enviadas. business_unit_id se asigna por el curador.';


-- ─────────────────────────────────────────────────────────────────
-- 3. prospects — pipeline activo (lo nuevo que entra de Upwork)
--    Reemplaza al board de Notion.
-- ─────────────────────────────────────────────────────────────────
create table if not exists prospects (
  id                uuid primary key default gen_random_uuid(),
  upwork_id         text unique,
  job_title         text not null,
  description       text,
  ai_summary        text,
  ticket            numeric,
  ticket_raw        text,
  ticket_passes     boolean,
  keyword           text,
  status            text not null default 'Prospect',  -- Prospect, Prequalified, Check Proposal, Ready to Send, Sent, Discarded
  business_unit_id  uuid references business_units(id) on delete set null,
  ai_match          boolean,
  ai_reason         text,
  ai_area           text,
  link              text,
  cover_letter      text,
  notion_page_id    text,                         -- temporal durante transición
  raw_data          jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table prospects is 'Pipeline activo. Reemplaza el board de Notion.';
comment on column prospects.notion_page_id is 'Solo durante transición Notion→Supabase. Borrar cuando se apague Notion.';


-- ─────────────────────────────────────────────────────────────────
-- Índices clave
-- ─────────────────────────────────────────────────────────────────
create index if not exists idx_proposals_bu       on proposals(business_unit_id);
create index if not exists idx_proposals_status   on proposals(status);
create index if not exists idx_proposals_keyword  on proposals(keyword);
create index if not exists idx_proposals_sent     on proposals(sent_date desc);

create index if not exists idx_prospects_status   on prospects(status);
create index if not exists idx_prospects_bu       on prospects(business_unit_id);
create index if not exists idx_prospects_created  on prospects(created_at desc);


-- ─────────────────────────────────────────────────────────────────
-- Trigger genérico para updated_at
-- ─────────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_business_units_updated on business_units;
create trigger trg_business_units_updated
  before update on business_units
  for each row execute function set_updated_at();

drop trigger if exists trg_proposals_updated on proposals;
create trigger trg_proposals_updated
  before update on proposals
  for each row execute function set_updated_at();

drop trigger if exists trg_prospects_updated on prospects;
create trigger trg_prospects_updated
  before update on prospects
  for each row execute function set_updated_at();
