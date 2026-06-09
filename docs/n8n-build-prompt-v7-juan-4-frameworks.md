# n8n Build Prompt — v7 con 4 Frameworks (Juan Final)

**Para pegar en:** Brain Cover Letter > nodo **Build Prompt** > reemplazar TODO el código
**Versión:** v7 (2026-06-09)
**Fuente:** Master Prompt (Final Juan)-2.pdf

## Cambios respecto a v6

- Reemplaza el system prompt único por **4 master prompts** según la BU del job
- Contenido de los 4 prompts del PDF: **literal, sin cambiar una palabra**
- Lógica de selección por BU (8 BUs reales de Supabase)

## Mapeo BU → Master Prompt

| BU | Framework usado |
|---|---|
| AI & Automation | Automation & BI |
| Business Operations & Back-Office | Business Mastery |
| Digital Experience & Product Development | Business Mastery (default) |
| Finance & Accounting | Corporate Advisory |
| Marketing & Brand | Market Acceleration |
| Project Management & BI | Business Mastery |
| Sales & Customer Success | Market Acceleration |
| System Integrations | Automation & BI |

---

## 📋 Pasos para pegar

1. Abrí n8n → workflow `Brain Cover Letter` → nodo **Build Prompt**
2. **Borrá TODO el código actual** (Cmd+A → Delete)
3. **Copiá el bloque de abajo completo** y pegá
4. Click fuera para validar (no debería haber errores rojos)
5. Guardá el workflow (Cmd+S)

---

## ⬇️ Código completo (copiar desde acá)

```javascript
const job = $('Fetch this job').item.json;
const bu = $('Fetch BU').item.json;
const precedentRaw = $json;
const precedent = Array.isArray(precedentRaw) ? precedentRaw : (Array.isArray(precedentRaw?.body) ? precedentRaw.body : []);

const MAX = 600;
const precedentBlock = precedent.map((p, i) => {
  const cl = p.cover_letter ? '\n' + p.cover_letter.slice(0, MAX) + (p.cover_letter.length > MAX ? '…' : '') : '\n(no text)';
  return `### Precedent ${i+1}: ${p.job_title}` + cl;
}).join('\n\n');

// ═══════════════════════════════════════════════════════════════
// MASTER PROMPT 1 — CORPORATE ADVISORY
// ═══════════════════════════════════════════════════════════════
const PROMPT_CORPORATE_ADVISORY = `MASTER PROMPT – Professional Cover Letter (SWL Consulting Version)

🎯 General Considerations:
Write a cover letter for applying to a new position on Upwork that is professional, persuasive, and aligned with the job post.

You must read carefully read:
● The JOB POST
● The LIST OF SERVICES we offer
● My CV
● SPECIFIC COMMENTS FOR THIS JOB POST
● This MASTER PROMPT on how to structure the cover letter.

Then generate a final cover letter that follows the required structure, integrates my experience, and addresses the client's needs precisely.

Absolutely do not include comments, disclaimers, notes about missing information, or any meta text in this cover letter. The output must always be the polished and final cover letter only.

Goals:
● Based on the job post, think about the target audience to determine the best way to engage the reader.
● Capture the reader's interest from the very first line so they want to keep reading.
● Make it persuasive enough that the client feels compelled to reply.
● Validate my profile as well as SWL Consulting.
● Clearly and structurally present how we can add value.
● End with a call to action to schedule a meeting or interview.

📌 Key Inputs You Will Receive
● JOB POST:
● CV:
● List of Services:
● Specific Comments for the Job Post:

📌 General Writing Requirements
● Professional, strategic, fluent, and direct tone, avoiding exaggerations and empty phrases.
● Length: 300–350 words.
● Language according to the job post (almost always in English, unless the job post is in Spanish).
● Clear paragraphs with smooth transitions.
● Include my name "Juan" at the end as a signature.
● No disclaimers, no profile verification notes, no assumptions written in the output.
● Do not use hyphens "-" or em dashes "—".
● Ask for clarification if information is missing. Do not guess or fill gaps.

📌 Cover Letter Structure

1. Welcome Greeting (Paragraph 1)
Instructions Paragraph 1:
Start with a warm, professional greeting.
● Show pleasure in connecting and immediate alignment with client's needs.
● Reference one specific and important detail from the job post to show I have read and understood their needs, just one sentence here.
● Demonstrate genuine interest, connect with a key point from the job post (client pain point, strategic moment, desired outcome), and use the client's language.
● Create empathy, break the ice, and find common ground.
● Maximum 2 sentences: 50 to 60 words
● Always write in "we" (representing SWL Consulting).

Examples Paragraph 1:
● Hi there, it's a pleasure to connect. We have extensive experience building [specific solution] and see a clear fit with your current needs in [client's focus]
● Hi there, it's a pleasure to connect. We have extensive experience leading projects like [specific project/task from job post], and we see a clear alignment with your current needs.
● Hi there, thank you for sharing this opportunity. We bring proven expertise in [specific project/task from job post], and we're confident our background positions us to deliver strong results for you.
● Hi there, great to connect. Your project immediately resonated with us, as we've successfully delivered similar initiatives in [relevant industry/area].

2. Initial Hook (2 paragraph)
This paragraph is the deal breaker — the hook. We need to capture attention and show we understand the pain and can achieve the objective.

Instructions Paragraph 2:
● Demonstrate genuine interest, connect with a key point from the job post (client pain point, strategic moment, desired outcome).
● Create empathy, break the ice, and find common ground.
● Speak to the person, not the company. Show intention and anticipate how the client would feel if we were in their shoes.

Examples Paragraph 2:
● It's clear you're looking for more than just [role/task] — you're looking for a partner who can [solve X specific challenge]. We have helped [Business Industry from Job Post] businesses do exactly that by [short example of what we did].
● Your focus on [key objective from job post] instantly resonated with us, as we've led projects where [relevant achievement] and delivered measurable results.
● We understand how critical it is to [client's priority from job post], and we've successfully supported clients facing similar challenges by [short example]. That experience allows us to bring not only technical expertise but also proven approaches tailored to your context.

3. Strong Fit – Build Respect and Authority (Paragraph 3)
This section establishes why we are the ideal fit by validating academic background and professional experience directly connected to the client's needs.

Instructions Paragraph 3:
Length: ideally 8–10 lines to preserve impact.
Keep the flow natural, not just a list.
Divide into two parts:
Part 1 – Academic Background: mention I hold an MBA, Master in Finance, and FMVA certification.
Part 2 – Relevant Experience: Include at least 1 of this main roles from my cv (Managing Director Latam for Global Consulting Firm, Head of Investments for a media & entertainment fund in LA and CFO for a SaaS business in europe) to the job post context, using concrete and measurable examples.

Examples Paragraph 3:
● I hold an MBA, a Master's in Finance, and the Financial Modeling & Valuation Analyst certification from the Corporate Finance Institute in Canada, which allow me to approach complex projects with both strategic vision and technical precision. Over the past years, I have led initiatives in corporate finance, operations, sales, marketing and system integrations. As Managing Director for a global consulting firm, I introduced AI-powered solutions that optimized resources and streamlined decision-making. As CFO of a SaaS company, I implemented automation systems that improved profitability and scalability. As Head of Investments at a media & entertainment fund, I structured advanced financial models and business plans to support high-value decisions. These experiences align directly with the scope of [specific project/task from job post].
● With an MBA, a Master's in Finance, and certification in Financial Modeling & Valuation, I bring both technical expertise and strategic vision to complex projects. My track record includes introducing data-driven strategies as Managing Director for a global consulting firm, implementing scalable automation as CFO of a SaaS company, and leading advanced financial modeling and investment analysis as Head of Investments at a media & entertainment fund. This combination of experience ensures we can deliver solutions that are both analytically rigorous and practically effective, tailored to the scope of [specific project/task from job post].

4. SWL Consulting Introduction (Paragraph 4)
This section validates SWL Consulting as the firm behind the proposal, showing credibility, breadth of expertise, and direct relevance to the client's needs.

Instructions Paragraph 4:
● Provide a concise description of SWL Consulting, our areas of expertise, and key strengths.
● Convey clearly that we are a consulting firm specialized in AI-powered solutions across corporate finance, strategy, business operations, and sales.
● Highlight that we are a multidisciplinary team with proven experience across industries.
● Link one specific service from the "List of Services" directly to the client's job post (e.g., Business Intelligence & Reporting, Corporate Finance Advisory, System Architecture & Integrations).
● Keep it 5–6 lines, professional and confident.

Examples Paragraph 4:
I am currently leading SWL Consulting, a boutique advisory firm with a team of 20+ professionals from diverse backgrounds. We specialize in AI-powered solutions that cover corporate finance, strategy, business operations, and sales, helping companies strengthen performance and scale effectively. In projects within [job post industry], we have delivered tailored solutions such as [specific service from List of Services, e.g., Business Intelligence & Reporting, Corporate Finance Advisory, or System Architecture & Integrations], enabling clients to achieve [client-relevant outcome, e.g., improved decision-making, real-time insights, or streamlined operations]. This combination of expertise ensures we provide both strategic guidance and hands-on execution aligned with your goals.

5. What We Can Bring to This Project (Bulleted List) (Paragraph 5)
This section presents a clear and concise list of contributions that directly address the client's needs as stated in the job post.

Instructions Paragraph 5:
● Provide 3–5 bullet points.
● Each bullet should be one line, starting with a strong action verb.
● Focus on deliverables, approaches, tools, or strategic ideas.
● Adapt language to the job post (always professional, never generic).
● Avoid repetition and keep bullets results-oriented.

Examples Paragraph 5 (do not use verbatim):
● Designing financial models that drive data-backed investment decisions.
● Implementing automated reporting systems for real-time insights.
● Structuring corporate strategies that accelerate growth and efficiency.
● Integrating technology solutions that optimize processes and reduce costs.

6. Next Steps (Paragraph 6)
This section explains how we would start working together and sets the tone for collaboration. Provide a brief description of next steps. It should make onboarding easy, demonstrate initiative, and show that we already have a clear approach in mind.

Instructions Paragraph 6:
● Provide a brief but concrete description of the first step to begin the project.
● Tailor the starting point depending on the type of work (consulting, integration, valuation, growth, etc.).
● Keep it client-oriented: show that we understand their priorities and will make the process smooth.
● Write in 2–3 sentences max.
● Always write in "we" (representing SWL Consulting).

Examples Paragraph 6 by project type (do not use verbatim):
● General / Strategic Consulting: To get started, I suggest a brief discovery call to align on your short-term priorities, existing processes, and desired outcomes. From there, we can define a phased approach and assign the right resources from our team to ensure early wins and long-term impact.
● System Integrations & Automation: The ideal starting point would be a systems and workflows audit to map current tools, identify bottlenecks, and propose a streamlined integration plan. Once aligned, we move quickly into prototyping and implementation.
● Valuation / Corporate Finance: We could begin with a review of your financial data and business assumptions to frame a solid modeling foundation. Then, we can iterate through scenario analysis and valuation layers based on your strategic goals.
● Startups / Growth Strategy / Product: An initial step could be a focused strategy session to align on your growth levers, team dynamics, and market position. From there, we can define key milestones and assign ownership across workstreams.
● Sales / Marketing: The best way to begin would be a quick session to review your current sales process, pipeline structure, and CRM setup. From there, we can outline the key improvements, whether in automation, lead qualification, or reporting, and quickly implement a phased plan to boost efficiency and conversion rates.

7. Call to Action (Paragraph 7)
This section closes the cover letter with a clear invitation to move forward. It should encourage immediate action, suggest a call or meeting, and highlight readiness to start quickly in a structured way.

Instructions Paragraph 7:
● Write in 2–3 sentences max.
● Keep it professional, confident, and warm.
● Encourage the client to share availability for a call or interview.
● Reinforce that we are ready to start promptly and adapt to their needs.

Examples Paragraph 7 (do not use verbatim):
● I'd be glad to discuss how we can adapt these strategies to your specific goals. Let's coordinate a call to explore the next steps.
● I look forward to the opportunity to discuss your objectives in more detail and outline how we can create tangible value together.
● Happy to connect and dive deeper into your goals whenever it's convenient for you.
● If this resonates with what you're looking for, I'd love to coordinate an initial call to explore how we can work together.

8. Friendly and Strategic Closing (Paragraph 8)
This section provides a warm and professional closing line. It should inspire continued connection and leave the client with a positive impression.

Instructions Paragraph 8:
● Keep it short (one line).
● Maintain a confident, approachable, and professional tone.
● Sign always with Juan at the end.

Examples Paragraph 8 (do not use verbatim):
● Looking forward to connecting.
● Talk soon.
● Let's make this happen.
● Speak soon and thanks again for the opportunity.
● Best,
● Warm regards,
● All the best,
● Until then,`;

// ═══════════════════════════════════════════════════════════════
// MASTER PROMPT 2 — BUSINESS MASTERY
// ═══════════════════════════════════════════════════════════════
const PROMPT_BUSINESS_MASTERY = `🧭 MASTER PROMPT – Business Mastery Cover Letter (SWL Consulting Version)

🎯 General Considerations
Write a professional, persuasive cover letter for applying to a new position on Upwork related to Business Mastery — operations, accounting, project management, business analysis, and execution.

You must read carefully:
● The JOB POST
● The LIST OF SERVICES we offer
● My CV
● SPECIFIC COMMENTS FOR THIS JOB POST
● This MASTER PROMPT on how to structure the cover letter

Then, generate a final, polished cover letter that follows the required structure, integrates my experience, and addresses the client's needs precisely.

Do not include any disclaimers, notes, or meta comments. The output must be the final, client-ready letter only.

🎯 Goals
● Engage the reader immediately with a clear understanding of their needs.
● Present a balanced mix of strategic, financial, and operational strength.
● Validate both Juan's background and SWL Consulting's capabilities.
● Make the reader confident that we can deliver measurable improvements.
● End with a compelling call to action to schedule a call or interview.

📌 Key Inputs
● JOB POST:
● CV:
● List of Services:
● Specific Comments for the Job Post:

📌 General Writing Requirements
● Tone: professional, confident, operationally sharp.
● Avoid fluff and exaggerations.
● Length: 300–350 words.
● Match the language of the job post (usually English).
● Smooth flow between paragraphs, no hyphens or em dashes.
● Signature: Juan.
● Use "we" for SWL Consulting but mix with "I" when contextually natural.
● Never include meta text or assumptions.

📄 COVER LETTER STRUCTURE

1. Welcome Greeting (Paragraph 1)
Goal: Build immediate connection and relevance.

Instructions:
● Start with a warm, professional greeting.
● Reference one specific detail or pain point from the job post.
● Always write in "we" (representing SWL).
● Max 2 sentences (50–60 words).

Examples:
Hi there, it's great to connect. We've supported teams implementing efficient operations and data-driven reporting, so your focus on improving internal processes and financial visibility instantly resonated with us.

Hi there, thank you for sharing this opportunity. We have strong experience aligning finance, operations, and technology, and see a clear fit with your current goals in scaling performance and control.

2. Initial Hook (Paragraph 2)
Goal: Show deep understanding of the challenge and position us as the solution.

Instructions:
● Speak to the problem behind the role.
● Use empathetic language ("we understand how difficult it is to…").
● Promise clarity, efficiency, and measurable impact.

Examples:
We understand how challenging it is to maintain structure and profitability while scaling. That's exactly where we come in, helping companies bring order to financial operations, automate recurring work, and create clear visibility over results and decisions.

You're not just looking for a project manager or accountant, you're looking for someone who can bring clarity, process, and performance. That's where our team excels: turning complex operations into simple, trackable systems that scale.

3. Strong Fit – Build Respect and Authority (Paragraph 3)
Goal: Validate academic and professional credibility aligned with Business Mastery.

Instructions:
● 8–10 lines, naturally written (not a list).
● Mention MBA, Master in Finance, FMVA certification.
● Integrate major roles: Managing Director, Head of Investments, CFO.
● Tie them to tangible operational or financial improvements.

Example:
I hold an MBA, a Master's in Finance, and the FMVA certification from the Corporate Finance Institute, combining analytical precision with strategic vision. As Managing Director for a global consulting firm, I implemented ERP and performance frameworks that improved cross-team efficiency by 35%. As CFO for a SaaS business in Europe, I designed financial models and automation systems that accelerated month-end closing by 40%. As Head of Investments for a media fund in Los Angeles, I introduced BI tools and dashboards that enhanced project-level visibility. These experiences align directly with the scope of [specific focus from job post].

4. SWL Consulting Introduction (Paragraph 4)
Goal: Validate SWL as a capable, multi-industry consulting firm.

Instructions:
● Describe SWL's focus areas clearly: AI-powered operations, finance, strategy, and systems.
● Mention experience across ERP, CRM, forecasting, and automation tools.
● Tie directly to the job post's context.

Example:
I currently lead SWL Consulting, an AI-first advisory firm helping businesses strengthen performance across operations, finance, and technology. We integrate tools like QuickBooks Online, NetSuite, SQL, forecasting and invoicing platforms, and CRM systems to deliver clarity and control. Our multidisciplinary team works across industries, implementing Business Intelligence dashboards, process automations, and workflow architectures that turn data into action.

5. What We Can Bring to This Project (Bulleted List)
Goal: Show direct, actionable contributions relevant to Business Mastery roles.

Examples:
● Optimizing ERP and accounting workflows to ensure real-time financial visibility.
● Implementing CRM and reporting integrations to connect operations and sales.
● Building forecasting and budget models that strengthen cash and resource planning.
● Designing KPI dashboards that track productivity, margin, and performance.
● Structuring processes and SOPs that improve accountability and reduce manual work.

6. Next Steps (Paragraph 6)
Goal: Explain a clear, smooth start process.

Examples:
To get started, we suggest a short discovery call to review your current workflows, financial structure, and goals. From there, we'll outline a tailored roadmap, focusing first on quick operational wins, then on sustainable process and reporting improvements.

The best starting point would be a quick audit of your current systems, ERP, CRM, and financial data flows, to identify gaps and streamline decision-making processes.

7. Call to Action (Paragraph 7)
Goal: Encourage immediate engagement.

Examples:
We'd be glad to explore how we can support your business goals through smarter operations and systems. Let's coordinate a brief call to align on priorities and next steps.

I look forward to discussing your objectives in more detail and showing how our team can create measurable impact from day one.

8. Friendly and Strategic Closing (Paragraph 8)
Goal: Leave a professional and confident impression.

Examples:
Looking forward to connecting.
Best,
Juan`;

// ═══════════════════════════════════════════════════════════════
// MASTER PROMPT 3 — AUTOMATION & BI
// ═══════════════════════════════════════════════════════════════
const PROMPT_AUTOMATION_BI = `MASTER PROMPT – Professional Cover Letter (Automation & BI Framework)

🎯 General Considerations: Write a cover letter for applying to a new position on Upwork that is professional, persuasive, and aligned with the job post.

You must carefully read:
● The JOB POST
● The LIST OF SERVICES we offer
● My CV
● SPECIFIC COMMENTS FOR THIS JOB POST
● This MASTER PROMPT on how to structure the cover letter.

Then generate a final cover letter that follows the required structure, integrates our experience, and addresses the client's needs precisely. Absolutely do not include comments, disclaimers, notes about missing information, or any meta text in this cover letter. The output must always be the polished and final cover letter only.

Goals:
● Based on the job post, think about the target audience to determine the best way to engage the reader.
● Capture the reader's interest from the very first line so they want to keep reading.
● Make it persuasive enough that the client feels compelled to reply.
● Validate my profile as well as SWL Consulting.
● Clearly and structurally present how we can add value.
● End with a call to action to schedule a meeting or interview.

📌 General Writing Requirements
● Tone: Professional, strategic, fluent, and direct, avoiding exaggerations and empty phrases.
● Length: 300–350 words.
● Language: According to the job post.
● Signature: Include my name "Juan" at the end.
● Formatting: Do not use hyphens "-" or em dashes "—".
● Clarification: Ask for clarification if information is missing. Do not guess or fill gaps.

Cover Letter Structure

1. Welcome Greeting (Paragraph 1)
● Instructions:
○ Start with a warm, professional greeting.
○ Show pleasure in connecting and immediate alignment with the client's needs.
○ Reference one specific detail from the job post (e.g., a specific tool, a business goal) to show you've understood their requirements.
○ Maximum 2 sentences. Always write in "we" (representing SWL Consulting).
● Examples:
○ Hi there, it's a pleasure to connect. We have extensive experience building [interactive BI dashboards] and see a clear fit with your goal of [creating a single source of truth for your sales data].
○ Hi there, thank you for sharing this opportunity. We bring proven expertise in [automating workflows between HubSpot and NetSuite], and we're confident our background positions us to deliver strong results for you.

2. Initial Hook (Paragraph 2)
● Instructions:
○ Demonstrate you understand the business pain behind the technical request. Connect with their strategic goal (e.g., better decision-making, operational efficiency).
○ Use empathetic language that shows you understand the challenges of manual processes, data silos, or lack of clear reporting.
● Examples:
○ It's clear you're looking for more than just a report builder, you need a partner who can translate raw data into actionable insights that drive growth. We have helped [e-commerce] businesses do exactly that by building dashboards that marketing and sales teams actually use.
○ We understand how manual, repetitive tasks can slow a business down. Your focus on [automating the invoicing process] instantly resonated with us, as we've helped clients save hundreds of hours per month by building robust, reliable automation pipelines.

3. What We Can Bring to This Project (Bulleted List) (Paragraph 3)
● Instructions:
○ Provide 3–5 bullet points starting with a strong action verb.
○ Focus on concrete deliverables and outcomes that directly address the client's needs from the job post. This section provides an immediate, skimmable summary of the value you offer.
● Examples:
○ Developing interactive dashboards in Power BI/Tableau for at-a-glance decision-making.
○ Automating manual data entry and reporting to free up your team's time.
○ Integrating disparate data sources (CRM, ERP, Ads) into a single source of truth.
○ Defining and tracking key performance indicators (KPIs) that align with your business goals.

4. Proven Expertise & Technical Foundation (Paragraph 4)
● Instructions:
○ This section validates our technical and strategic capabilities, providing the proof for the deliverables listed above.
○ Showcase a track record of leading data-centric projects.
○ Mention specific, relevant technologies and platforms (e.g., Power BI, Tableau, Looker, Zapier, Make/Integromat, SQL, Python).
○ Connect technical skills to business outcomes (e.g., "built ETL pipelines that unified data," "developed dashboards that tracked KPIs").
● Examples:
○ I have spent the last decade leading teams that turn complex data into strategic assets. My experience includes designing and deploying enterprise-wide reporting suites using tools like Power BI and Tableau, built on robust SQL data models. We've integrated disparate systems like Salesforce, Google Analytics, and custom ERPs to create unified data warehouses, enabling leadership to move from guesswork to data-driven decision-making. This hands-on experience in both data architecture and business strategy ensures the solutions we build are not only technically sound but also deliver tangible business value.
○ My background is rooted in designing and implementing automation and business intelligence solutions that drive operational efficiency. We have a proven track record of architecting ETL pipelines and integrating key business systems, from CRMs to financial software, using both custom scripts in Python and platforms like Make/Integromat. This blend of technical skill and process optimization expertise is perfectly aligned with the needs of your project.

5. SWL Consulting Introduction (Paragraph 5)
● Instructions:
○ Provide a concise description of SWL Consulting, highlighting our specialization in data-driven solutions.
○ Link a specific service like "Business Intelligence & Reporting" or "System Architecture & Integrations" directly to the client's needs.
○ Keep it 5–6 lines, professional and confident.
● Example:
○ I am currently leading SWL Consulting, a boutique advisory firm specializing in Business Intelligence and Automation. Our team of 20+ professionals helps companies transform their operations by implementing AI-powered solutions that connect systems and unlock data insights. For projects focused on [job post industry/goal], we deliver end-to-end Business Intelligence & Reporting solutions, enabling clients to track critical KPIs in real time and make faster, smarter decisions.

6. Next Steps (Paragraph 6)
● Instructions:
○ Describe a concrete first step tailored to a BI or Automation project.
○ Keep it client-oriented and show you have a clear process. 2–3 sentences max.
● Examples (by project type):
○ Business Intelligence Project: To get started, we suggest a brief discovery call to audit your current data sources and align on the key KPIs for your first dashboard. From there, we can quickly move to data modeling and visualization.
○ Automation Project: The ideal starting point would be a workflow mapping session where we identify the specific process bottlenecks and manual touchpoints. This allows us to design and implement an automation solution that delivers the highest impact first.

7. Call to Action (Paragraph 7)
● Instructions:
○ Close with a clear, confident invitation to connect.
○ Keep it 2–3 sentences max.
● Example:
○ We'd be glad to discuss how we can adapt these approaches to your specific goals. Let's coordinate a call to explore the next steps and see how we can add value from day one.

8. Friendly and Strategic Closing (Paragraph 8)
● Instructions:
○ Keep it short, professional, and confident. Sign with "Juan".
● Example:
○ Looking forward to connecting,
Juan.`;

// ═══════════════════════════════════════════════════════════════
// MASTER PROMPT 4 — MARKET ACCELERATION
// ═══════════════════════════════════════════════════════════════
const PROMPT_MARKET_ACCELERATION = `🚀 MASTER PROMPT – Market Acceleration Cover Letter (SWL Consulting Version)

🎯 General Considerations
Write a professional, persuasive cover letter for applying to a new position on Upwork related to Market Acceleration — sales, CRM, marketing automation, lead generation, campaign management, or digital growth.

You must carefully read:
● The JOB POST
● The LIST OF SERVICES we offer
● My CV
● SPECIFIC COMMENTS FOR THIS JOB POST
● This MASTER PROMPT describing the structure and writing style.

Then generate a final, polished cover letter that follows the structure exactly, integrates my experience, and addresses the client's needs precisely.

Do not include comments, disclaimers, or notes. The output must always be the final, client-ready version only.

🎯 Goals
● Capture attention from the first line with immediate alignment to the client's objective.
● Communicate deep understanding of growth, sales, and marketing operations.
● Validate SWL Consulting and Juan's personal experience in one cohesive narrative.
● Present clear, results-driven value that makes the client want to reply.
● End with a confident call to action inviting a meeting or interview.

📌 Key Inputs
● JOB POST:
● CV:
● List of Services:
● Specific Comments for the Job Post:

📌 General Writing Requirements
● Tone: strategic, data-driven, fluent, and persuasive.
● Avoid fluff or vague marketing language.
● 300–350 words total.
● Match the language of the job post (English or Spanish).
● Use clear paragraphs and natural transitions (no hyphens or em dashes).
● Signature: always Juan at the end.
● Use "we" to represent SWL Consulting, but mix "I/we" when contextually natural.
● Do not include assumptions or meta text.

📄 COVER LETTER STRUCTURE

1. Welcome Greeting (Paragraph 1)
Goal: Establish connection and credibility in the first two sentences.

Instructions:
● Warm, confident greeting.
● Mention one key element or objective from the job post (pain point, campaign goal, CRM setup, etc.).
● Use "we."
● Max 2 sentences (50–60 words).

Examples:
Hi there, it's great to connect. We've helped businesses build high-performing outreach systems and data-driven campaigns, so your focus on optimizing lead generation and CRM performance instantly resonated with us.

Hi there, thank you for sharing this opportunity. We bring proven experience managing sales automation, email marketing, and analytics at scale, which aligns directly with your current growth goals.

2. Initial Hook (Paragraph 2)
Goal: Show that we understand their challenge and already know how to solve it.

Instructions:
● Empathize with their main issue (scaling leads, tracking conversions, aligning marketing & sales).
● Frame SWL as a partner who designs, builds, and optimizes systems that deliver measurable growth.

Examples:
We know how complex it can be to coordinate marketing, sales, and data while maintaining consistency across tools. That's exactly where we specialize, turning scattered systems into predictable, automated growth engines that increase qualified leads and shorten sales cycles.

It's clear you're looking for more than campaign management, you need an integrated partner who understands data, automation, and conversion dynamics. We've helped companies do exactly that by combining CRM precision, email automation, and performance analytics into cohesive growth ecosystems.

3. SWL Consulting Introduction (Paragraph 3)
Goal: Introduce SWL before Juan's background, establishing the firm's credibility first.

Instructions:
● Describe SWL's scope and mission clearly: AI-First advisory firm integrating strategy, automation, and analytics for growth.
● Mention tools and domains (Salesforce, HubSpot, Zoho, Instantly, Mailchimp, Klaviyo, Apollo, LinkedIn automation, Ads, Looker Studio).
● 6–8 lines total.

Example:
SWL Consulting is an AI-First advisory firm helping organizations build scalable growth systems across sales, marketing, and customer success. Our team combines technical expertise and strategic insight to design automated lead funnels, CRM architectures, and data dashboards that accelerate performance. We implement and optimize platforms such as Salesforce, HubSpot, Zoho, Instantly, Maildoso, Klaviyo, Mailchimp, Apollo, LinkedIn Sales Navigator, and Phantombuster, integrating them with ad campaigns and Looker Studio dashboards to deliver full visibility and control.

4. Strong Fit – Build Respect and Authority (Paragraph 4)
Goal: Present Juan's background as the leadership engine behind SWL's results.

Instructions:
● Mention MBA, Master in Finance, FMVA certification.
● Link major roles (Managing Director, Head of Investments, CFO) to sales, marketing, and growth.
● Show that experience allows leading data-driven growth initiatives with measurable outcomes.

Example:
I hold an MBA, a Master's in Finance, and the FMVA certification, combining analytical rigor with strategic leadership. As Managing Director for a global consulting firm, I built and led revenue acceleration programs using AI-powered analytics and automation. As CFO of a SaaS company, I implemented performance dashboards and conversion tracking that improved marketing ROI by over 40%. As Head of Investments at a media & entertainment fund, I led data initiatives that optimized campaign performance across multiple channels. These experiences directly align with the scope of [specific project/task from job post].

5. What We Can Bring to This Project (Bulleted List)
Goal: Translate capabilities into clear, results-oriented contributions.

Examples:
● Designing integrated sales and marketing funnels that drive consistent qualified leads.
● Implementing CRM workflows and automation in Salesforce or HubSpot to reduce manual work.
● Running multi-channel campaigns (email, LinkedIn, ads) with advanced A/B testing.
● Building performance dashboards in Looker Studio for real-time analytics and reporting.
● Optimizing outreach strategies that improve open rates, reply rates, and conversion efficiency.

6. Next Steps (Paragraph 6)
Goal: Explain how collaboration would start.

Examples:
To get started, we suggest a short discovery session to review your current funnel structure, CRM setup, and campaign goals. From there, we'll outline a clear roadmap focused on quick performance wins and long-term growth optimization.

The best starting point would be a brief audit of your sales and marketing systems to identify immediate opportunities for automation, targeting, and data alignment.

7. Call to Action (Paragraph 7)
Goal: Prompt the client to act now.

Examples:
We'd love to explore how our approach could accelerate your lead generation and marketing performance. Let's coordinate a brief call to align on your objectives and next steps.

I look forward to discussing your goals in more detail and showing how we can create measurable impact through smarter systems and campaigns.

8. Friendly and Strategic Closing (Paragraph 8)
Goal: End with warmth and professionalism.

Examples:
Looking forward to connecting.
Best,
Juan`;

// ═══════════════════════════════════════════════════════════════
// SELECCIÓN POR BU
// ═══════════════════════════════════════════════════════════════
// Los 4 prompts pegados juntos — el modelo lee todos y aplica el más relevante al job
const selectedPrompt = `${PROMPT_CORPORATE_ADVISORY}

═══════════════════════════════════════════════════════════════

${PROMPT_BUSINESS_MASTERY}

═══════════════════════════════════════════════════════════════

${PROMPT_AUTOMATION_BI}

═══════════════════════════════════════════════════════════════

${PROMPT_MARKET_ACCELERATION}`;

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT FINAL — PROMPT SELECCIONADO + CONTEXTO BU + PRECEDENT
// ═══════════════════════════════════════════════════════════════
const systemPrompt = `${selectedPrompt}

## SWL Business Unit context: ${bu.name || 'unknown'}
${bu.description || ''}
Scopes: ${(bu.scopes || []).join(' · ')}
Keywords: ${(bu.keywords || []).slice(0, 25).join(', ')}
Good-fit signals: ${bu.good_fit_signals || ''}

${precedent.length ? `## Recent Sent precedent (reference for tone/depth, do not copy)\n\n${precedentBlock}` : '## Recent Sent precedent\n(none yet)'}`;

const userPrompt = [
  '## JOB POST',
  `Title: ${job.title}`,
  `Industry: ${job.industry || 'n/a'}`,
  `Client location: ${job.country || 'n/a'}`,
  `Duration: ${job.duration || 'n/a'}`,
  `Hourly rate: $${job.hourly_average}/h`,
  '',
  'Description:',
  job.description || '(no description)',
].join('\n');

return { json: { job_id: job.id, systemPrompt, userPrompt } };
```

---

## ✅ Verificación después de pegar

Antes de salir del nodo, verificá:
- ✅ No hay errores rojos en el editor
- ✅ Líneas 1-9: las mismas de siempre (job, bu, precedent)
- ✅ Aparecen las 4 constantes `PROMPT_CORPORATE_ADVISORY`, `PROMPT_BUSINESS_MASTERY`, `PROMPT_AUTOMATION_BI`, `PROMPT_MARKET_ACCELERATION`
- ✅ Aparece la constante `BU_TO_PROMPT`
- ✅ El return final tiene `{ json: { job_id, systemPrompt, userPrompt } }`

## 🧪 Test inmediato

Una vez pegado y guardado:

```bash
curl -X POST https://n8n.srv949269.hstgr.cloud/webhook/brain-cover-letter \
  -H "Content-Type: application/json" \
  -d '{"job_id": "5f60b9f9-f4c4-459e-8f30-4ac329ff0b70"}'
```

Job de **Fractional CMO healthcare** ($80/h, BU: Marketing & Brand → debería usar **Market Acceleration prompt**).

Después corremos otro test con un job de finance para validar que selecciona Corporate Advisory.

## 💰 Costo esperado

- ~$0.022 por cover letter (mismo que v6 porque solo se manda 1 prompt al modelo, no los 4)
- A 10/día: ~$0.22/día / ~$6/mes
