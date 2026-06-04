-- ─────────────────────────────────────────────────────────────────
-- 0012 — Filtro brain restringido a hourly jobs con rate > $40/h.
--        Reemplaza la regla anterior (ticket >= $40 total) que descartaba
--        casi todo el mercado hourly por confundir rate-por-hora con
--        budget total del proyecto.
--
-- Reglas nuevas para que un job pase de 'new' a 'prequalified':
--   ✓ hourly_average IS NOT NULL  (solo hourly, fixed-price descartado)
--   ✓ hourly_average > 40         (estricto, NO >=)
--   ✓ post_date dentro de las últimas 24h (si está populado)
--   ✓ proposals_count <= 50 (si está populado)
--
-- Caer en cualquiera → discarded con razón específica.
-- ─────────────────────────────────────────────────────────────────

create or replace function brain_apply_ticket_filter(p_job_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_job            jobs%rowtype;
  v_new_status     text;
  v_reason         text;
  v_now            timestamptz := now();
  v_max_age_hours  int     := 24;
  v_max_proposals  int     := 50;
  v_min_hourly     numeric := 40;
begin
  select * into v_job from jobs where id = p_job_id;
  if not found then
    raise exception 'brain_apply_ticket_filter: job % not found', p_job_id;
  end if;

  if v_job.status <> 'new' then
    return v_job.status;
  end if;

  -- 1) Tiene que ser hourly job
  if v_job.hourly_average is null then
    v_new_status := 'discarded';
    v_reason     := 'fixed-price (SWL only takes hourly contracts)';

  -- 2) Rate > $40/h estricto
  elsif v_job.hourly_average <= v_min_hourly then
    v_new_status := 'discarded';
    v_reason     := format('hourly rate $%s/h not above $%s/h threshold',
                           v_job.hourly_average, v_min_hourly);

  -- 3) post_date dentro de 24h
  elsif v_job.post_date is not null
        and v_job.post_date < (v_now - (v_max_age_hours || ' hours')::interval) then
    v_new_status := 'discarded';
    v_reason := format(
      'posted %s hours ago, outside %sh window',
      round(extract(epoch from (v_now - v_job.post_date)) / 3600)::int,
      v_max_age_hours
    );

  -- 4) proposals_count <= 50
  elsif v_job.proposals_count is not null
        and v_job.proposals_count > v_max_proposals then
    v_new_status := 'discarded';
    v_reason := format(
      '%s existing proposals exceeds threshold of %s (saturated)',
      v_job.proposals_count, v_max_proposals
    );

  else
    v_new_status := 'prequalified';
    v_reason := format(
      'passed: $%s/h hourly, posted within %sh, %s existing proposals',
      v_job.hourly_average,
      v_max_age_hours,
      coalesce(v_job.proposals_count::text, '?')
    );
  end if;

  update jobs set status = v_new_status where id = p_job_id;

  insert into job_decisions (job_id, from_status, to_status, actor, actor_detail, reason)
  values (p_job_id, 'new', v_new_status, 'brain_ticket_filter', 'pg_function_v3_hourly', v_reason);

  return v_new_status;
end;
$$;

comment on function brain_apply_ticket_filter(uuid) is
'Brain stage 1 (v3 hourly-only): solo hourly jobs con rate > $40/h, posted <24h, proposals<=50. Idempotente — solo aplica si status=new.';

-- ─────────────────────────────────────────────────────────────────
-- Re-evaluar descartes de las últimas 24h con la nueva regla.
-- Solo levantamos los que ahora pasarían (no toca discards correctos).
-- ─────────────────────────────────────────────────────────────────
do $$
declare
  r record;
  n_reset int := 0;
begin
  for r in
    select id from jobs
    where status = 'discarded'
      and created_at >= now() - interval '24 hours'
      and hourly_average is not null
      and hourly_average > 40
      and (proposals_count is null or proposals_count <= 50)
      and (post_date is null or post_date >= now() - interval '24 hours')
  loop
    update jobs set status = 'new' where id = r.id;
    perform brain_apply_ticket_filter(r.id);
    n_reset := n_reset + 1;
  end loop;
  raise notice 'Re-evaluated % discarded jobs with new hourly-only rule', n_reset;
end $$;
