-- ─────────────────────────────────────────────────────────────────
-- 0021 — jobs.questions JSONB
-- Almacena las screening questions oficiales de Upwork por job.
-- Fuente: GraphQL marketplaceJobPosting(id).contractorSelection
--         .proposalRequirement.screeningQuestions
-- Shape: [{ "question": string, "sequenceNumber": number }]
-- ─────────────────────────────────────────────────────────────────

alter table jobs
  add column if not exists questions jsonb;

comment on column jobs.questions is
  'Screening questions oficiales de Upwork. Array de {question, sequenceNumber}. NULL si no se trajeron todavía; [] si el job no tiene preguntas.';
