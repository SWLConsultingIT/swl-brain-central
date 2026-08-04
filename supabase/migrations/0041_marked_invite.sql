-- 0041 — Marca manual "Invite" en Client Reply (Upwork)
-- La API de Upwork no avisa si te invitaron a un job scrapeado. Este flag permite
-- marcarlo a mano para que vaya a Odoo como "Upwork invite". true/false/null.
-- Cuando está seteado, MANDA sobre el is_invite/by-link automático.
alter table jobs add column if not exists marked_invite boolean;

comment on column jobs.marked_invite is
  'Marca manual en Client Reply: true=vino por invite, false=job normal. Domina sobre is_invite/by-link para el origen en Odoo.';
