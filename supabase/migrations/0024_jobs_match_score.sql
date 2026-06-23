-- ─────────────────────────────────────────────────────────────────
-- 0024 — match_score DETERMINÍSTICO (0-100)
--
-- NADA lo decide la IA. Es objetivo: cuántas de las 8 condiciones reales
-- SUPERA el job ÷ 8 × 100. Mismos criterios que la UI.
--
-- Premia cuánto SUPERA el mínimo (el scraper ya garantiza el piso):
--   1. Tarifa ≥ $60/h        5. Cliente gastó ≥ $5.000
--   2. Tarifa ≥ $100/h       6. Cliente con ≥ 5 contrataciones
--   3. ≤ 5 propuestas        7. Rating ≥ 4.7
--   4. ≤ 10 propuestas       8. ≤ 2 invitaciones enviadas
--
-- PARTE A (segura, aditiva, SIN warning): crea la columna + función + trigger.
-- No borra nada, no hace UPDATE. Los jobs NUEVOS se puntúan solos; los viejos
-- quedan en NULL y la web los calcula en vivo (fallback) hasta el backfill.
-- ─────────────────────────────────────────────────────────────────

alter table jobs
  add column if not exists match_score smallint
    check (match_score is null or (match_score between 0 and 100));

comment on column jobs.match_score is 'Score objetivo 0-100: cuántas de 8 condiciones reales supera el job ÷ 8 × 100. Determinístico, sin IA.';

create or replace function compute_match_score(j jobs)
returns smallint language sql immutable as $$
  select round((
      (case when coalesce(j.hourly_max, j.ticket, 0) >= 60                 then 1 else 0 end)
    + (case when coalesce(j.hourly_max, j.ticket, 0) >= 100                then 1 else 0 end)
    + (case when j.proposals_count is not null and j.proposals_count <= 5  then 1 else 0 end)
    + (case when j.proposals_count is not null and j.proposals_count <= 10 then 1 else 0 end)
    + (case when coalesce(j.client_total_spent, 0) >= 5000                 then 1 else 0 end)
    + (case when coalesce(j.client_total_hires, 0) >= 5                    then 1 else 0 end)
    + (case when coalesce(j.client_rating, 0) >= 4.7                       then 1 else 0 end)
    + (case when coalesce(j.invites_sent, 0) <= 2                          then 1 else 0 end)
  )::numeric / 8 * 100)::smallint;
$$;

create or replace function set_match_score()
returns trigger language plpgsql as $$
begin
  new.match_score := compute_match_score(new);
  return new;
end;
$$;

-- create or replace (PG14+) → no necesita DROP, no dispara warning
create or replace trigger jobs_set_match_score
before insert or update on jobs
for each row execute function set_match_score();

create index if not exists jobs_match_score_idx on jobs (match_score desc nulls last);

-- ─────────────────────────────────────────────────────────────────
-- PARTE B (OPCIONAL) — backfill de los jobs viejos. Correr cuando quieras.
-- Esto SÍ muestra el warning de Supabase (por el UPDATE), pero es seguro:
-- solo escribe match_score y desactiva updated_at para no pisar fechas.
-- La web ya muestra el score igual (lo calcula en vivo), así que no urge.
--
-- alter table jobs disable trigger jobs_set_updated_at;
-- update jobs set match_score = compute_match_score(jobs) where match_score is null;
-- alter table jobs enable trigger jobs_set_updated_at;
-- ─────────────────────────────────────────────────────────────────
