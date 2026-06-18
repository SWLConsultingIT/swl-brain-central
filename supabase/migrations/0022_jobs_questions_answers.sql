-- ─────────────────────────────────────────────────────────────────
-- 0022 — jobs.questions_answers JSONB
-- Almacena las respuestas auto-generadas (OpenAI gpt-4o-mini) a las
-- screening questions de cada job. Reusa el mismo contexto que el
-- cover letter generator (BU card + precedente Sent + Master Prompt).
--
-- Shape: [{ "question": string, "answer": string, "edited_at": timestamptz | null }]
--   - question: copia textual de la pregunta original (de jobs.questions)
--   - answer: respuesta generada o editada por el usuario
--   - edited_at: timestamp de la última edición manual (null si nunca se editó)
--
-- NULL = no se generaron aún
-- []   = se generaron pero el job no tenía preguntas (caso raro)
-- ─────────────────────────────────────────────────────────────────

alter table jobs
  add column if not exists questions_answers jsonb;

comment on column jobs.questions_answers is
  'Respuestas auto-generadas a las screening questions. Array de {question, answer, edited_at}. NULL si no se generaron, [] si el job no tenía preguntas.';
