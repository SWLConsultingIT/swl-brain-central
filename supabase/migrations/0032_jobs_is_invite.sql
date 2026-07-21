-- 0032: marcar jobs que entran por INVITE (invitación del cliente a postularse)
--
-- Los invites entran pegando el link en la app. Se insertan con is_invite=true y
-- title placeholder; n8n después los enriquece (trae el job de Upwork, clasifica,
-- genera cover letter). Se muestran en una solapa "Invites" aparte.

alter table jobs add column if not exists is_invite boolean not null default false;

create index if not exists jobs_is_invite_idx on jobs (is_invite) where is_invite = true;
