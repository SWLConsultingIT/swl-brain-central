-- 0039 — Marcador "Hubo fit / No hubo fit" en Client Reply (Upwork + LinkedIn)
-- true = hubo fit, false = no hubo fit, null = sin marcar. Separado del "Send to Odoo"
-- (que sigue siendo una acción manual aparte). Aditiva y segura: columnas nullable.
alter table jobs          add column if not exists had_fit boolean;
alter table linkedin_jobs add column if not exists had_fit boolean;

comment on column jobs.had_fit is
  'Client Reply: true=hubo fit, false=no hubo fit, null=sin marcar (marcadores manuales).';
comment on column linkedin_jobs.had_fit is
  'Client Reply: true=hubo fit, false=no hubo fit, null=sin marcar (marcadores manuales).';
