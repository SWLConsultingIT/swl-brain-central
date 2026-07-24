-- ─────────────────────────────────────────────────────────────────
-- 0034 — LinkedIn: flujo "sin nota" (qualified → Check Proposal directo)
--
-- En LinkedIn no se usa cover letter: los jobs que encajan quedan en 'qualified'
-- y se muestran directo en Check Proposal para revisar y aplicar. Por eso se
-- permite marcar enviado (qualified → sent) y mandar a revisar (qualified →
-- discarded_review) sin pasar por proposal_drafted.
--
-- (Ya aplicado en vivo vía REST el 2026-07-24; este archivo lo deja versionado.)
-- ─────────────────────────────────────────────────────────────────

insert into linkedin_jobs_allowed_transitions (from_status, to_status) values
  ('qualified', 'sent'),
  ('qualified', 'discarded_review')
on conflict (from_status, to_status) do nothing;
