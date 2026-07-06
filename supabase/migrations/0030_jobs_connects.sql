-- 0030: registrar connects gastados por propuesta (base + boost).
-- base  = connects que Upwork cobra por postularse al job.
-- boost = connects extra usados para boostear la propuesta.
-- Sirve para el tablero de Stats: total de connects y plata gastada en postularse.

alter table jobs add column if not exists connects_base  integer;
alter table jobs add column if not exists connects_boost integer;

comment on column jobs.connects_base  is 'Connects base que cobra Upwork por postularse (cargado a mano al enviar).';
comment on column jobs.connects_boost is 'Connects extra usados para boostear la propuesta (cargado a mano).';
