-- Migratie: service_role standaard toegang (fresh-DB reproduceerbaarheid)
-- ───────────────────────────────────────────────────────────────────────────
-- WAAROM
--   `service_role` is de VERTROUWDE, server-only Supabase-rol: hij bypasst RLS en
--   komt nooit in de browser. Standaard geeft Supabase deze rol volledige DML op
--   het public-schema. Op een verse (staging) DB kregen migratie-tabellen echter
--   GEEN service_role-grants (dezelfde ontbrekende-default-privileges als bij
--   anon), waardoor server-side routes met de service-role key faalden met
--   "permission denied for table bookings" (o.a. /api/payments/create-intent,
--   /api/payments/status, de webhook-verwerking en pricing_quote_logs).
--   Productie heeft deze grants wél (buiten-migratie gezet). Deze migratie
--   herstelt de Supabase-standaard zodat de databaselaag reproduceerbaar werkt.
--
-- SCOPE & VEILIGHEID
--   Uitsluitend `service_role` (server-only, bypasst RLS). GEEN wijziging aan
--   anon/authenticated — die blijven least-privilege (alleen SELECT op de vier
--   publieke read-tabellen uit 20260725100000). De ALTER DEFAULT PRIVILEGES zorgt
--   dat toekomstige migratie-tabellen deze gap niet opnieuw krijgen.

BEGIN;

-- Bestaande objecten
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Toekomstige objecten (voorkomt herhaling van de gap bij nieuwe tabellen)
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;

COMMIT;
