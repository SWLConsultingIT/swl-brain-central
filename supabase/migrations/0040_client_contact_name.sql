-- 0040 — Nombre del cliente PERSISTIDO (Client Reply, Upwork + LinkedIn)
-- Antes el nombre vivía solo en el navegador (estado de sesión) → no lo veían otros
-- usuarios. Ahora se guarda en la base y queda fijo/compartido. Aditiva y segura.
alter table jobs          add column if not exists client_contact_name text;
alter table linkedin_jobs add column if not exists client_contact_name text;

comment on column jobs.client_contact_name is
  'Nombre del cliente cargado a mano en Client Reply (persistido, compartido entre usuarios).';
comment on column linkedin_jobs.client_contact_name is
  'Nombre del cliente cargado a mano en Client Reply (persistido, compartido entre usuarios).';
