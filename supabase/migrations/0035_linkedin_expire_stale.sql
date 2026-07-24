-- ─────────────────────────────────────────────────────────────────
-- 0035 — LinkedIn: auto-expirar jobs viejos (espejo de 0028 de Upwork)
--
-- Un job de LinkedIn que sigue en Check Proposal (qualified / con nota) pero cuya
-- publicación ya tiene > p_days días no vale la pena mantenerlo ahí. Lo mandamos a
-- Descartados (discarded_review, recuperable) con motivo "vencido".
--
-- Crea la función + agenda pg_cron para correr todos los días a las 07:00.
-- Manual: select brain_expire_stale_linkedin_jobs(7);
-- ─────────────────────────────────────────────────────────────────

create or replace function brain_expire_stale_linkedin_jobs(p_days int default 7)
returns int
language plpgsql
as $$
declare
  v_job   record;
  v_count int := 0;
begin
  for v_job in
    select id, status
    from linkedin_jobs
    where status in ('qualified', 'proposal_drafted', 'ready_to_send')
      and coalesce(post_date, created_at) < now() - make_interval(days => p_days)
  loop
    perform brain_transition_linkedin_job(
      v_job.id,
      'discarded_review',
      'brain_ticket_filter',
      'auto_expire_stale',
      'job vencido (>' || p_days || 'd sin aplicar)'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function brain_expire_stale_linkedin_jobs(int) is
  'Manda a Descartados (discarded_review) los LinkedIn jobs sin aplicar cuya publicación supera p_days (default 7). Devuelve cuántos movió.';

-- Agendar pg_cron (reemplaza el job si ya existía)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'linkedin-expire-stale') then
    perform cron.unschedule('linkedin-expire-stale');
  end if;
end $$;

select cron.schedule(
  'linkedin-expire-stale',
  '0 7 * * *',
  $$select brain_expire_stale_linkedin_jobs(7);$$
);
