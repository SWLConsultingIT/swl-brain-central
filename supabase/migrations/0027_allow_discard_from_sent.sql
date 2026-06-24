-- 0027: permitir descartar un job ya enviado desde la UI.
-- Caso de uso: el usuario quiere sacar de "Sent" un job (error, duplicado, etc.).
-- sent → discarded_review (mantiene el historial de que se había enviado).
insert into jobs_allowed_transitions (from_status, to_status) values
  ('sent', 'discarded_review')
on conflict (from_status, to_status) do nothing;
