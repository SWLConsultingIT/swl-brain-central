-- 0029: hacer cumplir la lista de 20 países de forma definitiva.
-- Problema: el prefiltro corre al INSERT, pero el scraper completa el país DESPUÉS
-- (en el fetch de detalle). Jobs que entran con country=null pasan el prefiltro,
-- llegan a prequalified, y el classifier los agarra antes de que se complete el país.
-- Solución: un trigger BEFORE INSERT OR UPDATE OF country que descarta cualquier job
-- cuyo país (cuando se conoce) NO esté en los 20. Así nunca llega al classifier.

create or replace function brain_reject_foreign_country()
returns trigger
language plpgsql
as $$
declare
  v_allowed text[] := array[
    'United States','USA','Canada','CAN','Argentina','ARG','Spain','ESP',
    'Mexico','MEX','Bahamas','BHS','Brazil','BRA','British Virgin Islands','VGB',
    'Chile','CHL','Colombia','COL','Costa Rica','CRI','Dominican Republic','DOM',
    'Ireland','IRL','Italy','ITA','Panama','PAN','Peru','PER','Paraguay','PRY',
    'United Kingdom','GBR','Switzerland','CHE','Uruguay','URY'
  ];
begin
  if new.country is not null
     and not (new.country = any(v_allowed))
     and coalesce(new.status, '') not in ('discarded', 'discarded_review', 'sent') then
    new.status := 'discarded';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reject_foreign_country on jobs;
create trigger trg_reject_foreign_country
before insert or update of country on jobs
for each row
execute function brain_reject_foreign_country();

-- Limpieza única: descartar los que YA están en estados activos/prequalified con país fuera de los 20.
update jobs
set status = 'discarded'
where country is not null
  and not (country = any(array[
    'United States','USA','Canada','CAN','Argentina','ARG','Spain','ESP',
    'Mexico','MEX','Bahamas','BHS','Brazil','BRA','British Virgin Islands','VGB',
    'Chile','CHL','Colombia','COL','Costa Rica','CRI','Dominican Republic','DOM',
    'Ireland','IRL','Italy','ITA','Panama','PAN','Peru','PER','Paraguay','PRY',
    'United Kingdom','GBR','Switzerland','CHE','Uruguay','URY'
  ]))
  and status in ('new', 'prequalified', 'qualified', 'proposal_drafted', 'ready_to_send');
