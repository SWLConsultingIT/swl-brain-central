-- 0028: auto-expirar jobs viejos sin enviar.
-- Un job cuya publicación en Upwork ya tiene > p_days días y sigue sin enviarse
-- no vale la pena (muchas propuestas, gasta connects). Lo mandamos a descartados.
--   qualified                        -> discarded
--   proposal_drafted / ready_to_send -> discarded_review (recuperable)
-- Solo CREA la función. No ejecuta nada al instalarse.
-- Para correrla:  select brain_expire_stale_jobs(7);
create or replace function brain_expire_stale_jobs(p_days int default 7)
returns int
language plpgsql
as $$
declare
  v_job   record;
  v_to    text;
  v_count int := 0;
begin
  for v_job in
    select id, status, post_date
    from jobs
    where status in ('qualified', 'proposal_drafted', 'ready_to_send')
      and post_date is not null
      and post_date < now() - make_interval(days => p_days)
  loop
    v_to := case when v_job.status = 'qualified' then 'discarded' else 'discarded_review' end;
    perform brain_transition_job(
      v_job.id,
      v_to,
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
  'Manda a descartados los jobs sin enviar cuya publicación supera p_days (default 7). Devuelve cuántos movió.';
