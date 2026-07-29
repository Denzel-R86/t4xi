-- Migratie: publieke SELECT-grants voor de anon/authenticated read-laag
-- ───────────────────────────────────────────────────────────────────────────
-- WAAROM
--   De pricing-migraties maakten wél RLS-policies (`pricing_read_active_*`,
--   using active = true) maar nooit de onderliggende table-level GRANT SELECT.
--   In Supabase/Postgres is een read pas toegestaan bij GRANT **én** policy.
--   Productie kreeg die grants ooit buiten-migratie; een verse (staging) DB miste
--   ze, waardoor de anon read-client faalde met "permission denied for table …"
--   VÓÓRDAT RLS iets kon toestaan → elke quote eindigde als data_unavailable
--   ("Offerte op aanvraag").
--
-- LEAST-PRIVILEGE (bewuste keuze — niet blind productie kopiëren)
--   Alleen de tabellen die de PUBLIEKE/anon read-laag aantoonbaar leest via
--   supabase-js krijgen SELECT:
--     • locations, vehicle_classes, fixed_route_prices  — pricing-quote
--       (lib/pricing/service.ts, createPricingReadClient = anon)
--     • cities                                          — /tarieven rate-card
--       (lib/pricing/rate-card.ts embed fixed_route_prices → locations → cities)
--   RLS blijft de rij-bewaker: uitsluitend active = true wordt zichtbaar.
--
--   BEWUST GEEN grant (geen anon-callsite; blijven service-role/intern):
--     districts, airports, vehicles, pricing_rules, price_adjustments,
--     pricing_quote_logs, bookings, addresses, popular_locations,
--     address_search_cache.
--   (Adres-autocomplete leest PDOK + /api/places, niet deze tabellen via anon.)
--
-- VEILIGHEID
--   Uitsluitend GRANT SELECT. Geen INSERT/UPDATE/DELETE/ALL. Non-destructief en
--   idempotent (GRANT is herhaalbaar). Verandert geen RLS-policy en geen data.

BEGIN;

grant select on
  public.locations,
  public.vehicle_classes,
  public.fixed_route_prices,
  public.cities
to anon, authenticated;

COMMIT;
