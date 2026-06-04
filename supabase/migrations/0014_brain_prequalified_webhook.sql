-- ─────────────────────────────────────────────────────────────────
-- 0014 — Webhook a n8n cuando un job entra a 'prequalified'.
--
-- Cuando el SQL ticket filter marca un job como prequalified (vía AFTER INSERT),
-- este trigger dispara un POST al webhook de n8n Brain Classifier con
-- { "job_id": "<uuid>" }. n8n recibe, lo clasifica con Haiku, y si pasa
-- el classifier transición a qualified → dispara trigger 0013 → cover-letter.
--
-- Event-driven puro: sin schedule, sin Loop, sin batch. Cada job se procesa
-- de inmediato, independiente de los demás.
-- ─────────────────────────────────────────────────────────────────

create or replace function brain_notify_classifier()
returns trigger
language plpgsql
security definer
as $$
declare
  v_webhook_url constant text := 'https://n8n.srv949269.hstgr.cloud/webhook/brain-classifier';
begin
  -- Dispara cuando un job entra a prequalified (desde new o cualquier otro estado)
  if new.status = 'prequalified' and (old.status is null or old.status <> 'prequalified') then
    perform net.http_post(
      url     := v_webhook_url,
      body    := jsonb_build_object('job_id', new.id::text),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_notify_classifier on jobs;
create trigger jobs_notify_classifier
after update of status on jobs
for each row execute function brain_notify_classifier();

comment on trigger jobs_notify_classifier on jobs is
'Dispara webhook al n8n Brain Classifier cuando un job entra a prequalified. Event-driven via pg_net.';
