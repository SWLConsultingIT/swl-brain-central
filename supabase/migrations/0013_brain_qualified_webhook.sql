-- ─────────────────────────────────────────────────────────────────
-- 0013 — Webhook a n8n cuando un job entra a 'qualified'.
--
-- Cuando el classifier marca un job como qualified (vía brain_transition_job),
-- este trigger dispara un POST al webhook de n8n Brain Cover Letter con
-- { "job_id": "<uuid>" }. n8n recibe, genera el draft, y lo guarda.
--
-- Event-driven puro: sin acoplar workflows entre sí en n8n.
-- ─────────────────────────────────────────────────────────────────

create extension if not exists pg_net;

create or replace function brain_notify_cover_letter()
returns trigger
language plpgsql
security definer
as $$
declare
  v_webhook_url constant text := 'https://n8n.srv949269.hstgr.cloud/webhook/brain-cover-letter';
begin
  -- Solo cuando entra a qualified desde otro estado (no idempotent no-ops)
  if new.status = 'qualified' and (old.status is null or old.status <> 'qualified') then
    perform net.http_post(
      url     := v_webhook_url,
      body    := jsonb_build_object('job_id', new.id::text),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_notify_cover_letter on jobs;
create trigger jobs_notify_cover_letter
after update of status on jobs
for each row execute function brain_notify_cover_letter();

comment on trigger jobs_notify_cover_letter on jobs is
'Dispara webhook al n8n Brain Cover Letter cuando un job entra a qualified. Event-driven via pg_net.';
