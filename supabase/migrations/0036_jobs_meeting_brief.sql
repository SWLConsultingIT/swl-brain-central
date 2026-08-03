-- 0036 — Meeting Brief (Client Reply)
-- Guarda el link del Google Doc "Client Meeting Brief" generado a partir del
-- Job Post + Cover Letter. Aditiva y segura: columna nullable nueva, no toca nada.
alter table jobs add column if not exists meeting_brief_url text;

comment on column jobs.meeting_brief_url is
  'Link al Google Doc "Client Meeting Brief" generado on-demand desde la vista Client Reply (feature 2026-08).';
