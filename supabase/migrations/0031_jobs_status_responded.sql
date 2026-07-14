-- 0031: agregar 'responded' al CHECK constraint de jobs.status
--
-- La migración 0018 sumó las transiciones sent<->responded a
-- jobs_allowed_transitions, pero NO actualizó el check constraint de la columna
-- status (definido en 0004). Resultado: al intentar marcar un job como
-- 'responded' desde la UI fallaba con:
--   new row for relation "jobs" violates check constraint "jobs_status_check"
-- Esta migración re-crea el constraint incluyendo 'responded'.

alter table jobs drop constraint if exists jobs_status_check;

alter table jobs add constraint jobs_status_check
  check (status in (
    'new',
    'prequalified',
    'qualified',
    'proposal_drafted',
    'ready_to_send',
    'sent',
    'responded',
    'discarded',
    'discarded_review'
  ));
