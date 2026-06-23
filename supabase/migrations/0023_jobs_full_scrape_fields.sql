-- ─────────────────────────────────────────────────────────────────
-- 0023 — jobs: guardar TODA la info scrapeada de Upwork
--
-- Hoy el scraper trae muchos campos (en Code1) que NO se persistían.
-- Esta migración agrega columnas para todo lo útil, de modo que la UI
-- nueva pueda mostrarlas (vistas Prospect / Check Proposal).
-- Mapeo campo Upwork (Code1) → columna documentado en el comment.
-- ─────────────────────────────────────────────────────────────────

alter table jobs
  -- match / búsqueda
  add column if not exists matched_keyword               text,        -- term (la keyword que matcheó)

  -- ubicación preferida del freelancer (lo que pide el cliente)
  add column if not exists preferred_location            jsonb,       -- preferredFreelancerLocation (array)
  add column if not exists preferred_location_mandatory  boolean,     -- preferredFreelancerLocationMandatory

  -- detalle del job
  add column if not exists experience_level              text,        -- experienceLevel (ENTRY/INTERMEDIATE/EXPERT)
  add column if not exists engagement                    text,        -- engagement (ej. "Less than 30 hrs/week")
  add column if not exists weekly_budget                 numeric,     -- weeklyBudget.rawValue
  add column if not exists duration_label                text,        -- durationLabel ("More than 6 months")
  add column if not exists freelancers_to_hire           integer,     -- freelancersToHire
  add column if not exists skills                        jsonb,       -- skills (array de nombres)
  add column if not exists subcategory                   text,        -- subcategory
  add column if not exists is_premium                    boolean,     -- premium
  add column if not exists is_enterprise                 boolean,     -- enterprise

  -- cliente
  add column if not exists client_total_hires            integer,     -- clientTotalHires
  add column if not exists client_total_posted_jobs      integer,     -- clientTotalPostedJobs
  add column if not exists client_total_spent            numeric,     -- clientTotalSpent.rawValue
  add column if not exists client_verification           text,        -- clientVerification (pago verificado)
  add column if not exists client_total_reviews          integer,     -- clientTotalReviews
  add column if not exists client_rating                 numeric,     -- clientTotalFeedback (rating 0-5)
  add column if not exists client_member_since           timestamptz, -- clientMemberSinceDateTime
  add column if not exists client_company_name           text,        -- clientCompanyName
  add column if not exists client_state                  text,        -- clientState
  add column if not exists client_timezone               text,        -- clientTimezone

  -- actividad del job
  add column if not exists total_applicants              integer,     -- totalApplicants
  add column if not exists invites_sent                  integer,     -- invitesSent
  add column if not exists interviewing                  integer,     -- totalInvitedToInterview
  add column if not exists total_hired                   integer,     -- totalHired (en este job)
  add column if not exists unanswered_invites            integer,     -- totalUnansweredInvites
  add column if not exists total_offered                 integer,     -- totalOffered
  add column if not exists last_client_activity          timestamptz, -- lastClientActivity

  -- PENDIENTE: dato a nivel propuesta, NO viene en el scrape del job.
  -- Requiere scrapear las propuestas propias (otro endpoint). Columna lista para cuando se implemente.
  add column if not exists viewed_by_client              boolean,

  -- timestamps adicionales del job
  add column if not exists published_date                timestamptz, -- publishedDateTime
  add column if not exists renewed_date                  timestamptz, -- renewedDateTime

  -- catch-all: nodo crudo completo, por si falta algún campo a futuro
  add column if not exists raw_data                      jsonb;       -- node completo (_raw)

comment on column jobs.matched_keyword     is 'La keyword de búsqueda (term) que trajo este job.';
comment on column jobs.preferred_location  is 'Ubicación de freelancer que pide el cliente (array). Se muestra en la UI.';
comment on column jobs.client_verification is 'Estado de verificación de pago del cliente (VERIFIED, etc.).';
comment on column jobs.viewed_by_client    is 'PENDIENTE: si el cliente vio NUESTRA propuesta. Dato a nivel proposal, requiere scrapear propuestas propias.';
comment on column jobs.raw_data            is 'Nodo crudo completo de Upwork, por si se necesita un campo no columnizado.';

-- Índices útiles para la UI nueva
create index if not exists jobs_invites_sent_idx    on jobs (invites_sent);
create index if not exists jobs_total_applicants_idx on jobs (total_applicants);
