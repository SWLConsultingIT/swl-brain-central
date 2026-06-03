-- ─────────────────────────────────────────────────────────────────
-- 0011 — Canonical RPC para transiciones de status + valid moves
--
-- PROBLEMA: el patrón actual del código (UPDATE jobs → INSERT job_decisions)
-- crea race condition con el audit trigger (0010) y permite que código
-- futuro pisé el estado sin loggear.
--
-- SOLUCIÓN: una sola función SQL atómica que:
--   1. Lockea el job
--   2. Lee status actual
--   3. Valida que la transición sea permitida
--   4. INSERTa la decisión PRIMERO (mismo transaction)
--   5. UPDATEa el job
--
-- El audit trigger (0010) ahora ve la decisión en la misma transacción
-- y no duplica. Todos los code paths deben pasar por esta función.
--
-- USO desde Next.js:
--   await supabase.rpc('brain_transition_job', {
--     p_job_id: id,
--     p_to_status: 'qualified',
--     p_actor: 'brain_classifier',
--     p_actor_detail: 'claude-haiku-4-5',
--     p_reason: '...',
--     p_classifier_match: true, p_classifier_score: 85, ...
--   })
--
-- USO desde otros code paths (n8n, scripts SQL):
--   select * from brain_transition_job('uuid'::uuid, 'qualified', 'human', ...)
-- ─────────────────────────────────────────────────────────────────

-- ── 1) Tabla de transiciones permitidas ────────────────────────────
create table if not exists jobs_allowed_transitions (
  from_status text not null,
  to_status   text not null,
  primary key (from_status, to_status)
);

comment on table jobs_allowed_transitions is
'Transiciones permitidas para jobs.status. Cualquier intento fuera de esta lista falla en brain_transition_job.';

-- State machine completa
insert into jobs_allowed_transitions (from_status, to_status) values
  -- Stage 1: ticket filter
  ('new', 'prequalified'),
  ('new', 'discarded'),
  -- Stage 2: LLM classifier
  ('prequalified', 'qualified'),
  ('prequalified', 'discarded'),
  -- Stage 3: cover letter generation
  ('qualified', 'proposal_drafted'),
  ('qualified', 'discarded'),
  -- Stage 4: human review
  ('proposal_drafted', 'ready_to_send'),
  ('proposal_drafted', 'discarded_review'),
  ('proposal_drafted', 'qualified'), -- re-draft if needed
  -- Stage 5: send
  ('ready_to_send', 'sent'),
  ('ready_to_send', 'discarded_review'),
  ('ready_to_send', 'proposal_drafted'), -- back to review
  -- Recovery paths
  ('discarded', 'discarded_review'),
  ('discarded_review', 'qualified'),
  ('discarded_review', 'discarded'),
  ('discarded_review', 'proposal_drafted')
on conflict (from_status, to_status) do nothing;

-- ── 2) La función canónica ─────────────────────────────────────────
create or replace function brain_transition_job(
  p_job_id            uuid,
  p_to_status         text,
  p_actor             text,
  p_actor_detail      text default null,
  p_reason            text default null,
  p_classifier_match  boolean default null,
  p_classifier_score  integer default null,
  p_classifier_area   text default null,
  p_business_unit_id  uuid default null,
  p_cover_letter_draft text default null
)
returns table(from_status text, to_status text, decision_id uuid)
language plpgsql
security definer
as $$
declare
  v_current_status text;
  v_decision_id    uuid;
  v_allowed        boolean;
begin
  -- 1) Lock + read current status
  select jobs.status into v_current_status from jobs where id = p_job_id for update;
  if v_current_status is null then
    raise exception 'brain_transition_job: job % not found', p_job_id;
  end if;

  -- 2) Idempotency: si ya está en el target status, no-op (no error)
  if v_current_status = p_to_status then
    return query select v_current_status, p_to_status, null::uuid;
    return;
  end if;

  -- 3) Validate transition
  select exists(
    select 1 from jobs_allowed_transitions t
    where t.from_status = v_current_status
      and t.to_status = p_to_status
  ) into v_allowed;

  if not v_allowed then
    raise exception 'Invalid transition: % → %. If valid, add it to jobs_allowed_transitions.',
      v_current_status, p_to_status;
  end if;

  -- 4) Insert decision FIRST (same transaction → audit trigger 0010 won't duplicate)
  insert into job_decisions (
    job_id, from_status, to_status, actor, actor_detail, reason,
    classifier_match, classifier_score, classifier_area
  ) values (
    p_job_id, v_current_status, p_to_status, p_actor, p_actor_detail, p_reason,
    p_classifier_match, p_classifier_score, p_classifier_area
  )
  returning id into v_decision_id;

  -- 5) Update job (status + relevant metadata)
  update jobs set
    status                    = p_to_status,
    classifier_match          = coalesce(p_classifier_match, jobs.classifier_match),
    classifier_score          = coalesce(p_classifier_score, jobs.classifier_score),
    classifier_area           = coalesce(p_classifier_area, jobs.classifier_area),
    classifier_reason         = case when p_classifier_match is not null then p_reason else jobs.classifier_reason end,
    classifier_run_at         = case when p_classifier_match is not null then now() else jobs.classifier_run_at end,
    business_unit_id          = coalesce(p_business_unit_id, jobs.business_unit_id),
    cover_letter_draft        = coalesce(p_cover_letter_draft, jobs.cover_letter_draft),
    cover_letter_generated_at = case when p_cover_letter_draft is not null then now() else jobs.cover_letter_generated_at end
  where id = p_job_id;

  return query select v_current_status, p_to_status, v_decision_id;
end;
$$;

comment on function brain_transition_job is
'Canonical RPC para transiciones de status. Atómico: lockea + valida + loggea decisión + actualiza job. Todos los code paths (API routes, pipeline, n8n) deben usar esta función.';
