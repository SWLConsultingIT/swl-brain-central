-- 0029: Auto-mover a "Para Chequear" los jobs del pipeline que se saturaron.
--
-- DINÁMICA PEDIDA:
--   Cada 4h el scraper refresca propuestas/interviews de los jobs ya clasificados.
--   Si un job del pipeline (proposal_drafted / ready_to_send) cruzó el umbral
--     - proposals_count >= 40   (tope visible del scraper = saturado)
--     - interviewing    >= 4    (el cliente ya está eligiendo)
--   se mueve SOLO a discarded_review ("Para Chequear") para revisarlo.
--
-- Además: el cron de expiración (0028) mandaba los vencidos a discarded_review,
-- lo que ensuciaba "Para Chequear". Acá lo corregimos para que los vencidos
-- vayan a 'discarded' (Para Chequear queda solo con los saturados/interviews).

-- ── 1) Transiciones nuevas ───────────────────────────────────────────────────
--   - proposal_drafted/ready_to_send -> discarded: para que la expiración vaya directo a discarded.
--   - qualified -> discarded_review: para el botón "mandar a chequear" desde un qualified.
insert into jobs_allowed_transitions (from_status, to_status) values
  ('proposal_drafted', 'discarded'),
  ('ready_to_send',    'discarded'),
  ('qualified',        'discarded_review')
on conflict (from_status, to_status) do nothing;

-- ── 2) Corregir expiración: vencidos -> discarded (no discarded_review) ──────────
create or replace function brain_expire_stale_jobs(p_days int default 7)
returns int
language plpgsql
as $$
declare
  v_job   record;
  v_count int := 0;
begin
  for v_job in
    select id, status, post_date
    from jobs
    where status in ('qualified', 'proposal_drafted', 'ready_to_send')
      and post_date is not null
      and post_date < now() - make_interval(days => p_days)
  loop
    perform brain_transition_job(
      v_job.id,
      'discarded',
      'brain_ticket_filter',
      'auto_expire_stale',
      'job vencido (>' || p_days || 'd sin enviar)'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function brain_expire_stale_jobs(int) is
  'Manda a DISCARDED los jobs sin enviar cuya publicación supera p_days (default 7). Devuelve cuántos movió.';

-- ── 3) Auto-review por saturación: pipeline -> discarded_review ──────────────────
create or replace function brain_review_saturated_jobs(
  p_max_proposals int default 40,
  p_max_interviewing int default 4
)
returns int
language plpgsql
as $$
declare
  v_job    record;
  v_reason text;
  v_props  int;
  v_count  int := 0;
begin
  for v_job in
    select id, status, proposals_count, total_applicants, interviewing
    from jobs
    where status in ('proposal_drafted', 'ready_to_send')
  loop
    v_props := coalesce(v_job.proposals_count, v_job.total_applicants, 0);
    v_reason := null;
    if v_props >= p_max_proposals then
      v_reason := 'Saturado: ' || v_props || ' propuestas recibidas (>= ' || p_max_proposals || ')';
    elsif coalesce(v_job.interviewing, 0) >= p_max_interviewing then
      v_reason := 'El cliente ya entrevista a ' || v_job.interviewing || ' candidatos (>= ' || p_max_interviewing || ')';
    end if;

    if v_reason is not null then
      perform brain_transition_job(
        v_job.id,
        'discarded_review',
        'brain_saturation_review',
        'auto_review_saturated',
        v_reason
      );
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

comment on function brain_review_saturated_jobs(int, int) is
  'Mueve a discarded_review ("Para Chequear") los jobs del pipeline con >=40 propuestas o >=4 en interview. Devuelve cuántos movió.';

-- ── 4) Agendar el auto-review cada hora (corre poco después de cada scrape; ──────
--      barato, y atrapa la saturación sin depender de la hora exacta del scraper).
--      Si ya existe un job con este nombre, lo des-agenda primero.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'brain-review-saturated') then
    perform cron.unschedule('brain-review-saturated');
  end if;
end $$;

select cron.schedule(
  'brain-review-saturated',
  '30 * * * *',
  $$select brain_review_saturated_jobs();$$
);
