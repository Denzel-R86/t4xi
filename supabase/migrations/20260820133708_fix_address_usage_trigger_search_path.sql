-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: increment_address_usage() hardenen (search_path + rechten)
-- Versie: 20260820133708
--
-- REPOSITORY RECOVERY (Phase 6.2, 2026-08-28)
--   Deze migratie is op 2026-08-20 op PRODUCTIE toegepast maar ontbrak in de
--   repository. De SQL hieronder is LETTERLIJK teruggehaald uit de opgeslagen
--   `statements` in supabase_migrations.schema_migrations van het
--   productieproject — niet gereconstrueerd uit geheugen en niet afgeleid uit
--   het schema.
--
--   Toegepast op productie: ja (2026-08-20)
--   Toegepast op staging:   nee — wordt hiermee alsnog uitgelijnd
--
--   Idempotent: `alter function`, `revoke` en `grant` mogen herhaald worden
--   zonder effect.
-- ═══════════════════════════════════════════════════════════════════════════

begin;
alter function public.increment_address_usage(uuid)
  security invoker
  set search_path = pg_catalog, public;
revoke all on function public.increment_address_usage(uuid)
  from public, anon, authenticated;
grant execute on function public.increment_address_usage(uuid)
  to service_role;
commit;
