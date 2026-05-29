# Brain Central — Supabase Setup

Carpeta con el schema y seeds para arrancar Brain Central en Supabase.

## Archivos

- `schema.sql` — CREATE TABLE de las 3 tablas core (`business_units`, `proposals`, `prospects`) + índices + triggers de `updated_at`.
- `seeds/business_units.sql` — 8 BU cards con template de 7 secciones, seedeadas desde el PDF SWL Consulting + ejemplo Finance & Accounting del usuario. Idempotente (`ON CONFLICT DO UPDATE`).
- `migrations/` — futuras alteraciones de schema irán acá, numeradas.

## Setup por primera vez

### Step 1 — Crear el proyecto

1. Ir a [supabase.com](https://supabase.com) y crear cuenta si no tenés.
2. Click `New Project`:
   - Nombre: `swl-brain-central` (o el que prefieras)
   - Region: la más cercana a vos (e.g. `us-east-1`)
   - Password: generá uno fuerte y guardalo en 1Password/Bitwarden
   - Plan: **Free** (alcanza para empezar — 500MB DB, 50k auth users)
3. Esperás ~2 min mientras Supabase provisiona la instancia.

### Step 2 — Correr el schema

1. Dentro del proyecto: sidebar → `SQL Editor` → `New query`.
2. Abrí `schema.sql` localmente, copiar todo el contenido, pegar en el editor.
3. Click `Run` (o `Cmd+Enter`).
4. Verificá: sidebar → `Table Editor` → deberías ver 3 tablas: `business_units`, `proposals`, `prospects`.

### Step 3 — Correr los seeds

1. SQL Editor → `New query`.
2. Pegar el contenido de `seeds/business_units.sql`.
3. Run.
4. Verificá: Table Editor → `business_units` → deberían aparecer 8 filas, una por BU.

### Step 4 — Pasarme las credenciales

Necesito 2 cosas del proyecto:

1. **Project URL**: sidebar → `Project Settings` → `API` → copiar `Project URL` (algo como `https://xxxxx.supabase.co`).
2. **Anon key**: misma pantalla → copiar `anon` `public` key.

Con eso puedo:
- Conectar n8n a Supabase para reroutear los workflows.
- Conectar el futuro Next.js admin.
- Validar los seeds desde aquí.

> **Importante:** la **service_role key** NO me la pases por chat. Esa va en variables de entorno encriptadas cuando armemos n8n/Next.js.

## Estructura de las tablas

```
business_units          proposals                    prospects
─────────────────       ────────────────────         ────────────────────
  id                    id                           id
  name (unique)         upwork_id (unique)           upwork_id (unique)
  description           job_title                    job_title
  scopes []             description                  description
  keywords []           ai_summary                   ai_summary
  tools []              cover_letter                 ticket
  good_fit_signals      ticket                       ticket_passes
  red_flags             keyword                      keyword
  decision_logic        status                       status (pipeline)
  is_active             business_unit_id ──┐         business_unit_id ──┐
  created_at            sent_date          │         ai_match           │
  updated_at            link               │         ai_reason          │
                        tools []           │         ai_area            │
                        raw_data           │         link               │
                        ...                │         notion_page_id     │
                                           │         raw_data           │
                                           └─→ business_units.id ←──────┘
```

## Las 8 BU cards seedeadas

1. **Finance & Accounting** — CFO, FP&A, bookkeeping, ERP/accounting
2. **Business Operations & Back-Office** — payroll, HR, SOPs, ERP implementation
3. **Project Management & BI** — PM, dashboards, data analytics, Power BI
4. **Sales & Customer Success** — CRM, lead gen, outreach, GTM
5. **Marketing & Brand** — social media, content, paid ads, SEO
6. **AI & Automation** — LLMs, agents, RAG, n8n, prompt engineering
7. **System Integrations** — n8n, Zapier, APIs, data pipelines
8. **Digital Experience & Product Development** — web dev, e-commerce, app dev, UX/UI

Cada una tiene el template de 7 secciones: `name`, `description`, `scopes[]`, `keywords[]`, `tools[]`, `good_fit_signals`, `red_flags`, `decision_logic`.

## Próximas fases (referencia)

- **Fase 1**: migrar CRM Notion (CSVs) y las 1200 propuestas Sent → `proposals` / `prospects`.
- **Fase 2**: workflow n8n curador que enriquece `business_units` desde `proposals` históricas.
- **Fase 3**: UI Next.js custom (Kanban pipeline + editor BU cards + dashboard).
- **Fase 4**: reroute ingestion Upwork y workflow `Prospect Automation` para que vivan en Supabase.
- **Fase 5**: validación en paralelo + apagado de Notion.
