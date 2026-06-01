# Auditoría n8n — Brain Central

**Propósito:** entender qué hace cada workflow vivo en n8n antes de portar la lógica al brain. Sin esto, terminamos reinventando reglas que ya funcionan o pisando criterios que el equipo aplica todos los días.

**Alcance:** los 12 JSON en `JSON /`. Las versiones "Sin credencial" son copias sanitizadas — se auditan junto con sus originales.

**Cómo leer cada sección:**
- **Rol** — para qué sirve en la fábrica de prospecting.
- **Trigger** — cómo arranca.
- **Input** — qué lee y de dónde.
- **Pipeline** — pasos numerados, con la regla exacta.
- **LLM** — modelo, system prompt, tools, output schema.
- **Outputs** — dónde escribe y qué.
- **Observaciones** — gaps vs. MVP deseado, discrepancias, qué hay que portar.

---

## 1. Prospect Automation - Agent Block

**Archivo:** `JSON /Prospect Automation - Agent Block.json`
**Nodes:** 24
**Rol:** 🧠 **Classifier.** Decide si un prospect pasa a `Qualified ✅` o `Discarded 💀`. Es el corazón del filtrado actual.

### Trigger
- `Schedule Trigger` — todos los días **8am** (cron `0 8 * * *`).

### Input
- HTTP POST a Notion API → DB `249d4ea8d5a68071ae52d25f0bd5a233` (la DB CRM de SWL en Notion).
- Filtra páginas **creadas en los últimos 7 días** (`Date.now() - 604800000` ms = 7d).
- Toma hasta 100 por corrida.
- Después filtra in-memory solo las que tienen `Status` que contenga "prospect" (case-insensitive).

> ⚠️ **Gap #1:** el filtro de entrada es **7 días**, no 24h. El MVP deseado dice "publicado < 24h".

### Pipeline

**Paso 1 — Parsing** (`Parsear Datos`, node JS):
- Extrae `pageId`, `title` (de `Job Tittle` o `Job Title` o `Name`), `description`.
- Parsea `Ticket` con regex: soporta rangos `$40-$60` (toma el máximo) o valor único `$50`.
- Computa `ticketMax` (número) y `ticketPasses = ticketMax >= 40`.

**Paso 2 — Filtro Ticket** (`¿Ticket >= $40?`, node IF):
- Si `ticketPasses === true` → continúa al LLM.
- Si no → patch Notion status a `Discarded 💀` + append a Sheet "Discarded".

> ✅ **Threshold confirmado:** **$40 USD** (código). El sticky note dice "$50" pero está desactualizado — el valor real que aplica SWL es **$40 USD**, confirmado por el equipo 2026-06-01.
>
> ⚠️ **Gap de currency:** el código actual solo hace regex del número (`/\$?\s*([\d.]+)/`), **no valida que la moneda sea USD**. Si Upwork devuelve `€40` o `£40` el job se cuela como si fuera $40 USD. Al portar al brain, validar currency = USD explícitamente.

**Paso 3 — Clasificación LLM** (`AI Agent` + `OpenAI Chat Model` + tools):
- (ver sección LLM abajo)

**Paso 4 — Mapear salida** (`Mapear Salida`, node JS):
- Transforma output del agente a: `{pageId, title, ticketMax, aiMatch, aiReason, aiArea}`.

**Paso 5 — Filtro AI Match** (`¿Matchea con servicios SWL?`, node IF):
- Si `aiMatch === true` → patch Notion status a `Qualified ✅` + append a Sheet "Qualified" (con `Business Unit`).
- Si no → patch Notion status a `Discarded 💀` + append a Sheet "Discarded" (sin Business Unit).

### LLM

**Modelo:** `gpt-4o-mini`

**System prompt** (verbatim, lo importante):
> "You are a senior qualification analyst for SWL Consulting, an AI-native consulting firm.
> Your job: decide if an incoming Upwork prospect is a MATCH for SWL.
> You have TWO tools: (1) `swl_services_kb`, (2) `historical_sent_jobs`.
> Decision protocol: (1) read job, (2) query KB to confirm scope, (3) query historical to find precedent (quote 1-2 examples), (4) decide match=true ONLY if BOTH services KB confirms scope AND there's justifiable precedent, (5) identify area.
> HARD EXCLUSIONS (always match=false): pure graphic design only, physical manufacturing, legal services, medical services, academic writing, civil/mechanical/electrical engineering.
> Return ONLY structured JSON. `reason` ≤ 25 words."

**User prompt** (template):
> "Evaluate this Upwork job for SWL Consulting. Job Title: {{title}}. Ticket Max: ${{ticketMax}}. Job Description: {{description}}"

**Tools que tiene el agente:**

1. **`swl_services_kb`** (`toolCode`, JS hardcoded)
   - Devuelve un string gigante con las **8 áreas SWL** + sus tools + keywords + hard exclusions.
   - Las 8 áreas: Corporate Advisory & Finance / Business Operations & Back-Office / Project Management & BI / Sales & Customer Success / Marketing & Brand / AI & Automation / System Integrations & Automations / Digital Experience & Product Dev.
   - **Esto es lo que las BU cards de Supabase reemplazan** — pero con una diferencia: el catálogo JS tiene "Tools" como sección separada por área, las BU cards mergean tools dentro de `keywords`.

2. **`historical_sent_jobs`** (`googleSheetsTool`)
   - Lee Google Sheet `1k-VoL8pshVVR65a-CKBTaEmnyJs7q7u8hN4k-hSleFw`.
   - Devuelve jobs a los que SWL aplicó realmente en los últimos 60 días.
   - **En el brain esto se reemplaza con un query a `proposals` filtrando `status='Sent' AND sent_date >= now() - 60d`.**

**Output schema (Structured Output Parser):**
```json
{
  "match": true,
  "reason": "Brief justification referencing scope + precedent, max 25 words",
  "area": "Corporate Advisory & Finance"
}
```

> ⚠️ **Gap #2:** output es **binario** (`match: true/false`). El MVP deseado dice "scoring no binary, 0-100 o ranking". Hay que extender el output schema con un score numérico.

### Outputs

1. **Notion CRM** — PATCH a la página: `Status` → `Qualified ✅` o `Discarded 💀`.

2. **Google Sheet** `1BcHol6YqhsSf8bkybdTSn1IgyTCez1uaIytutBouot0` ("Prospects automation"):
   - Tab **Qualified** (gid=0): columnas `Job Title | Ticket Max | Reason | Business Unit | Description`.
   - Tab **Discarded** (gid=1581129852): columnas `Job Title | Ticket Max | Reason | Description` (sin Business Unit).

### Observaciones

| # | Tema | Estado actual | Gap / acción al portar |
|---|---|---|---|
| 1 | Ventana temporal | Últimos **7 días** | MVP: **24h**. Cambiar en el query inicial. |
| 2 | Threshold ticket | `≥ $40 USD` (confirmado 2026-06-01) | Portar el valor. **Además: validar `currency === 'USD'`** — el código actual no lo hace y un €40 se colaría. |
| 3 | Output | Binario `match: true/false` | Extender a **score 0-100**. |
| 4 | KB de servicios | Hardcoded en JS dentro del workflow | Ya migrado: **`business_units` en Supabase** (8 BU cards). Verificar que se preservaron todas las tools del JS (Fathom, ServiceTitan, Xfin, etc.). |
| 5 | Historical precedente | Google Sheet (60 días) | Query a `proposals` (ya está migrado, 12,402 filas). |
| 6 | Datos que NO ve el agente | Job description y title y ticket. **No ve:** post_date, location, proposals_count | Agregar al user prompt — son dimensiones que el MVP quiere evaluar. |
| 7 | Hard exclusions | En el system prompt | Mantener en system prompt al portar, o moverlas a una BU "exclusions" / config. |
| 8 | Mensaje del agente | "Quote 1-2 examples in your reason" | Útil — el reason hoy es trazable. Mantener al portar. |

### Qué portar al brain (resumen accionable)

- **Reemplazos directos:**
  - `swl_services_kb` (toolCode) → query a tabla `business_units`.
  - `historical_sent_jobs` (Sheets) → query a tabla `proposals` filtrando Sent + 60d.
  - Notion PATCH → update en tabla `jobs` (a crear).
  - Sheets append → opcional, log de decisiones en tabla `decisions` (a crear).

- **Mejoras a hacer al portar:**
  - Ventana de input 24h.
  - Output con score numérico.
  - Pasar más dimensiones al prompt (post_date, location, proposals_count).
  - Confirmar threshold ticket real.

---

## 2. Notion Cover Letter

**Archivo:** `JSON /Notion Cover Letter.json`
**Nodes:** 17
**Rol:** ✍️ **Cover letter generator.** Recibe el `pageId` de un job ya qualified, levanta sus datos de Notion, llama un agente LLM con 4 tools de RAG (Pinecone via MCP), y escribe la cover letter de vuelta en Notion en la DB "Cover Letters".

### Trigger
- `Webhook` POST a path `737ee98d-aecd-485d-bbfb-0ff1d0b8af8c`.
- Payload esperado: `{ body: { data: { id: "<notion_page_id>" } } }`.
- **Quién lo dispara hoy:** otro workflow / botón / acción manual desde Notion. Hay que confirmar el origen.

### Input
1. `Get a database page` (Notion) — fetch de la page (job CRM) con sus properties: `description`, `name`, `country`, `city_region`, `duration`, `english_level`, `talent_type`, `ticket`, `hourly_average`, `guideline_and_focus`, `industry`, `services`, `universe`.
2. `Get many child blocks1` + `Code1` — lee los bloques hijo de la page (la descripción completa del job, paragraph por paragraph) y los concatena en un string.
3. `Get a document` (Google Docs) — lee el doc `1cARxVfbdGtv22sKzbldjXYGP74satITdanIFAAVFOp0` → **es la plantilla / system prompt base de la cover letter** (la "voz" SWL).
4. `Switch` — bifurca según si la descripción tiene 1 o más bloques (camino con/sin chunks).
5. `Create a database page` (Notion) — crea la page destino en DB **Cover Letters** (`249d4ea8-d5a6-8038-bd1d-ebbe358ac041`), linkeada al CRM via relation "💵 CRM de ventas".

### Pipeline (camino principal — descripción con múltiples bloques)

**Paso 1** — Webhook recibe `pageId` → `Get a database page` levanta job properties → `Get many child blocks1` + `Code1` concatenan descripción.

**Paso 2** — `Get a document` levanta el Google Doc (template + voz).

**Paso 3** — `Create a database page` crea page vacía en DB Cover Letters con status "Not started".

**Paso 4** — `AI Agent` corre el LLM (ver sección LLM abajo).

**Paso 5** — `Code` chunkea el output del agente en pedazos ≤1000 chars (límite de Notion API para text blocks).

**Paso 6** — `Loop Over Items` + `Append a block` agrega cada chunk como bloque a la page Cover Letter.

### LLM

**Modelo:** `gpt-5-mini` (más nuevo que el del classifier — gpt-4o-mini).

**System prompt** (compuesto dinámicamente):
- Parte 1: contenido del Google Doc (`{{ $json.content }}`) → **la voz, estilo, estructura de la cover letter SWL vive en ese doc**.
- Parte 2 (verbatim, fijo en el workflow):
  > "### Prerequisites: el user va a pasar JOB POST, JOB FULL DESCRIPTION, Specific Comments, Industry Tags, Services, Universe.
  > ### Available Tools (MCP over Pinecone):
  > 1. `Read_CV` — busca en CV/biografía embebida snippets relevantes para el job (industria, tech, scope, métricas).
  > 2. `Read_Services` — descripciones de servicios que matchean. Elegir 2-4 que mejor encajen, no listar todos.
  > 3. `Read_Trends` — notas de tendencias de industria para reforzar el approach. Máximo 1-2 líneas.
  > 4. `Read_Universe` — framework interno de scope/tono/deliverables por universe.
  > ### Working Procedure: retrieve via Read_CV + Read_Services + Read_Trends → componer en Markdown → devolver SOLO el texto final.
  > Si no hay industryTags, no usar Read_Trends. Usar Universe input para Read_Universe."

**User prompt** (template):
> JOB POST + JOB FULL DESCRIPTION + Name + Country + City/Region + Duration + English Level + Talent Type + Ticket + Hourly Average + Guideline and Focus + Industry + Services + Universe.
> "Please draft a tailored Upwork proposal for the opportunity below."

**Tools (via MCP):**
- Endpoint: `https://n8n.srv949269.hstgr.cloud/mcp/48cf84f5-a4f1-4505-a6d5-86f087d69e5b` (servidor MCP montado en su propia instancia n8n — es el workflow `MCP - Upwork.json` que audito en sección 3).
- Backend: **Pinecone vector store**.
- 4 tools: `Read_CV`, `Read_Services`, `Read_Trends`, `Read_Universe`.

**Output:** texto Markdown (la cover letter completa) en `$json.output`.

### Outputs

- **Notion DB "Cover Letters"** (`249d4ea8-d5a6-8038-bd1d-ebbe358ac041`):
  - Page nueva creada con título `Cover Letter: {job name}`, status "Not started".
  - Linkeada al job CRM via relation "💵 CRM de ventas".
  - El cuerpo de la cover letter aparece como bloques de texto (chunkeados a ≤1000 chars).

### Observaciones

| # | Tema | Estado actual | Gap / acción al portar |
|---|---|---|---|
| 1 | Datos del job que se pasan al LLM | 13 fields: description, name, country, city_region, duration, english_level, talent_type, ticket, hourly_average, guideline_and_focus, industry, services, universe | Schema `jobs` del brain tiene que tener TODOS estos campos (varios todavía no están). Confirmar cuáles vienen del scraper y cuáles los agrega el clasificador. |
| 2 | Voz / estilo / estructura de la cover letter | Vive en **Google Doc** externo (`1cARxVfbdGtv22sKzbldjXYGP74satITdanIFAAVFOp0`) | Frágil. Al portar: leer el doc, bakear el template como string en código del brain (o tabla `templates` en Supabase). |
| 3 | RAG actual | Pinecone con 4 tools (CV, Services, Trends, Universe) via MCP | **Cambio importante**: en el brain, `Read_Services` → query a `business_units` (ya estructurado). Pero `Read_CV`, `Read_Trends`, `Read_Universe` **NO existen todavía en Supabase**. Hay que decidir cómo migrar cada uno. |
| 4 | "Universe" como concepto | Field en Notion + tool `Read_Universe` en MCP | **Concepto nuevo no mapeado a BU cards.** Confirmar con equipo: ¿qué es "universe" y cómo se relaciona con las 8 BUs? |
| 5 | Modelo | `gpt-5-mini` | El classifier usa `gpt-4o-mini`. Decidir qué modelo usar en cada parte del brain. |
| 6 | Dependencia externa | Google Doc + Pinecone + n8n MCP endpoint | Eliminar todas al portar — el brain debe ser self-contained. |
| 7 | Dos AI Agents idénticos | `AI Agent` y `AI Agent1` tienen el MISMO system prompt y user prompt | Parece refactoring leftover. Una sola implementación en el brain. |
| 8 | Output chunking ≤1000 chars | Por límite de Notion blocks | No aplica al brain. La cover letter se guarda como text completo en `jobs.cover_letter_draft` o tabla `cover_letters`. |

### Qué portar al brain (resumen accionable)

- **Reemplazos directos:**
  - Webhook trigger → endpoint API en el brain (`POST /api/cover-letter/generate?jobId=X`).
  - `Get a database page` (Notion) → query a tabla `jobs` en Supabase.
  - `Get a document` (Google Doc) → template versionado en código del brain o tabla `templates`.
  - `Read_Services` (Pinecone) → query a `business_units`.
  - `Create page` + `Append blocks` (Notion) → INSERT en tabla `cover_letters` (o columna `jobs.cover_letter_draft`).

- **Decisiones que necesitan al equipo:**
  - Qué es "Universe" y cómo se relaciona con las BU cards.
  - Cómo migrar `Read_CV` y `Read_Trends` — ¿son contenido estático que va en código? ¿O tienen que seguir siendo vectoriales en Supabase (pgvector)?
  - Confirmar el list de fields del job que el generator espera.

---

## 3. MCP - Upwork

*(pendiente)*

---

## 4. Upwork Scrapper (Business Page 1 & 2) — representativo de los 4 scrapers

*(pendiente)*

---

## 5. Upwork Scrapper Business Sere — representativo de los 5 Sere

*(pendiente)*
