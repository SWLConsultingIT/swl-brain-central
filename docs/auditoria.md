# Auditoría completa — Upwork Brain (SWL)

> Documento de estado a **2026-06-23**. Explica cómo funciona todo el sistema, el estado de cada pieza, el modelo de datos, los pendientes y cómo seguir.

---

## 1. Qué es

Sistema que **reemplaza el prospecting manual de Upwork** en Notion. Automatiza: buscar trabajos en Upwork → filtrarlos → guardarlos → puntuarlos → mostrarlos en una web (estilo Notion) → generar cover letters. Objetivo: que SWL solo vea los jobs que valen la pena y postularse rápido.

**Stack:** n8n (scrapers + automatización) · Supabase/Postgres (base de datos) · Next.js (web/UI, deploy en Vercel) · Anthropic (classifier) · OpenAI (auto-answer de screening).

---

## 2. Flujo end-to-end

```
[1] Scrapers n8n (4, cada 4h)
      │  buscan en Upwork con keywords por unidad de negocio
      ▼
[2] Filtros del query (Upwork filtra en el origen)
      │  pago verificado · ≥1 hire · por hora · ≤40 props · 20 países
      ▼
[3] Filtros del workflow (código n8n)
      │  idioma · ≤6 días · ubicación · precio $40 techo · agency · presencial · radicación · entrevistas · invitaciones
      ▼
[4] Supabase — tabla `jobs` (upsert con TODA la info del job + cliente)
      │  trigger calcula match_score (determinístico)
      ▼
[5] Classifier (Anthropic) → puntúa fit con las 8 unidades (classifier_score)
      ▼
[6] Web (Next.js /prospects) → vistas estilo Notion, score %, kanban
      ▼
[7] Cover letters (n8n) → se generan para los que califican
```

---

## 3. Componentes en detalle

### 3.1 Scrapers (n8n) — 4 workflows
Uno por unidad de negocio: **Financial** (Corporate Advisory), **Business** (Business Mastery), **Automation BI**, **Market**. Corren cada 4 h (cron `0 1-23/4 * * *`), tope `MAX_CALLS = 120` por corrida, `maxPage 4` (50 jobs/página). Cada uno tiene su lista de keywords en el nodo `searches`. Archivos live = los `Upwork → Supabase (X) v2-x.json` (con credenciales en n8n, NO se commitean).

### 3.2 Filtros — 14 reglas (+ scoring)
**A. En el query a Upwork (Upwork filtra):** 1) pago verificado · 2) cliente ≥1 contratación · 3) solo por hora · 4) ≤40 propuestas (Financial 30) · 5) 20 países objetivo.
**B. En código del workflow:** 6) idioma EN/ES · 7) publicado ≤6 días · 8) preferencia de freelancer fuera de LATAM → fuera · 9) tarifa <$40/h por el techo → fuera · 10) entrevistó a 5+ → fuera · 11) +10 invitaciones → fuera · 12) no quiere agencia (texto) → fuera · 13) presencial/on-site (texto) → fuera · 14) exige radicación en país extranjero (texto) → fuera.
**C. Classifier:** puntúa fit con las unidades, sin hard exclusions (decisión dirección 19/06).

### 3.3 Keywords por unidad (nodo `searches`)
184 en total: Corporate Advisory 45 · Business Mastery 40 · Automation & BI 41 · Market Acceleration 58. Alineadas a la lista del jefe (verificado 100%). Detalle en `Upwork Brain vN.xlsx` hoja "Keywords".

### 3.4 Supabase — tabla `jobs`
Tabla central. ~60 columnas. Migración `0023` agregó todo el scrape completo (cliente, actividad, ubicación, skills, etc.). Otras tablas: `business_units`, `job_decisions` (audit de cambios de estado), `proposals`, `prospects`, + views `v_brain_*`. Detalle de columnas en el Excel hoja "Modelo de datos".

### 3.5 Score (match %) — DETERMINÍSTICO, sin IA
`match_score` 0-100 = cuántas de **8 condiciones reales SUPERA** el job ÷ 8 × 100. NO premia el mínimo (el scraper ya lo garantiza), premia cuánto lo supera:
1. Tarifa ≥ $60/h · 2. Tarifa ≥ $100/h · 3. ≤5 propuestas · 4. ≤10 propuestas · 5. Cliente gastó ≥$5k · 6. Cliente con ≥5 contrataciones · 7. Rating ≥4.7 · 8. ≤2 invitaciones.
Vive en 2 lugares idénticos: UI (`app/prospects/notion-table.tsx`, calcula en vivo) y SQL (`migrations/0024`, trigger que lo guarda en la columna `match_score`). **Priority** (Alta≥70/Media≥40/Baja<40) sale del mismo score.

### 3.6 Classifier (Anthropic)
Lee cada job y devuelve `classifier_score` (fit 0-100), `classifier_area` (unidad), `classifier_reason`. SIN hard exclusions. **Importante:** el classifier_score NO es el score que ve el usuario — el score visible es el determinístico (3.5).

### 3.7 UI — Next.js (`app/prospects/`)
Web estilo Notion. Vistas (tabs): Prospectos · Prequalified · Qualified · Check Proposal · Ready to Send · Sent · Por estado (kanban). Cada vista con sus columnas. Tabla con header fijo + columna Job Title fija, tags de color, tema light premium. Lee de Supabase (`lib/jobs/list.ts`). Deploy en Vercel desde `main`.

### 3.8 Cover letters (n8n)
Workflow Brain Cover Letter (v13) genera las cartas con el Master Prompt SWL. Validator para asegurar credenciales/voz.

---

## 4. Estado de cada componente

| Componente | Estado |
|---|---|
| Scrapers + filtros (4 workflows) | 🟢 Live |
| Keywords alineadas al jefe | 🟢 Live, verificado |
| Supabase `jobs` + columnas (0023) | 🟢 Live |
| Score determinístico en la WEB | 🟢 Live (cálculo en vivo) |
| Score guardado en Supabase (0024) | 🟡 Migración escrita, **falta correr** (Supabase estuvo caído) |
| UI estilo Notion | 🟢 Live (pusheada, deploy Vercel) |
| Classifier | 🟢 Live |
| Cover letters | 🟢 Live |
| `viewed_by_client` / trabajos privados | 🔴 Pendiente (necesita token Upwork) |

---

## 5. Pendientes (priorizados)

**Para terminar el score (cuando vuelva Supabase):**
1. Correr migración `0024` (versión aditiva sin warning) → crea columna `match_score` + trigger.
2. Agregar `match_score` al SELECT de `lib/jobs/list.ts` → la web lee el guardado.
3. (Opcional) Backfill de jobs viejos (Parte B de la migración).

**Necesitan token de Upwork:**
4. `viewed_by_client` (si el cliente vio nuestra propuesta) — script `scripts/introspect-proposals.ts` listo para hallar el campo.
5. Descartar **trabajos privados** (no postulables) — mismo token.

**Diseño/UI:**
6. Refinar header/KPIs/tabs de la web al nivel Notion.

**Negocio (más adelante):**
7. Reglas nuevas del classifier que iba a dar el jefe (HARD_EXCLUSIONS).
8. Entrenar el brain con postulaciones pasadas (RAG con cover letters ganadoras — tablas `proposals`/`prospects`).

**Robustez (opcional):**
9. Escalonar los 4 schedules + retry ante error 429 de Upwork.

---

## 6. Riesgos / deuda técnica

- **Supabase Free se PAUSA** tras ~7 días de inactividad → corta la operación automática. Evaluar plan que no pause o keep-alive.
- **Acceso a Supabase** es de la cuenta del jefe; Priscilla no siempre tiene acceso al dashboard (la web igual lee porque usa el data API con su key).
- **Credenciales en los workflows n8n** → esos JSON NUNCA se commitean (incidentes previos de leak). Los archivos del repo son código limpio.
- **Score en 2 lugares** (UI + SQL): si se cambian los criterios, hay que tocar los dos (documentado en el Excel hoja "Score").
- **Versiones del Excel** (`Configuracion`/`v2`/`v3`) por el caché de Excel — la última vN es la buena.

---

## 7. Cómo seguir (sugerido)
1. Volver Supabase → correr 0024 + conectar SELECT (cierra el score, 5 min).
2. Conseguir token Upwork → resolver privados + viewed_by_client.
3. Pulir header/KPIs de la UI.
4. Reglas del classifier del jefe.
5. RAG con postulaciones pasadas.
