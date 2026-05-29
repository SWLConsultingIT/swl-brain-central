-- Brain Central — Seeds business_units (regenerado desde Supabase post-merge)
-- 8 BU cards con template de 7 secciones del usuario.
-- Correr DESPUÉS de schema.sql.
-- Idempotente: usa ON CONFLICT DO UPDATE.
-- Última actualización: 2026-05-29 (post-merge de tools en keywords).


-- ═══════════════════════════════════════════════════════════════════
-- AI & Automation
-- ═══════════════════════════════════════════════════════════════════
insert into business_units (name, description, scopes, keywords, good_fit_signals, red_flags, decision_logic)
values (
  'AI & Automation',
  'Trabajos relacionados con AI consulting, machine learning, chatbots, LLMs, AI agents, RAG, prompt engineering y automatizaciones inteligentes para mejorar eficiencia, reducir costos y generar ventajas competitivas.',
  array['AI consulting and strategy (roadmap, opportunity assessment)', 'Predictive models and applied machine learning (forecasting, churn, classification)', 'Chatbot implementation and LLM fine-tuning', 'AI-driven business tools and decision-support systems', 'Intelligent multi-step agents (LangChain, LangGraph, AutoGen)', 'n8n-based agent workflows', 'RAG implementations (knowledge bases, doc Q&A, internal AI assistants)', 'AI knowledge sharing, team training and prompt engineering', 'Competitive intelligence AI platforms'],
  array['AI', 'artificial intelligence', 'machine learning', 'LLM', 'NLP', 'Python', 'AI agent', 'LangChain', 'LangGraph', 'AutoGen', 'RAG', 'prompt engineering', 'MCP', 'n8n', 'chatbot', 'embeddings', 'Pinecone', 'Weaviate', 'ChromaDB', 'Supabase', 'OpenAI', 'Anthropic', 'Claude', 'GPT', 'fine-tuning', 'automation', 'Make', 'Zapier', 'AWS', 'Azure', 'FastAPI', 'Flask', 'Docker', 'Pandas', 'NumPy', 'Scikit-learn', 'Synthflow'],
  'Empresa con datos para entrenar, problema definido a automatizar/predecir, presupuesto para AI, equipo técnico colaborador, scope claro (chatbot, agent, predictive model, RAG), openness a iteración.',
  'Cliente con "quiero AI pero no sé para qué", scope poco claro, ticket bajo, sin acceso a datos, expectativa de "magia" sin estrategia, requerimientos contradictorios.',
  'Qualified si el proyecto tiene problema definido a resolver con AI, datos disponibles o pipeline factible, ticket suficiente y cliente abierto a soluciones iterativas.'
)
on conflict (name) do update set
  description = excluded.description,
  scopes = excluded.scopes,
  keywords = excluded.keywords,
  good_fit_signals = excluded.good_fit_signals,
  red_flags = excluded.red_flags,
  decision_logic = excluded.decision_logic;

-- ═══════════════════════════════════════════════════════════════════
-- Business Operations & Back-Office
-- ═══════════════════════════════════════════════════════════════════
insert into business_units (name, description, scopes, keywords, good_fit_signals, red_flags, decision_logic)
values (
  'Business Operations & Back-Office',
  'Trabajos relacionados con back-office, operaciones, bookkeeping, payroll, HR admin, ERP implementation, supply chain, inventory management, SOPs y documentación de procesos para optimizar la estructura interna y reducir fricción operativa.',
  array['Full bookkeeping and accounting support (R2R, bank reconciliation, invoicing)', 'Virtual assistance and documentation control', 'Supply chain, inventory and warehouse management', 'Payroll and HR administration (records, onboarding/offboarding)', 'ERP implementation (Odoo, QuickBooks, NetSuite, ServiceTitan, Xfin)', 'Invoice automation and Quote-to-Cash (Q2C)', 'SOPs and process documentation', 'Operational efficiency optimization'],
  array['back-office', 'operations', 'bookkeeping', 'payroll', 'HR', 'ERP implementation', 'inventory management', 'supply chain', 'warehouse', 'procurement', 'vendor management', 'SOPs', 'process documentation', 'virtual assistant', 'invoice automation', 'Odoo', 'NetSuite', 'ServiceTitan', 'Xfin', 'QuickBooks', 'Xero', 'treasury', 'revenue management', 'Notion', 'Google Drive', 'Clockify', 'Docusign', 'Wave', 'Float App'],
  'SME con procesos manuales, falta de SOPs, ERP sin implementar, equipo administrativo desbordado, necesidad de automatizar back-office, supply chain desordenado, necesidad de documentación de procesos.',
  'Solo data entry puntual, sin acceso a herramientas, ticket muy bajo, cliente busca un VA básico sin transformación de procesos, scope demasiado puntual y administrativo.',
  'Qualified si el proyecto involucra optimización de procesos, implementación de sistemas o automatización de back-office con ticket suficiente y potencial de impacto operativo sostenido.'
)
on conflict (name) do update set
  description = excluded.description,
  scopes = excluded.scopes,
  keywords = excluded.keywords,
  good_fit_signals = excluded.good_fit_signals,
  red_flags = excluded.red_flags,
  decision_logic = excluded.decision_logic;

-- ═══════════════════════════════════════════════════════════════════
-- Digital Experience & Product Development
-- ═══════════════════════════════════════════════════════════════════
insert into business_units (name, description, scopes, keywords, good_fit_signals, red_flags, decision_logic)
values (
  'Digital Experience & Product Development',
  'Trabajos relacionados con web development, e-commerce, app development, UX/UI optimization, custom SaaS, CRM implementations y digital architecture para mejorar presencia digital, eficiencia operativa y capacidades tecnológicas.',
  array['Web development and maintenance (WordPress, Webflow, Framer, Wix)', 'E-commerce platform implementation (Shopify, WooCommerce, Amazon, Magento)', 'App development and MVP launch (mobile + web)', 'UX/UI optimization and digital experience design (Figma prototyping)', 'CRM and tech implementations (HubSpot, Notion, Salesforce, Odoo)', 'Custom SaaS products, internal tools, plugins, digital platforms', 'Digital architecture and systems design (scalable, modular)', 'Automated sales solutions (TikTok shop, omnichannel)', 'Performance optimization (page speed, SEO technical, security)'],
  array['web development', 'Webflow', 'Framer', 'WordPress', 'Wix', 'Shopify', 'WooCommerce', 'e-commerce', 'app development', 'UX/UI', 'Figma', 'Cursor', 'Claude', 'Lovable', 'V0', 'Bolt', 'Retool', 'CRM implementation', 'SaaS', 'MVP', 'landing page', 'HubSpot', 'Notion', 'Salesforce', 'Hotjar', 'Google Analytics', 'Supabase', 'n8n'],
  'Sitio actual obsoleto, ecommerce sin optimización, MVP con presupuesto, necesidad de admin/internal tool, equipo con visión clara de UX/producto, ticket recurrente posible.',
  'Solo "armame una landing barata", cliente quiere copy 1-a-1 de Amazon o un marketplace completo, ticket bajo, scope cambiante, sin claridad de stack, expectativa de plazos imposibles.',
  'Qualified si el proyecto involucra desarrollo serio, e-commerce con estrategia, MVP con presupuesto definido o internal tools con ticket suficiente y stack viable.'
)
on conflict (name) do update set
  description = excluded.description,
  scopes = excluded.scopes,
  keywords = excluded.keywords,
  good_fit_signals = excluded.good_fit_signals,
  red_flags = excluded.red_flags,
  decision_logic = excluded.decision_logic;

-- ═══════════════════════════════════════════════════════════════════
-- Finance & Accounting
-- ═══════════════════════════════════════════════════════════════════
insert into business_units (name, description, scopes, keywords, good_fit_signals, red_flags, decision_logic)
values (
  'Finance & Accounting',
  'Trabajos relacionados con planificación financiera, budgeting, forecasting, reporting, control de gestión, cash flow, accounting cleanup, ERP/accounting systems, fractional CFO support y mejora de visibilidad financiera para SMEs.',
  array['FP&A and budgeting as fractional CFO for SMEs', 'Cash flow forecasting and management reporting', 'Accounting cleanup and month-end close support', 'ERP/accounting system setup or improvement', 'Financial dashboards and KPI reporting', 'Invoice, expense and reconciliation automation'],
  array['FP&A', 'budgeting', 'forecast', 'cash flow', 'CFO', 'fractional CFO', 'accounting', 'bookkeeping', 'month-end close', 'reporting', 'dashboard', 'KPI', 'QuickBooks', 'Xero', 'Odoo', 'ERP', 'financial model', 'P&L', 'balance sheet', 'reconciliation', 'NetSuite', 'Fathom HQ', 'Floatapp', 'Power BI', 'Looker Studio', 'BigQuery', 'Google Sheets', 'Finmark', 'LivePlan'],
  'SME, proceso financiero manual, falta de visibilidad, reportes en Excel, budgeting desordenado, necesidad de dashboard, integración con ERP/accounting software, cash flow difícil de controlar.',
  'Solo data entry barato, bookkeeping muy básico sin automatización, ticket bajo, sin acceso a datos, cliente buscando solo una tarea administrativa puntual.',
  'Qualified si el proyecto tiene pain financiero claro, potencial de automatización/reporting, ticket suficiente y posibilidad de generar valor operativo o financiero.'
)
on conflict (name) do update set
  description = excluded.description,
  scopes = excluded.scopes,
  keywords = excluded.keywords,
  good_fit_signals = excluded.good_fit_signals,
  red_flags = excluded.red_flags,
  decision_logic = excluded.decision_logic;

-- ═══════════════════════════════════════════════════════════════════
-- Marketing & Brand
-- ═══════════════════════════════════════════════════════════════════
insert into business_units (name, description, scopes, keywords, good_fit_signals, red_flags, decision_logic)
values (
  'Marketing & Brand',
  'Trabajos relacionados con marketing digital, brand strategy, content planning, paid ads, SEO, growth marketing y marketing analytics para aumentar visibilidad, engagement y crecimiento sostenible.',
  array['Social media management (Instagram, LinkedIn, TikTok, YouTube)', 'Content planning and creative direction (calendar, pillar strategy)', 'Brand identity and marketing strategy (brandbook, positioning)', 'SEO, SEM and online presence optimization', 'Digital advertising (Google Ads, Meta, TikTok Ads, LinkedIn Ads)', 'Growth marketing strategy (inbound, demand generation, funnel)', 'Marketing analytics and conversion tracking (GA4, attribution)', 'Social media automation (Metricool, Buffer, Hootsuite)'],
  array['social media', 'content', 'brand identity', 'SEO', 'SEM', 'Google Ads', 'Meta Ads', 'TikTok Ads', 'LinkedIn Ads', 'campaign outreach', 'Metricool', 'Supermetrics', 'Canva', 'Gamma', 'GA4', 'Google Analytics', 'growth marketing', 'demand generation', 'marketing analytics', 'content calendar', 'Midjourney', 'Hootsuite', 'Buffer', 'SEMrush', 'Exploding Topics'],
  'Marca sin estrategia digital clara, ads sin gestión profesional, content esporádico, sin medición de performance, presupuesto recurrente para ads, brand inconsistente entre canales.',
  'Solo diseño gráfico puro sin estrategia, cliente busca un "creativo" para una sola pieza, ticket muy bajo, scope puramente tactical sin estrategia, expectativa de viralidad garantizada.',
  'Qualified si el proyecto involucra estrategia, gestión continua o stack tecnológico de marketing con ticket suficiente y oportunidad de impacto sostenido.'
)
on conflict (name) do update set
  description = excluded.description,
  scopes = excluded.scopes,
  keywords = excluded.keywords,
  good_fit_signals = excluded.good_fit_signals,
  red_flags = excluded.red_flags,
  decision_logic = excluded.decision_logic;

-- ═══════════════════════════════════════════════════════════════════
-- Project Management & BI
-- ═══════════════════════════════════════════════════════════════════
insert into business_units (name, description, scopes, keywords, good_fit_signals, red_flags, decision_logic)
values (
  'Project Management & BI',
  'Trabajos relacionados con project management, BI reporting, KPI dashboards, data analytics, data science y visualización de datos para acompañar la ejecución de proyectos y la toma de decisiones basada en datos.',
  array['End-to-end project management and SOW execution (milestones, delivery tracking)', 'BI dashboards and KPI reporting (weekly/monthly executive reports)', 'Data analytics, data science and predictive analytics', 'Account management and client feedback intelligence', 'Executive insights and leadership dashboards', 'Dashboard development (Power BI, Looker Studio, Google Sheets)', 'Data pipeline and database management (BigQuery, SQL)'],
  array['project management', 'business intelligence', 'BI', 'dashboard', 'reporting', 'KPI', 'data analytics', 'data science', 'Power BI', 'Looker Studio', 'Tableau', 'BigQuery', 'SQL', 'data analyst', 'visualization', 'account management', 'PMP', 'scrum', 'agile', 'Notion', 'Monday', 'Asana', 'ClickUp', 'Jira', 'Miro', 'Google Sheets', 'Klipfolio', 'Odoo'],
  'Empresa sin visibilidad sobre KPIs, dashboards faltantes, decisiones tomadas sin data, equipo necesita reporting estructurado, datos dispersos en herramientas distintas, project tracking ad-hoc.',
  'Solo "armame un Excel" sin contexto, ticket muy bajo, cliente quiere alguien para data entry repetitivo, sin acceso a datos fuente, scope muy puntual y operativo.',
  'Qualified si el proyecto requiere análisis estratégico, dashboard development o integración de datos con ticket suficiente y posibilidad de impacto en decisiones de negocio.'
)
on conflict (name) do update set
  description = excluded.description,
  scopes = excluded.scopes,
  keywords = excluded.keywords,
  good_fit_signals = excluded.good_fit_signals,
  red_flags = excluded.red_flags,
  decision_logic = excluded.decision_logic;

-- ═══════════════════════════════════════════════════════════════════
-- Sales & Customer Success
-- ═══════════════════════════════════════════════════════════════════
insert into business_units (name, description, scopes, keywords, good_fit_signals, red_flags, decision_logic)
values (
  'Sales & Customer Success',
  'Trabajos relacionados con CRM optimization, lead generation, multi-channel outreach, sales playbooks, customer success y growth strategies para impulsar adquisición, conversión y retención de clientes.',
  array['CRM setup and pipeline intelligence (GoHighLevel, Kommo, HubSpot, Salesforce)', 'Multi-channel acquisition (email, LinkedIn, WhatsApp/SMS, cold calling)', 'Go-to-Market execution and sales architecture (GTM strategy, playbooks)', 'Customer success and retention frameworks (NPS, churn, onboarding)', 'Lead generation and qualification (Apollo, Clay, Clearbit, ZoomInfo)', 'Sales process optimization (sequences, templates, cadences)', 'Commercial playbooks (messaging frameworks, sales scripts)', 'Upselling and cross-selling programs'],
  array['CRM', 'Salesforce', 'HubSpot', 'GoHighLevel', 'Kommo', 'Zoho', 'lead generation', 'email marketing', 'outreach', 'Apollo', 'Clay', 'Clearbit', 'ZoomInfo', 'Instantly', 'Manyreach', 'Smartlead', 'Lemlist', 'GTM', 'go-to-market', 'sales playbook', 'customer success', 'NPS', 'churn', 'retention', 'pipeline', 'Twilio', 'Bounceban', 'Mailchimp', 'ConvertKit', 'Aircall', 'Gong'],
  'Equipo sin CRM o con CRM mal usado, pipeline sin estructura, outreach manual, falta de playbooks comerciales, customer success ad-hoc, ticket promedio decente, presupuesto para herramientas.',
  'Cliente busca solo "que le manden emails fríos", scope demasiado puntual (1 sequence), ticket bajo, sin presupuesto para herramientas, sin acceso al CRM, expectativa de leads garantizados.',
  'Qualified si el proyecto involucra setup de sistema, estrategia de GTM o automatización del proceso comercial con ticket suficiente y openness a estrategia integral.'
)
on conflict (name) do update set
  description = excluded.description,
  scopes = excluded.scopes,
  keywords = excluded.keywords,
  good_fit_signals = excluded.good_fit_signals,
  red_flags = excluded.red_flags,
  decision_logic = excluded.decision_logic;

-- ═══════════════════════════════════════════════════════════════════
-- System Integrations
-- ═══════════════════════════════════════════════════════════════════
insert into business_units (name, description, scopes, keywords, good_fit_signals, red_flags, decision_logic)
values (
  'System Integrations',
  'Trabajos relacionados con integraciones custom, automatizaciones, data flows y conexiones entre CRM, ERP, BI, marketing, finanzas y operaciones para mejorar productividad, reducir tiempo operativo y asegurar cohesión tecnológica.',
  array['System architecture design (end-to-end integration architecture)', 'CRM ↔ ERP ↔ BI ↔ Marketing ↔ Finance ↔ Operations integrations', 'Workflow automation (n8n, Make, Zapier)', 'Data management and migration (database design, data cleaning, pipelines)', 'Monitoring and maintenance (alerts, uptime tracking)', 'Web scraping and enrichment (Apify, PhantomBuster, SalesQL)', 'Database management (SQL, BigQuery, Supabase, Airtable)', 'CRM and tech stack implementations (HubSpot, Notion, Odoo, GoHighLevel)'],
  array['integration', 'automation', 'n8n', 'Zapier', 'Make.com', 'Power Automate', 'API', 'webhook', 'data pipeline', 'scraping', 'Airtable', 'Softr', 'BigQuery', 'Supabase', 'SQL', 'MySQL', 'database', 'data migration', 'system architecture', 'CRM integration', 'Apify', 'PhantomBuster', 'Make', 'Pinecone', 'SalesQL', 'Clearbit', 'ZoomInfo', 'Postman', 'Figma', 'Lucid', 'Notion', 'HubSpot', 'Salesforce', 'Odoo'],
  'Múltiples herramientas sin integrar, data en silos, procesos manuales repetitivos, equipo gastando horas en copy-paste, presupuesto para automatizar, stack claro pero desconectado.',
  'Scope muy puntual (1 zap), ticket bajo, sin acceso a las herramientas a integrar, cliente sin entendimiento técnico básico, expectativa de "una integración mágica" sin specs.',
  'Qualified si el proyecto involucra arquitectura de integraciones, automatización end-to-end o data pipelines con ticket suficiente y herramientas accesibles.'
)
on conflict (name) do update set
  description = excluded.description,
  scopes = excluded.scopes,
  keywords = excluded.keywords,
  good_fit_signals = excluded.good_fit_signals,
  red_flags = excluded.red_flags,
  decision_logic = excluded.decision_logic;
