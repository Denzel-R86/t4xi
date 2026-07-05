-- Migratie: dicht kritiek RLS-lek op public.addresses (audit 2026-07-05, rev. 2)
--
-- Probleem:
--   * addresses_update_anon gaf anon UPDATE-rechten op ALLE rijen (USING true)
--   * addresses_write_anon stond onbeperkt INSERT toe (WITH CHECK true)
--
-- Nieuw model:
--   * anon kan bestaande adressen NIET meer direct updaten
--   * anon mag alleen adressen inserten die uit een echte bron komen:
--     PDOK (bag_id aanwezig) of Google Places / reverse geocode (per source-enum)
--     — 'manual' en 'pre_seeded' zijn voorbehouden aan service_role
--   * usage-statistieken lopen via increment_address_usage(), die
--     SECURITY DEFINER wordt met vastgezette search_path (lost tegelijk
--     de advisor-warning "mutable search_path" voor deze functie op)
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door owner, daarna:
--   supabase db push   (of via MCP apply_migration)

BEGIN;

-- 1. Verwijder het lek: directe anon-updates op addresses
DROP POLICY IF EXISTS "addresses_update_anon" ON public.addresses;

-- 2. Vervang onbeperkte insert door bron-gevalideerde insert
--    (drop van de eigen policy eerst, zodat de migratie idempotent is)
DROP POLICY IF EXISTS "addresses_write_anon" ON public.addresses;
DROP POLICY IF EXISTS "addresses_insert_validated_anon" ON public.addresses;
CREATE POLICY "addresses_insert_validated_anon"
  ON public.addresses
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    is_active = true
    AND (
      (source = 'bag_pdok' AND bag_id IS NOT NULL)
      OR source IN ('google_places', 'reverse_geocode')
    )
  );

-- 3. Statistiek-updates via gecontroleerde functie i.p.v. open UPDATE-policy.
--    SECURITY DEFINER zodat de RPC blijft werken nu de anon-updatepolicy weg is;
--    search_path vastgezet (verplicht bij DEFINER, en dicht advisor-warning).
ALTER FUNCTION public.increment_address_usage(uuid)
  SECURITY DEFINER
  SET search_path = 'public';

-- 4. Ontbrekende index op foreign key (performance advisor)
CREATE INDEX IF NOT EXISTS idx_popular_locations_address_id
  ON public.popular_locations (address_id);

COMMIT;
