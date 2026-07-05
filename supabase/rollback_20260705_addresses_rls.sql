-- ROLLBACK voor migratie 20260705_fix_addresses_rls (rev. 2)
--
-- ⚠️  LET OP: dit herstelt de OUDE, ONVEILIGE situatie — inclusief het
--     RLS-lek waarbij anon alle rijen in public.addresses kan updaten.
--     Alleen gebruiken als noodmaatregel bij een productie-incident,
--     en daarna direct opnieuw naar een veilige oplossing.
--
-- Herstelt exact de staat van vóór de migratie (geverifieerd tegen
-- pg_policies dump van 2026-07-05), met één bewuste afwijking:
-- de search_path van increment_address_usage blijft vastgezet —
-- die terugzetten naar mutable zou alleen de advisor-warning
-- heropenen zonder iets te repareren.
--
-- Idempotent: veilig om meerdere keren te draaien.

BEGIN;

-- 1. Nieuwe insert-policy weghalen
DROP POLICY IF EXISTS "addresses_insert_validated_anon" ON public.addresses;

-- 2. Oorspronkelijke (onbeperkte) insert-policy terugzetten
DROP POLICY IF EXISTS "addresses_write_anon" ON public.addresses;
CREATE POLICY "addresses_write_anon"
  ON public.addresses
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 3. Oorspronkelijke (open) update-policy terugzetten  ⚠️ dit is het lek
DROP POLICY IF EXISTS "addresses_update_anon" ON public.addresses;
CREATE POLICY "addresses_update_anon"
  ON public.addresses
  FOR UPDATE
  TO anon, authenticated
  USING (true);

-- 4. Functie terug naar SECURITY INVOKER (search_path blijft bewust vastgezet)
ALTER FUNCTION public.increment_address_usage(uuid)
  SECURITY INVOKER
  SET search_path = 'public';

-- 5. Index verwijderen
DROP INDEX IF EXISTS public.idx_popular_locations_address_id;

COMMIT;
