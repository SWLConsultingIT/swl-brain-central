-- Migration 0001 — Drop business_units.tools column
-- Razón: el template de 7 secciones del usuario no incluye `tools` como sección separada.
-- Las herramientas/plataformas (QuickBooks, Power BI, etc.) ya fueron mergeadas dentro
-- de la columna `keywords` por el script supabase/scripts/merge-tools-into-keywords.ts
-- Aplicado: 2026-05-29
-- Reversible: no (los datos ya viven en keywords).

alter table business_units drop column if exists tools;
