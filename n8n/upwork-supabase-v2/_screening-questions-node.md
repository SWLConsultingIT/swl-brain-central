# Sumar screening questions al scraper Upwork → Supabase

Este documento explica cómo agregar 1 nodo HTTP Request al workflow n8n para que cada job nuevo traiga sus screening questions junto al resto del scraping.

## Contexto

Las screening questions oficiales de Upwork (`MarketplaceJobPosting.contractorSelection.proposalRequirement.screeningQuestions`) **no vienen** en `marketplaceJobPostingsSearch`. Hay que hacer 1 query separado por job, usando el `id` numérico.

## Cambio: agregar 1 HTTP Request node

### Ubicación

Después del nodo **"Edit Fields"** (donde se mapean los campos del job) y **antes** del nodo **"Supabase Upsert"**. Para todos los 4 workflows scrapers: `automation-bi.json`, `business.json`, `financial.json`, `market.json`.

### Configuración del nodo

- **Name:** `Screening Questions`
- **Method:** `POST`
- **URL:** `https://api.upwork.com/graphql`
- **Authentication:** misma credencial OAuth2 que usa el nodo `upwork` (Bearer header via `Edit Fields2.api`)
- **Send Headers:** ✅
  - `Authorization`: `={{ $('Edit Fields2').item.json.api }}`
  - `Content-Type`: `application/json`
- **Send Body:** ✅ — JSON
- **Body:**

```json
{
  "query": "query($id: ID!) { marketplaceJobPosting(id: $id) { contractorSelection { proposalRequirement { screeningQuestions { question sequenceNumber } } } } }",
  "variables": {
    "id": "={{ $('Edit Fields').item.json.id }}"
  }
}
```

- **Options:**
  - **Continue on Fail:** ✅ (un job sin questions o que ya no existe no debe romper el batch)

### Modificar el nodo "Supabase Upsert"

Agregar este field al JSON body del upsert:

```json
"questions": {{ JSON.stringify($json.data?.marketplaceJobPosting?.contractorSelection?.proposalRequirement?.screeningQuestions || []) }}
```

Después del campo `description`, antes del cierre del objeto.

## Costo

- +1 GraphQL call por job nuevo = ~50-200 calls/día extra (depende del scrape rate)
- Sin LLM, sin costo monetario directo
- Upwork rate limit: ~10 req/sec por token. Si scrapeás 200 jobs en batch, agregá un Wait node de 100-200ms después del HTTP Request

## Cómo probarlo antes de prod

1. En n8n, después de agregar el nodo, click **"Execute Node"** sobre `Screening Questions`
2. Vas a ver en el output:
   ```json
   {
     "data": {
       "marketplaceJobPosting": {
         "contractorSelection": {
           "proposalRequirement": {
             "screeningQuestions": [
               { "question": "How many years...", "sequenceNumber": 1 },
               { "question": "Describe...", "sequenceNumber": 2 }
             ]
           }
         }
       }
     }
   }
   ```
3. Si devuelve `null` → el job no tiene questions (válido, ~70% de los jobs)
4. Si devuelve `errors` → revisar token / scopes

## Validación post-deploy

```sql
-- En Supabase SQL editor, después de que corra 1 batch:
select
  count(*)                          as total,
  count(questions)                  as con_questions_field,
  count(*) filter (where jsonb_array_length(questions) > 0) as con_questions_reales
from jobs
where created_at > now() - interval '1 hour';
```

Esperás ver ~30% de los jobs nuevos con `con_questions_reales > 0`.
