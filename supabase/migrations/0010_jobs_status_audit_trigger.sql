-- ─────────────────────────────────────────────────────────────────
-- 0010 — Audit trigger para cambios de jobs.status
--
-- PROBLEMA: el bug del 2026-06-02 mostró que jobs cambiaban de status
-- sin loggear en job_decisions. Ej: proposal_drafted → qualified sin
-- decisión registrada → 0 trazas → 11 cover letters perdidos.
--
-- SOLUCIÓN: trigger AFTER UPDATE que captura CUALQUIER cambio de status
-- y lo loggea automáticamente si el código que hizo el UPDATE no escribió
-- una decisión correspondiente en los últimos 5 segundos.
--
-- Esto es defensa en profundidad: el código existente sigue funcionando
-- igual (los API routes + run-brain-pipeline.ts loggean decisión + hacen
-- UPDATE; este trigger no duplica porque encuentra la decisión reciente).
-- Pero CUALQUIER otro path (psql directo, n8n custom, bug en código nuevo)
-- queda capturado con actor='unknown'.
--
-- Para encontrar transiciones renegadas:
--   select * from job_decisions where actor = 'unknown';
-- ─────────────────────────────────────────────────────────────────

-- 1) Ampliar el CHECK de actor para permitir 'unknown' (transición sin decisión explícita)
alter table job_decisions drop constraint if exists job_decisions_actor_check;
alter table job_decisions add constraint job_decisions_actor_check
  check (actor in ('scraper', 'brain_ticket_filter', 'brain_classifier', 'brain_cover_letter', 'human', 'unknown'));

-- 2) Función + trigger del audit
create or replace function jobs_audit_status_change()
returns trigger
language plpgsql
as $$
declare
  v_recent_decision_id uuid;
begin
  if old.status is distinct from new.status then
    -- ¿Hay una decisión reciente que matchee este cambio?
    select id into v_recent_decision_id
    from job_decisions
    where job_id = new.id
      and to_status = new.status
      and created_at > (now() - interval '5 seconds')
    order by created_at desc
    limit 1;

    if v_recent_decision_id is null then
      -- Nadie logueó esta transición → la creamos sintéticamente
      insert into job_decisions (job_id, from_status, to_status, actor, actor_detail, reason)
      values (
        new.id,
        old.status,
        new.status,
        'unknown',
        'audit_trigger_v1',
        format(
          'Status changed from %s to %s without explicit decision (direct DB or code path that did not log)',
          old.status, new.status
        )
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_audit_status_change_trg on jobs;
create trigger jobs_audit_status_change_trg
after update on jobs
for each row
execute function jobs_audit_status_change();

comment on trigger jobs_audit_status_change_trg on jobs is
'Captures cualquier cambio de jobs.status que no haya escrito decisión en job_decisions. Buscar transiciones renegadas con: select * from job_decisions where actor = ''unknown''.';

comment on function jobs_audit_status_change() is
'Defensa contra cambios silenciosos de status. Si el code path no logueó decisión en los últimos 5s, el trigger lo registra como actor=unknown.';
