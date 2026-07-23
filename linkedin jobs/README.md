# LinkedIn Jobs CRM — Handoff / Runbook

CRM de jobs de **LinkedIn** (foco: **1099 / Contract en USA**), espejo del CRM de Upwork.
Scrapea LinkedIn → clasifica contra las 8 Business Units → genera una nota de aplicación (pitch) →
board estilo **Check Proposal** en `/linkedin`.

> Rama de trabajo: **`Fran`**. No mergear a `main` sin OK de Fran.
> Todo esto es **paralelo** a Upwork: tabla, workflows y página separados. No toca nada de Upwork.

---

## ⚠️ Antes de empezar — 2 cosas críticas

1. **Dos Supabase distintos.** Este CRM usa el proyecto del **brain de jobs**:
   `uaefxpewxmvmhxpgehuv.supabase.co` (el mismo que Upwork). NO confundir con el CRM de leads/outbound
   (`uljoengwmmwdqpcxnbjs`), que es otra cosa.
2. **API key de n8n:** si Fran compartió una key para leer/crear workflows, **rotarla** cuando termines
   (n8n → Settings → API). Nunca la subas al repo.

---

## Estado actual (qué está hecho / qué falta)

| Parte | Archivo / lugar | Estado |
|---|---|---|
| **DB**: tabla + audit + RPC | `db/0033_linkedin_jobs.sql` (= `supabase/migrations/0033_...`) | ✅ escrito · ⏳ **falta CORRERLO** |
| **n8n scraper** | ya CREADO en n8n (inactivo) — id `ocKyRwypbRUhNueW` | ✅ creado + credenciales · ⏳ mover a `Linkedn` + activar |
| **n8n classifier** | ya CREADO en n8n (inactivo) — id `pkH5uAneF1lbHwCG` | ✅ creado + credenciales · ⏳ mover a `Linkedn` + activar |
| **n8n cover-letter (pitch)** | ya CREADO en n8n (inactivo) — id `xwBwitRugAHbLT7Y` | ✅ creado + credenciales · ⏳ mover a `Linkedn` + activar |
| **App page** `/linkedin` | `app/linkedin/*`, `lib/linkedin/list.ts`, `app/api/linkedin/[id]/*` | ✅ código listo (compila) · ⏳ probar contra la DB |
| **Nav** desde `/prospects` | link "LinkedIn" agregado | ✅ |

---

## PASO 1 — Base de datos (correr la migración)

**Dónde:** Supabase → proyecto `uaefxpewxmvmhxpgehuv` → **SQL Editor**.
**Qué:** pegá TODO el contenido de [`db/0033_linkedin_jobs.sql`](db/0033_linkedin_jobs.sql) → **Run**.

Crea:
- `linkedin_jobs` — tabla central (dedup por `linkedin_id`, misma máquina de estados que `jobs`,
  + columnas LinkedIn: `company_name`, `employment_type`, `workplace_type`, `seniority`, `applicants_count`, etc.)
- `linkedin_job_decisions` — audit trail.
- `linkedin_jobs_allowed_transitions` + `brain_transition_linkedin_job()` — RPC canónico de transición.
- trigger de audit `linkedin_jobs_audit_status_change`.

**Verificar:**
```sql
select count(*) from linkedin_jobs;                 -- 0, sin error
select * from linkedin_jobs_allowed_transitions;    -- ~20 filas (incluye new→qualified)
```

> La REST API de Supabase (la que usa la app) NO puede correr DDL — por eso va por el SQL Editor.

---

## PASO 2 — n8n (los 3 workflows YA están creados)

Los 3 workflows **ya fueron creados en n8n vía API, INACTIVOS y con las credenciales reales ya cargadas**
(Supabase + Anthropic, copiadas del `Brain Classifier` que ya funciona). Solo falta:

1. **Moverlos a la carpeta `Linkedn`** (`UPWORK APP / Linkedn`). La API pública de n8n no maneja carpetas,
   así que aparecen en la raíz del proyecto — arrastralos a `Linkedn` desde la UI (2 segundos c/u):
   - `LinkedIn → Supabase (Scraper)` — id `ocKyRwypbRUhNueW`
   - `LinkedIn Classifier` — id `pkH5uAneF1lbHwCG`
   - `LinkedIn Application Note` — id `xwBwitRugAHbLT7Y`
2. **Activarlos** (toggle `active`) recién DESPUÉS de correr la migración (PASO 1) y de una prueba manual.

> Los `.json` de esta carpeta (`n8n/*.json`) son la **copia versionada sin credenciales** (por si hay que
> re-importar o revisar en git). Los que están vivos en n8n ya tienen las keys.

### 2.1 `linkedin-scraper.json` → **LinkedIn → Supabase (Scraper)**
- **Qué hace:** cada 4h pega al guest API de LinkedIn (sin login), parsea las job cards + el detalle
  (descripción, employment type, seniority), filtra a **Contract/Freelance + USA**, y hace
  `upsert` a `linkedin_jobs` (dedup por `linkedin_id`, **no pisa el status** de jobs ya avanzados).
- **Editar el nodo `Config`:** el array `searches` = keywords por Business Unit + contractor.
  (arranca con un set de ejemplo: `1099 contractor`, `fractional CFO`, `Power BI contractor`, etc.)
- **Rate limit:** los HTTP nodes tienen batching (1 request cada 2.5s). Si LinkedIn tira **429**,
  bajá la frecuencia / cantidad de keywords, o meté un proxy (ver PASO 5).
- **Credenciales:** solo la Supabase key (headers del nodo `Supabase Upsert linkedin_jobs`).

### 2.2 `linkedin-classifier.json` → **LinkedIn Classifier**
- **Qué hace:** cada 4h lee `linkedin_jobs?status=eq.new`, clasifica con Claude Haiku contra las BU
  (mismo prompt que Upwork, sin el bloque "UPWORK CONTEXT"), y transiciona `new → qualified | discarded`
  vía `brain_transition_linkedin_job`.
- **Credenciales:** Supabase key (3 nodos HTTP) + Anthropic key (nodo `Anthropic Classifier`).

### 2.3 `linkedin-cover-letter.json` → **LinkedIn Application Note** (opcional)
- **Qué hace:** webhook `linkedin-cover-letter` → arma el pitch con Claude Sonnet (prompt adaptado a
  LinkedIn, NO menciona Upwork/connects) → `qualified → proposal_drafted` guardando `cover_letter_draft`.
- **Credenciales:** Supabase key + Anthropic key.

> **Activar (`active`)** cada workflow desde la UI cuando esté probado. Vienen en `active: false`.

---

## PASO 3 — Orquestación (cómo se encadenan)

Diseño elegido (el más simple, sin webhooks de DB):

```
scraper (upsert, status=new)
   → LinkedIn Classifier (schedule)      new → qualified | discarded
       → nota de aplicación:  o bien
           (a) botón "Generar nota" en la app  (POST /api/linkedin/[id]/cover-letter), o
           (b) el webhook LinkedIn Application Note  (POST .../webhook/linkedin-cover-letter { job_id })
       → qualified → proposal_drafted  → aparece en "Check Proposal"
   → humano revisa, "Marcar enviado" → sent
```

- El scraper inserta `new` y **no** pisa el status al re-scrapear (el `upsert` no manda `status`).
- Para automatizar el pitch sin intervención: agregá al final del **classifier** un nodo HTTP que
  llame al webhook `linkedin-cover-letter` con `{ job_id }` para los que quedaron `qualified`
  (equivalente al webhook de DB que usa Upwork). Para el MVP alcanza con el botón de la app.

---

## PASO 4 — App (`/linkedin`)

Ya está el código (compila con `tsc`). Archivos:
- `lib/linkedin/list.ts` — data layer (`listLinkedInJobs`, tipo `LinkedInJobRow`).
- `app/linkedin/page.tsx` — página (server).
- `app/linkedin/board.tsx` — board client: tabs (Check Proposal / Qualified / Nuevos / Sent / Para Chequear /
  Discarded / Todos), búsqueda, filtro por BU, y botones de acción por fila.
- `app/api/linkedin/[id]/*` — rutas: `classify`, `cover-letter`, `mark-ready`, `mark-sent`, `to-review`,
  `discard`, `notes`, `update-cover-letter`. Reusan `llmClassify` y `generateCoverLetter` y transicionan
  con `brain_transition_linkedin_job`.

**Correr local:**
```bash
npx pnpm@10 install      # si hace falta
npx pnpm@10 dev
# abrir http://localhost:3000/linkedin  (pide login: APP_USER / APP_PASSWORD)
```
**Env vars** (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`,
`APP_USER`, `APP_PASSWORD`, `AUTH_SECRET`. (Mismas que Upwork.)

**Deploy:** Vercel, igual que hoy. `/linkedin` queda protegido por el mismo middleware de login.

---

## PASO 5 — Robustez (después del MVP)

- **429 de LinkedIn:** subir el `batchInterval`, rotar `User-Agent`, o meter un proxy (poner la URL del
  proxy en el nodo HTTP). LinkedIn corta a ~10 páginas por IP.
- **Escalonar schedules** para no pegarle a LinkedIn y a Anthropic al mismo tiempo.
- **Expirar stale jobs** (equivalente a la migración 0028 de Upwork) si querés limpiar `new` viejos.

---

## Verificación end-to-end (checklist)

- [ ] **DB:** correr `0033`; `select count(*) from linkedin_jobs;` sin error.
- [ ] **Scraper:** ejecutar el workflow a mano → aparecen filas en `linkedin_jobs` (status `new`), sin duplicados.
- [ ] **Classifier:** ejecutar → los `new` pasan a `qualified` (con `business_unit_id` y `classifier_score`) o `discarded`.
- [ ] **Pitch:** en `/linkedin` tab **Qualified**, botón "Generar nota" → pasa a **Check Proposal** con la nota.
- [ ] **App:** en Check Proposal, "A chequear" / "Marcar enviado" / ✕ cambian el estado y refrescan.
- [ ] **Regresión:** `/prospects` (Upwork) sigue igual.

---

## Mapa de archivos (en el repo, rama `Fran`)

```
supabase/migrations/0033_linkedin_jobs.sql      # DB (fuente de verdad)
linkedin jobs/
  README.md                                      # este runbook
  db/0033_linkedin_jobs.sql                       # copia para importar rápido
  n8n/linkedin-scraper.json                        # importar a n8n (carpeta Linkedn)
  n8n/linkedin-classifier.json
  n8n/linkedin-cover-letter.json
lib/linkedin/list.ts                             # data layer
app/linkedin/page.tsx , board.tsx                # UI
app/api/linkedin/[id]/*                          # rutas de acción
```

## Decisiones de diseño (por si preguntan)
- **Tabla separada** (no columna `source` en `jobs`): no ensucia el scoring/stats Upwork-específicos.
- **LinkedIn no tiene "1099" como filtro** → se filtra por Employment type = Contract/Freelance + geoId USA
  + keywords. El scraper aplica ese filtro; el classifier ya no ve full-time.
- **Sin prefilter de ticket** (Upwork filtra ≥$40/h; LinkedIn no) → el classifier va directo `new → qualified`.
- **Pitch reusa** el generador de cover letter (mismas BU + precedentes de `proposals`), con prompt LinkedIn.
