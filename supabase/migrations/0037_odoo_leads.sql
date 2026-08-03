-- 0037 — Odoo Leads (tercera fuente del CRM)
-- Prospectos que Odoo asigna a SWL por email a sales@ ("Sus leads / Tus leads").
-- Un workflow n8n lee la casilla, parsea y hace upsert acá. La app los muestra en
-- la solapa "Odoo". No son jobs (sin classifier/cover letter): son contactos.
create table if not exists odoo_leads (
  id                 uuid primary key default gen_random_uuid(),
  name               text,
  company            text,
  country            text,
  email              text,
  phone              text,
  portal_link        text,
  status             text not null default 'new',   -- new | contacted | interested | discarded
  source             text not null default 'odoo',
  email_subject      text,
  email_received_at  timestamptz,
  raw_text           text,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table odoo_leads is
  'Leads que Odoo asigna a SWL por email (fuente 3 del CRM). Ingesta vía n8n (Gmail sales@ → parse → upsert). Feature 2026-08.';

-- Dedup: un lead = un email. Índice único NO parcial sobre email para que n8n
-- pueda hacer upsert REST con on_conflict=email (los null se tratan distintos → OK).
create unique index if not exists odoo_leads_email_uidx on odoo_leads (email);

create index if not exists odoo_leads_status_idx on odoo_leads (status);
create index if not exists odoo_leads_received_idx on odoo_leads (email_received_at desc);
