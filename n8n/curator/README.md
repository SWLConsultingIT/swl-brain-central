# Curador BU (spec de referencia)

> **Nota:** este documento es **spec de referencia** para reimplementar el curador en el brain. El scaffold `.json` para n8n (`curator-bu-readonly.json`) fue removido del repo — la lógica se va a reescribir en TypeScript dentro del brain (script que lee `proposals`, llama LLM y escribe en `business_units`). El prompt sigue versionado en `prompt.md`.

---

## Qué hace el curador

Lee proposals históricas + LLM clasifica cada una contra las 8 BU cards + escribe el `business_unit_id` en `proposals` + mergea nuevos scopes/keywords descubiertos a la BU correspondiente.

**Output del LLM por proposal** (forma del JSON estructurado):
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

---

## Etapas previstas (a portar al brain)

1. **Read-only** — lee 5 proposals + LLM clasifica + log. No escribe. Validar calidad de output a ojo (¿`bu_name` tiene sentido?, ¿`new_scope` es algo que SWL ofrece?, ¿`new_keywords` son técnicas y no genéricas?, ¿`confidence` razonable?).
2. **Con escritura** — lookup `business_units` por name → `bu_id`; `UPDATE proposals SET business_unit_id = bu_id WHERE id = proposal_id`; mergea `new_scope` y `new_keywords` en `business_units` via función SQL `curator_merge_into_bu(p_bu_id, p_new_scope, p_new_kws)`; skip si `confidence < 0.7`.
3. **Escala** — de 5 → 50 → 12.402 proposals. Manejo de errores + rate limit.

---

## Estimaciones

- Costo: ~$1 USD total con gpt-4o-mini sobre las 12,402 proposals.
- Tiempo: 30–60 min a ~3 calls/seg.
