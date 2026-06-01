# Curador BU — n8n

Workflows que clasifican proposals históricas por unidad de negocio y enriquecen las 8 BU cards en Supabase.

---

## Archivos

| Archivo | Propósito | Estado |
|---|---|---|
| `prompt.md` | Prompt del LLM (system + user template + JSON schema). Versionable aparte. | ✅ |
| `curator-bu-readonly.json` | **Mini-paso 2.2b** — workflow de prueba. Lee 5 proposals + LLM clasifica + log. **No escribe nada en Supabase.** | ✅ Listo para importar |
| `curator-bu.json` | **Mini-paso 2.2c** — workflow completo con escritura (UPDATE proposal + RPC merge). | ⏳ pendiente |

---

## Mini-paso 2.2b — importar y correr `curator-bu-readonly.json`

### Pre-requisitos en n8n

- ✅ Credencial Supabase configurada (tu nota dice que ya está)
- ✅ Credencial OpenAI llamada `Open AI SWL` (la que usa el agente actual)

### Pasos

1. Abrir n8n
2. **Workflows** → **Import from File** → seleccionar `curator-bu-readonly.json`
3. Revisar nodos. n8n puede pedirte re-asignar credenciales si los nombres no matchean:
   - `Supabase: SELECT proposals (5 sin BU)` → tu credencial Supabase
   - `OpenAI Chat Model` → `Open AI SWL`
4. Click **Test workflow** (botón arriba a la derecha)
5. Ver el resultado en el nodo `Log resultado (read-only)` — vas a ver 5 objetos, uno por proposal:
   ```json
   {
     "proposal_id": "...",
     "upwork_id": "...",
     "job_title": "...",
     "status": "Sent",
     "keyword": "CFO",
     "bu_name": "Finance & Accounting",
     "new_scope": "...",
     "new_keywords": ["...", "..."],
     "confidence": 0.92,
     "would_skip": false
   }
   ```

### Qué validar a ojo

Para cada uno de los 5 resultados, mirá:
- ¿El `bu_name` tiene sentido para el `job_title`?
- ¿El `new_scope` es algo que SWL podría ofrecer?
- ¿Los `new_keywords` son cosas técnicas (no genéricas)?
- ¿`confidence` es razonable (alto cuando es obvio, más bajo cuando es ambiguo)?

Si las 5 están bien → avanzamos al Mini-paso 2.2c (escritura).
Si alguna está mal → ajustamos el prompt antes de seguir.

---

## Mini-paso 2.2c (pendiente) — agregar escritura

Una vez validado 2.2b, vamos a:

1. Agregar lookup en `business_units` por name → obtener `bu_id` (uuid)
2. Agregar `Supabase: UPDATE proposals` SET `business_unit_id = bu_id` WHERE `id = proposal_id`
3. Agregar `HTTP Request: POST /rest/v1/rpc/curator_merge_into_bu` con `{ p_bu_id, p_new_scope, p_new_kws }`
4. IF confidence < 0.7 → skip las 3 escrituras
5. Subir el batch de 5 → 50 → 12.402

---

## Mini-paso 2.2d (pendiente) — escalar a 12.402

Cambiar `LIMIT 5` → `LIMIT 200` o sacar el límite, agregar manejo de errores y rate limit.

Estimación de costo: ~$1 USD total con gpt-4o-mini.
Estimación de tiempo: 30-60 min para procesar 12.402 a ~3 calls/seg.
