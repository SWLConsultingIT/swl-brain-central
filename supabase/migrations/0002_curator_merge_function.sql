-- Migration 0002 — Función curator_merge_into_bu
-- Toma (bu_id, scope nuevo, keywords nuevos) y los suma a la BU card SIN DUPLICAR.
-- El curador la llama una vez por proposal procesada.
-- Dedup case-insensitive. Idempotente.

create or replace function curator_merge_into_bu(
  p_bu_id      uuid,
  p_new_scope  text,
  p_new_kws    text[]
) returns void language plpgsql as $$
declare
  current_scopes   text[];
  current_keywords text[];
  merged_scopes    text[];
  merged_keywords  text[];
  kw               text;
begin
  -- Leer estado actual
  select scopes, keywords
    into current_scopes, current_keywords
  from business_units
  where id = p_bu_id;

  if not found then
    raise exception 'BU id % not found', p_bu_id;
  end if;

  -- Merge scope (1 nuevo, dedup case-insensitive)
  merged_scopes := current_scopes;
  if p_new_scope is not null and length(trim(p_new_scope)) > 0 then
    if not exists (
      select 1 from unnest(current_scopes) s
      where lower(trim(s)) = lower(trim(p_new_scope))
    ) then
      merged_scopes := current_scopes || array[trim(p_new_scope)];
    end if;
  end if;

  -- Merge keywords (varios nuevos, dedup case-insensitive)
  merged_keywords := current_keywords;
  if p_new_kws is not null then
    foreach kw in array p_new_kws loop
      if kw is not null and length(trim(kw)) > 0 then
        if not exists (
          select 1 from unnest(merged_keywords) k
          where lower(trim(k)) = lower(trim(kw))
        ) then
          merged_keywords := merged_keywords || array[trim(kw)];
        end if;
      end if;
    end loop;
  end if;

  -- Update único
  update business_units
  set
    scopes = merged_scopes,
    keywords = merged_keywords,
    updated_at = now()
  where id = p_bu_id;
end;
$$;

comment on function curator_merge_into_bu is
  'Llamada por el curador para sumar scope y keywords a una BU card sin duplicar. Dedup case-insensitive.';

-- Permitir invocar via REST API (Supabase RPC)
grant execute on function curator_merge_into_bu(uuid, text, text[]) to anon, authenticated, service_role;
