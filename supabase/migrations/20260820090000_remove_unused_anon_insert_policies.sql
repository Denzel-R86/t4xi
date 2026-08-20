-- Audit-hardening 2026-08-20
--
-- De publieke website schrijft uitsluitend via server-side API-routes met de
-- service-role. Directe inserts door anon/authenticated zijn daarom onnodig en
-- vergroten de impact wanneer een publieke Supabase-key ooit wordt misbruikt.

BEGIN;

DROP POLICY IF EXISTS "bookings_insert_anon" ON public.bookings;
DROP POLICY IF EXISTS "addresses_insert_validated_anon" ON public.addresses;

COMMIT;
