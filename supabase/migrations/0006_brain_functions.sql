-- ─────────────────────────────────────────────────────────────────
-- 0006 — Brain functions + triggers en Postgres
--
-- El brain corre dentro de Supabase. Cuando n8n inserta un job nuevo
-- en `jobs` con status='new', un trigger ejecuta automáticamente el
-- ticket filter y mueve el job a 'prequalified' o 'discarded'.
--
-- No hace falta llamar al API del Next.js para que el filtro corra:
-- Supabase es autónomo en esta etapa.
--
-- El LLM classifier (Paso 5) sigue viviendo en Next.js / Edge Function
-- porque necesita llamar a OpenAI vía HTTP — eso lo cableamos cuando
-- lleguen los créditos.
-- ─────────────────────────────────────────────────────────────────

-- ── 1) Función: ticket filter ───────────────────────────────────────
-- Regla SWL: pasa si currency='USD' AND ticket >= 40
-- Inputs:  p_job_id uuid
-- Outputs: nuevo status (text)
-- Side effects: UPDATE jobs.status + INSERT job_decisions

create or replace function brain_apply_ticket_filter(p_job_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_job          jobs%rowtype;
  v_new_status   text;
  v_reason       text;
begin
  select * into v_job from jobs where id = p_job_id;
  if not found then
    raise exception 'brain_apply_ticket_filter: job % not found', p_job_id;
  end if;

  -- Idempotencia: solo aplicamos a status='new'
  if v_job.status <> 'new' then
    return v_job.status;
  end if;

  if v_job.ticket is null then
    v_new_status := 'discarded';
    v_reason     := 'no ticket value';
  elsif upper(coalesce(v_job.ticket_currency, 'USD')) <> 'USD' then
    v_new_status := 'discarded';
    v_reason     := format('currency %s not USD', v_job.ticket_currency);
  elsif v_job.ticket < 40 then
    v_new_status := 'discarded';
    v_reason     := format('ticket %s USD below $40 threshold', v_job.ticket);
  else
    v_new_status := 'prequalified';
    v_reason     := format('ticket %s USD ≥ $40', v_job.ticket);
  end if;

  update jobs set status = v_new_status where id = p_job_id;

  insert into job_decisions (job_id, from_status, to_status, actor, actor_detail, reason)
  values (p_job_id, 'new', v_new_status, 'brain_ticket_filter', 'pg_function_v1', v_reason);

  return v_new_status;
end;
$$;

comment on function brain_apply_ticket_filter(uuid) is
'Aplica el ticket filter sobre un job (only when status=new). Mueve a prequalified o discarded. Idempotente.';

-- ── 2) Trigger: auto-aplicar el filter al INSERT de jobs ────────────
-- Cuando n8n (o cualquiera) inserta un job con status='new', el filter
-- corre solo. No requiere llamar al Next.js.

create or replace function brain_jobs_after_insert()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'new' then
    -- Llamada al filter. Si falla, el trigger NO bloquea la inserción
    -- (queremos que el job quede registrado aunque el filter rompa).
    begin
      perform brain_apply_ticket_filter(new.id);
    exception when others then
      raise warning 'brain_jobs_after_insert: filter failed for job % — %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_brain_after_insert on jobs;
create trigger jobs_brain_after_insert
after insert on jobs
for each row execute function brain_jobs_after_insert();

comment on trigger jobs_brain_after_insert on jobs is
'Ejecuta el ticket filter automáticamente cuando llega un job nuevo (status=new). Brain autónomo.';
