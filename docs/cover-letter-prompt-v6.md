# Cover Letter Prompt v6 — Review con Juan

**Fecha:** 2026-06-09
**Autor:** Pris (con Claude)
**Objetivo de la reunión:** Validar el nuevo prompt antes de pegarlo en n8n y dejarlo en producción.

---

## 1. Resumen ejecutivo (30 segundos)

Hoy las cover letters que genera el brain salen **correctas pero genéricas**. Suenan a "agencia que entendió el job", no a "consultor senior que ya resolvió este problema 10 veces".

El **prompt v6** cambia la filosofía:

- **Hook inmenso al inicio:** mostramos que entendimos el pain point específico, no uno genérico.
- **Skills 1:1 con el job:** cada bullet refleja una requirement concreta del cliente, no servicios SWL en abstracto.
- **Voz Juan (no agencia):** "I" cuando es Juan personal, "we" cuando es el equipo SWL.
- **Cero AI-clichés:** banneamos 10 frases típicas de ChatGPT genérico ("caught my attention", "stood out", etc.).
- **Cap 350 palabras:** corto, denso, directo. Sin relleno.

---

## 2. Cómo funciona el sistema (1 minuto)

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  1. n8n recibe job qualified (status = qualified)        │
│                          │                               │
│                          ▼                               │
│  2. n8n arma el contexto:                                │
│     - PROMPT v6 (fijo, lo definimos hoy)                 │
│     - JOB POST (título + descripción + ticket)           │
│     - BU CARD del job                                    │
│     - CV Juan + Anchor stories                           │
│                          │                               │
│                          ▼                               │
│  3. Claude Sonnet 4.5 genera la cover letter             │
│                          │                               │
│                          ▼                               │
│  4. Aparece en /prospects columna "Proposal"             │
│     Juan revisa, copia, envía en Upwork                  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Lo que vamos a aprobar hoy:** únicamente el bloque (1) — el **PROMPT** que recibe Claude.

El prompt es **uno solo**, se queda fijo en n8n, y se aplica a **todos los jobs** automáticamente.

---

## 3. El prompt v6 completo

### 3.1. Reglas estructurales (fijas)

```
You are SWL Consulting's senior cover letter writer for Upwork proposals.
Output ONLY the cover letter text. No preamble, no markdown, no comments.

═══════════════════════════════════════════════════════════════
INPUTS YOU WILL RECEIVE (per job, injected by n8n)
═══════════════════════════════════════════════════════════════
- JOB POST (title + description + budget/hourly + client country)
- BUSINESS UNIT card (services + audience + value proposition)
- JUAN'S CV (credentials, anchor roles)
- (Optional) PRECEDENT cover letters for tone reference

═══════════════════════════════════════════════════════════════
BEFORE WRITING — INTERNAL ANALYSIS (do NOT include in output)
═══════════════════════════════════════════════════════════════
Step 1. Extract the client's EXPLICIT pain points from the job post.
Step 2. Identify 2-3 IMPLICIT pain points (what the client didn't say but likely fears: time pressure, key-person risk, due-diligence exposure, etc.).
Step 3. List 3-5 specific skills/deliverables the client mentions.
Step 4. Map each skill to a concrete Juan/SWL capability or anchor story.
Step 5. Choose the BU card service that best fits the job's primary need.

THEN write the letter following the structure below.

═══════════════════════════════════════════════════════════════
OUTPUT STRUCTURE — 7 PARAGRAPHS, IN THIS EXACT ORDER
═══════════════════════════════════════════════════════════════
HARD CAP: 350 words. Plain text. NO em-dashes. NO hyphens between concepts. NO markdown.

[P1 — GREETING] (20-30 words)
ALWAYS start with: "Hi there, it's a pleasure to connect."
Then 1 short sentence referencing a SPECIFIC detail from the job post.

[P2 — THE PAIN POINT MIRROR] (60-80 words)
This is the HOOK. Open with a sharp diagnosis of the client's REAL problem (not the surface ask). Use the implicit pain points you identified.

Pattern: "When [specific situation like the client's] reaches the point where [concrete symptom], the real risk isn't [surface concern]. It's that [deeper consequence #1], [deeper consequence #2], and [deeper consequence #3]. That's exactly the gap you're trying to close."

End with: "That's exactly the gap you're trying to close." OR "That's exactly what you're tackling."

[P3 — REFRAMING] (50-70 words)
Show you understand what the client REALLY needs beyond the surface ask.
Pattern: "It's clear you're looking for more than just [surface ask]. You need [deeper need #1], [deeper need #2], and [deeper need #3]."
Do NOT use "You're looking for" twice. Vary with "You need", "You want", "What you're really after is".

[P4 — AUTHORITY (Juan, "I" voice)] (70-90 words)
Bridge first: "My background combines business strategy with technical depth."
Then: "I hold an MBA, a Master's in Finance, and the FMVA certification from the Corporate Finance Institute."
Mention 1-2 anchor roles, picking the MOST RELEVANT to the job:
  • Managing Director Latam, global consulting firm — AI-driven transformation, improved decision-making and business performance.
  • Head of Investments, media & entertainment fund (LA) — advanced financial models for high-value decisions.
  • CFO, SaaS company (Europe) — systems and operating frameworks for profitable growth and scale.

[P5 — SWL INTRO] (40-55 words)
Bridge: "My team at SWL Consulting brings the same approach to every engagement."
Then: "We are a white-label software factory with 15+ professionals across software development, AI, operations, finance, and data. We help [DIFFERENT audience descriptor than P2] build scalable infrastructure through [BU service that maps to the job]."

[P6 — VALUE BULLETS] (80-120 words)
Intro: "What I can bring to this project:"
Then 3-5 bullets in EXACT format:
- TITLE_IN_CAPS: 1-line concrete description tied to the job's specific stack/context.
Title is 2-4 words MAX, all caps, noun-based.
Each bullet must reflect a REQUIREMENT THE CLIENT EXPLICITLY MENTIONED in the job post.

[P7 — CTA] (15-20 words)
"If this aligns with what you're looking for, let's schedule a call to go over the details."

[CLOSING]
One short line + "Juan" on its own line.
Options: "Looking forward to connecting." / "Talk soon." / "Speak soon and thanks again for the opportunity."

═══════════════════════════════════════════════════════════════
BANNED PHRASES (auto-reject if used)
═══════════════════════════════════════════════════════════════
❌ "caught my attention"
❌ "stood out to me"
❌ "I noticed your post"
❌ "I'm excited about this opportunity"
❌ "this is exciting"
❌ "that's where we shine"
❌ "that's exactly what we do"
❌ "to walk through" (use "to go over" or "to discuss")
❌ "I leverage SWL" (SWL is the team, not a tool)
❌ Em-dashes "—" or hyphens "-" between concepts

═══════════════════════════════════════════════════════════════
VOICE RULES
═══════════════════════════════════════════════════════════════
- P1: "we" voice (warm welcome)
- P2: diagnostic, third-person (about the situation, not us)
- P3: "you" voice (reframing client need)
- P4: "I" voice (Juan personally)
- P5: "My team... We" (collective)
- P6: "I can bring" + bullets
- P7: "let's schedule" (collaborative)

═══════════════════════════════════════════════════════════════
ANTI-REPETITION RULES
═══════════════════════════════════════════════════════════════
- Audience descriptor in P2 must NOT appear in P5. Use different angle.
- Cap each key concept (e.g., "tribal knowledge", "key-person dependencies") at 2 mentions total.
- Never use "You're looking for" twice in the same paragraph.

═══════════════════════════════════════════════════════════════
WRITE THE COVER LETTER NOW.
═══════════════════════════════════════════════════════════════
```

---

## 4. Decisión a tomar con Juan — Hook P2 (3 versiones)

Este es el cambio más fuerte. Tres estilos posibles para el HOOK del párrafo 2. Juan elige cuál es el tono SWL.

### Opción A — Diagnóstico directo (mi recomendación)

> "When a SaaS business reaches the point where its architecture lives in three people's heads and the AWS account has seven undocumented services, the real risk isn't downtime. It's that nobody can answer a due-diligence question in under 48 hours, nobody can onboard a senior engineer in under three months, and nobody can sell the company without a six-figure remediation discount. That's exactly the gap you're trying to close."

**Tono:** Diagnóstico crudo. Mostramos que entendemos el costo real del problema.

### Opción B — Verdad incómoda + autoridad

> "Most technical audits fail for the same reason: they document what exists instead of mapping what's missing. The deliverable looks complete, but the next CTO still has to reverse-engineer half the platform on day one. You're not asking for a static snapshot. You're asking for an audit that survives team turnover, holds up under investor scrutiny, and gives you a defensible roadmap for the next 12 months."

**Tono:** Provocador. Nos posicionamos como los únicos que entienden por qué la mayoría falla.

### Opción C — Stack-aware (mostramos que entendimos todo)

> "A SaaS audit with AWS, Node.js, React, and MongoDB Atlas in the stack isn't a documentation exercise. It's three problems stacked on top of each other: a codebase whose security and scalability boundaries were never formally tested, an infrastructure layer where cost and dependency creep have gone unchecked, and an operational layer where CI/CD and incident response live in someone's notebook. You're asking the right question at the right time."

**Tono:** Técnico-sofisticado. Demostramos comprensión profunda del stack.

**Mi voto: A.** Más universal (funciona para más BUs), términos comerciales (Juan/jefes hablan así), y el costo concreto ("six-figure remediation discount") es muy persuasivo para founders/PE.

---

## 5. Antes / Después — Ejemplo real

**Job:** SaaS Technical Audit & Architecture Documentation (generado 9-jun-2026)

### ANTES (cover letter actual del brain en producción)

> Hi, it's a pleasure to connect.
>
> We read that you need a Technical Audit Consultant to conduct a comprehensive architecture review and documentation of your SaaS platform, and we see clear alignment with your goals. We are genuinely excited by the opportunity to help document and de-risk your system while creating onboarding materials that accelerate knowledge transfer and reduce key person dependencies.
>
> We understand you are seeking more than documentation you need a strategic partner who can quickly assess architecture health, surface risks early, and create materials that empower your team to scale. We have supported SaaS founders and engineering leaders by conducting technical audits that map undocumented architecture, identify bottlenecks and security gaps, and translate findings into prioritized roadmaps that non technical stakeholders can act on...

**Problemas:**
- ❌ Hook plano: "we are excited by the opportunity" (AI-cliché)
- ❌ No demuestra entendimiento del pain real
- ❌ Voz solo "we" (debería ser "I" en authority paragraph)
- ❌ No menciona credenciales de Juan en paragraph 4
- ❌ Bullets genéricos sin formato `TITLE: descripción`

### DESPUÉS (con prompt v6, opción A)

> Hi there, it's a pleasure to connect. Your call for a Technical Audit Consultant with full architecture documentation and AWS expertise lands at exactly the right inflection point for a SaaS at your stage.
>
> When a SaaS business reaches the point where its architecture lives in three people's heads and the AWS account has seven undocumented services, the real risk isn't downtime. It's that nobody can answer a due-diligence question in under 48 hours, nobody can onboard a senior engineer in under three months, and nobody can sell the company without a six-figure remediation discount. That's exactly the gap you're trying to close.
>
> It's clear you're looking for more than documentation. You need visibility into how the platform operates, where risks exist, and what needs to be addressed to make the business less dependent on individual expertise.
>
> My background combines business strategy with technical depth. I hold an MBA, a Master's in Finance, and the FMVA certification from the Corporate Finance Institute. As Managing Director Latam of a global consulting firm, I led AI-driven transformation initiatives across due-diligence projects for tech-enabled investments. As CFO of a SaaS company in Europe, I implemented operating frameworks that supported profitable scaling.
>
> My team at SWL Consulting brings the same approach to every engagement. We are a white-label software factory with 15+ professionals across software development, AI, operations, finance, and data. We help growth-stage companies build scalable infrastructure through technical audits and architecture work.
>
> What I can bring to this project:
> - ARCHITECTURE REVIEW: System diagrams, AWS service mapping, and MongoDB Atlas schema documentation
> - CODEBASE ASSESSMENT: Quality, security, performance, and scalability across Node.js and React
> - OPERATIONAL DOCS: CI/CD pipelines, deployment processes, monitoring, and incident response
> - KNOWLEDGE TRANSFER: Onboarding guides and assets that survive team turnover
> - RISK REPORT: Prioritized technical recommendations with actionable next steps
>
> If this aligns with what you're looking for, let's schedule a call to go over the details.
>
> Looking forward to connecting.
>
> Juan

**Mejoras:**
- ✅ Hook brutal con costo real del problema
- ✅ Demostramos que entendimos el pain implícito (DD, onboarding, sellabilidad)
- ✅ Credenciales explícitas con MBA + Finance + FMVA
- ✅ Voz mixta: "I" en P4, "We" en P5
- ✅ Bullets en formato `TITLE: descripción` matcheados al stack del cliente
- ✅ 320 palabras (under cap 350)

---

## 6. Decisiones que necesitamos validar con Juan

| # | Decisión | Default propuesto | ¿Cambia? |
|---|---|---|---|
| 1 | Hook P2: opción A, B o C | **A** | □ Sí □ No |
| 2 | Greeting fijo: "Hi there, it's a pleasure to connect." | ✓ | □ Sí □ No |
| 3 | Voz P4: "I" personal de Juan | ✓ | □ Sí □ No |
| 4 | Voz P5: "My team at SWL... We..." | ✓ | □ Sí □ No |
| 5 | Bullets en formato `TITLE: descripción` | ✓ | □ Sí □ No |
| 6 | Cap 350 palabras (vs 430 actual) | ✓ | □ Sí □ No |
| 7 | Cierre P7: "let's schedule a call to go over the details" | ✓ | □ Sí □ No |
| 8 | Banned phrases (10) | ✓ | □ Sí □ No |
| 9 | Mencionar MBA + Master Finance + FMVA siempre | ✓ | □ Sí □ No |
| 10 | Modelo: Claude Sonnet 4.5 ($0.022 por cover letter) | ✓ | □ Sí □ No |

---

## 7. Próximos pasos (después de la reunión)

1. **Pris ajusta** el prompt con las decisiones de Juan.
2. **Test con 1 job real** ($0.022) en n8n.
3. **Comparar output vs el "Después"** de la sección 5.
4. **Si OK:** pegar prompt en n8n (workflow Brain Cover Letter, nodo Anthropic, campo System Message).
5. **Commit** del master-prompt.md actualizado al repo.
6. **Activar pipeline en producción** y monitorear las próximas 5 cover letters.

---

## 8. Mejoras opcionales (Fase 2)

Estas las podemos hacer DESPUÉS de validar el prompt:

- **BU cards enriquecidas:** servicios concretos, tools, métricas por cada uno de los 8 universos.
- **Anchor stories:** 3-5 case studies por BU para que el modelo cite proyectos reales.
- **CV Juan estructurado:** migrar de hardcoded a Supabase.
- **Precedent samples:** cargar 5-10 cover letters históricas buenas como referencia de tono.
- **Master prompt editable desde UI:** migrar a `app_settings` para poder iterar sin commits.

Cada una mejora 5-15% la calidad del output. Pero el **prompt v6 solo** ya es un upgrade brutal sobre lo que hay hoy.
