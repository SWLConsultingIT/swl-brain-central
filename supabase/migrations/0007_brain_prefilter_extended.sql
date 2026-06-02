-- ─────────────────────────────────────────────────────────────────
-- 0007 — Extiende el ticket filter del brain con los demás filtros
--        determinísticos del MVP (sin LLM): fecha + proposals_count.
--
-- Reglas para que un job pase de 'new' a 'prequalified':
--   ✓ ticket no es NULL
--   ✓ currency = 'USD'
--   ✓ ticket >= 40 USD
--   ✓ post_date dentro de las últimas 48 horas (si está populado)
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
  v_job          jobs%rowtype;
  v_new_status   text;
  v_reason       text;
  v_now          timestamptz := now();
  -- Thresholds tunables — TODO confirmar con SWL después de ver resultados
  v_max_age_hours  int := 48;
  v_max_proposals  int := 50;
begin
  select * into v_job from jobs where id = p_job_id;
  if not found then
    raise exception 'brain_apply_ticket_filter: job % not found', p_job_id;
  end if;

  if v_job.status <> 'new' then
    return v_job.status;
  end if;

  -- 1) Ticket presente
  if v_job.ticket is null then
    v_new_status := 'discarded';
    v_reason     := 'no ticket value';

  -- 2) Currency USD
  elsif upper(coalesce(v_job.ticket_currency, 'USD')) <> 'USD' then
    v_new_status := 'discarded';
    v_reason     := format('currency %s not USD', v_job.ticket_currency);

  -- 3) Ticket >= $40
  elsif v_job.ticket < 40 then
    v_new_status := 'discarded';
    v_reason     := format('ticket %s USD below $40 threshold', v_job.ticket);

  -- 4) post_date dentro de 48h (si está populado)
  elsif v_job.post_date is not null
        and v_job.post_date < (v_now - (v_max_age_hours || ' hours')::interval) then
    v_new_status := 'discarded';
    v_reason := format(
      'posted %s hours ago, outside %sh window',
      round(extract(epoch from (v_now - v_job.post_date)) / 3600)::int,
      v_max_age_hours
    );

  -- 5) proposals_count <= 50 (si está populado)
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
      'passed: $%s USD, posted within %sh, %s existing proposals',
      v_job.ticket,
      v_max_age_hours,
      coalesce(v_job.proposals_count::text, '?')
    );
  end if;

  update jobs set status = v_new_status where id = p_job_id;

  insert into job_decisions (job_id, from_status, to_status, actor, actor_detail, reason)
  values (p_job_id, 'new', v_new_status, 'brain_ticket_filter', 'pg_function_v2', v_reason);

  return v_new_status;
end;
$$;

comment on function brain_apply_ticket_filter(uuid) is
'Brain stage 1: 4 filtros determinísticos sobre jobs (currency, ticket, fecha, proposals_count). Idempotente — solo aplica si status=new.';
