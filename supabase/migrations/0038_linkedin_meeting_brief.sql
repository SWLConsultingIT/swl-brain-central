-- 0038 — Meeting Brief para LinkedIn (espejo de 0036 en jobs)
-- Link al Google Doc "Client Meeting Brief" generado desde la vista Client Reply
-- de la solapa LinkedIn. Aditiva y segura: columna nullable nueva.
alter table linkedin_jobs add column if not exists meeting_brief_url text;

comment on column linkedin_jobs.meeting_brief_url is
  'Link al Google Doc "Client Meeting Brief" generado on-demand desde Client Reply (LinkedIn).';
