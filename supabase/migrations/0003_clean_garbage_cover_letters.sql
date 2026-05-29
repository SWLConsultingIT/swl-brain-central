-- Limpia cover_letter "basura": strings tipo "Untitled (https://www.notion.so/...)"
-- que vinieron del CSV de Notion como links a subpages NO exportadas, no como CL reales.
--
-- Pre-check (2026-05-29):
--   12.402 proposals total
--    2.564 con cover_letter lleno
--    2.564 empiezan con "Untitled (" y contienen "notion.so"
--        0 cover_letters reales
--
-- Por lo tanto este UPDATE setea a NULL toda la basura sin perder data útil.
-- Reversible: el CSV original sigue en el repo (CRM UPWORK *.csv) si hace falta re-importar.

update proposals
set    cover_letter = null
where  cover_letter like 'Untitled (%';
