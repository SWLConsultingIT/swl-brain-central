# Prospect Automation — AI Agent Block (spec de referencia)

> **Nota:** este documento es **spec de referencia** para portar el Agent Block al brain. Los archivos `.json` (`agent-block.json`, `dedup-block.json`) que vivían acá fueron removidos del repo — eran scaffolds n8n superados por la versión completa que vive en `JSON /Prospect Automation - Agent Block.json` y por la auditoría en `docs/n8n-audit.md`. El workflow en la plataforma n8n sigue corriendo; este README documenta su diseño.

---

## Flujo padre

Workflow en n8n: **Prospect automation COPIA** (`Personal / Upwork /`).
Trigger: cron `0 8 * * *` (todos los días a las 8am).

Cadena de nodos:

```
Schedule → Read Historical IDs (nuevo, lee sheet histórico una vez)
        → Buscar Prospects (Notion) → Extraer Páginas → Parsear Datos*
        → Flag Duplicates (nuevo) → ¿Es Duplicado?
              ├─ true  → Descartado por Duplicado (Notion PATCH → "Discarded")
              └─ false → ¿Ticket >= $40?
                            ├─ false → Descartado por Ticket (Notion PATCH → "Discarded")
                            └─ true  → [AI AGENT BLOCK]
                                          → ¿Matchea con servicios SWL?
                                                ├─ true  → Append "Qualified" sheet + Notion PATCH "Qualified"
                                                └─ false → Append "Discarded" sheet + Notion PATCH "Discarded"
```

El bloque del medio (lo que estaba como `Preparar Evaluación AI → OpenAI → Parsear Respuesta AI`) fue reemplazado por un **AI Agent con tools**.

El bloque de deduplicación lee histórico una vez por run, dedupea batch + filtra ya-enviados.

---

## Criterios del flujo (qué decide qué)

| Criterio | Dónde se aplica | Estado |
|---|---|---|
| Keywords Upwork | Filtro upstream — antes de ingestar a Notion (fuera del scope de este workflow) | Activo, fuera del workflow |
| **Ticket >= USD 40** | Code node `Parsear Datos` (`ticketPasses: ticketMax >= 40`) + IF `¿Ticket >= $40?` | Activo |
| **Ventana de 60 días para precedente** | System prompt del Agent + descripción del tool `historical_sent_jobs` | Activo en el bloque |
| **Match = scope SWL + precedente** | System prompt del Agent (paso 4 del protocolo) | Activo en el bloque |
| **Exclusiones duras** | System prompt del Agent (lista al final) | Activo en el bloque |

---

## Qué contiene el AI Agent Block

6 nodos que conviven en el workflow n8n:

| Nodo | Tipo | Función |
|---|---|---|
| `AI Agent` | `@n8n/n8n-nodes-langchain.agent` | Cerebro del bloque — recibe `title`, `description`, `ticketMax` y devuelve `{ match, reason, area }`. |
| `OpenAI Chat Model` | `@n8n/n8n-nodes-langchain.lmChatOpenAi` | gpt-4o-mini, temperature 0. |
| `Structured Output Parser` | `@n8n/n8n-nodes-langchain.outputParserStructured` | Fuerza el output a JSON estructurado. |
| `SWL Services KB` | `@n8n/n8n-nodes-langchain.toolCode` | **Tool 1** — devuelve el catálogo completo de servicios SWL (8 áreas + tools + keywords + exclusiones). Texto del `swl_consulting_RAG` embebido. |
| `Historical Sent Jobs` | `n8n-nodes-base.googleSheetsTool` | **Tool 2** — lee el sheet con todas las propuestas enviadas en los últimos 60 días. Sheet ID: `1k-VoL8pshVVR65a-CKBTaEmnyJs7q7u8hN4k-hSleFw`. Read-only. |
| `Mapear Salida` | `n8n-nodes-base.code` | Aplana el output del agent a las columnas que esperan los nodos downstream (`pageId, title, ticketMax, aiMatch, aiReason, aiArea`). |

---

## Cómo razona el agente

System prompt (resumen):

1. Lee título + descripción del job.
2. Llama a `swl_services_kb` → confirma si el scope cae en alguna de las 8 áreas SWL.
3. Llama a `historical_sent_jobs` → busca 1–2 jobs similares ya enviados como precedente.
4. Decide `match = true` solo si AMBAS condiciones se cumplen: scope confirmado + precedente realista.
5. Exclusiones duras (siempre `false`): diseño gráfico puro, manufactura física, legal, médico, académico, ingeniería civil/mecánica/eléctrica.

Output:
```json
{ "match": true, "reason": "max 25 words, refs precedent", "area": "Corporate Advisory & Finance" }
```

---

## Por qué este diseño

- **2 tools en vez de 1 prompt gigante**: el agente puede iterar — primero verifica scope, después busca precedente. Más explicable y barato (no manda todo el RAG en cada call, solo cuando lo necesita).
- **Sheet como criterio aprendido**: el equipo ya filtra manualmente qué se envía. El agente aprende de esas decisiones reales, no solo de un catálogo teórico.
- **Code Tool embebido para el RAG**: self-contained, sin depender de Google Doc / Notion externos. Para actualizar servicios, se edita el `jsCode` del nodo.
- **`Structured Output Parser`** evita parseo manual del response y los retries por JSON mal formado.

---

## Patch para `Parsear Datos` (necesario para dedup)

El Code node `Parsear Datos` en el workflow original NO extrae `upworkId` ni `link`. El dedup necesita ambos. Reemplazá el código del nodo por esto:

```javascript
const page = $json;
const props = page.properties || {};

const titleField = props['Job Tittle'] || props['Job Title'] || props['Name'] || props['title'];
const title = titleField?.title?.[0]?.plain_text || titleField?.rich_text?.[0]?.plain_text || 'Sin título';

const ticketField = props['Ticket'];
const ticketRaw = ticketField?.formula?.string ||
                  ticketField?.rich_text?.[0]?.plain_text ||
                  ticketField?.select?.name || '';
let ticketMax = 0;
const rangeMatch = ticketRaw.match(/\$?\s*([\d.]+)\s*[-–]\s*\$?\s*([\d.]+)/);
if (rangeMatch) {
  ticketMax = parseFloat(rangeMatch[2]);
} else {
  const single = ticketRaw.match(/\$?\s*([\d.]+)/);
  if (single) ticketMax = parseFloat(single[1]);
}

const descField = props['description'] || props['Description'];
const description = descField?.rich_text?.map(t => t.plain_text).join('').trim() || '(no description)';

// NUEVO: extracción de link + upworkId
const linkField = props['Link'] || props['URL'] || props['Upwork Link'];
const link = linkField?.url
          || linkField?.rich_text?.[0]?.plain_text
          || linkField?.title?.[0]?.plain_text
          || '';

const upworkIdField = props['Upwork ID'] || props['UpworkID'] || props['upwork_id'];
let upworkId = upworkIdField?.rich_text?.[0]?.plain_text
            || upworkIdField?.number?.toString()
            || upworkIdField?.title?.[0]?.plain_text
            || '';

if (!upworkId && link) {
  const m = link.match(/freelance\/jobs\/(\d+)/)
         || link.match(/jobs\/~(\d+)/)
         || link.match(/(\d{10,})/);
  if (m) upworkId = m[1];
}

return {
  json: {
    pageId: page.id,
    title,
    ticketRaw,
    ticketMax,
    ticketPasses: ticketMax >= 40,
    description,
    link,
    upworkId,
  },
};
```

---

## Decisiones pendientes / TODO

- [ ] Validar con 5–10 prospects reales que el match-rate sea razonable antes de activar el cron.
- [ ] Eventual mejora: pasar a Supabase (proyecto Brain Central) — este agent block es un *bridge* mientras Notion sigue siendo backend.
- [ ] Si la sheet crece mucho (>1000 filas), considerar añadir `filtersUI` para que el tool filtre por keyword del título antes de devolver rows.
- [ ] Alternativa al Code Tool: si el equipo quiere editar los servicios sin tocar n8n, mover el RAG a un Google Doc y usar `googleDocsTool` (solo necesitaría el doc ID).

---

## Referencias

- PDF fuente del RAG: `swl_consulting_RAG.pdf` (8 páginas, 8 service areas).
- Sheet histórico de Sent: https://docs.google.com/spreadsheets/d/1k-VoL8pshVVR65a-CKBTaEmnyJs7q7u8hN4k-hSleFw/edit
- Notion DB de origen: `249d4ea8d5a68071ae52d25f0bd5a233` (CRM UPWORK).
