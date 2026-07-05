-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: hardening — vastgezette search_path op pricing_set_updated_at
-- Datum: 2026-07-06
--
-- Dicht de enige zelf-geïntroduceerde advisor-waarschuwing uit de vorige
-- migratie (function_search_path_mutable, WARN). Zelfde patroon als eerder
-- toegepast op public.increment_address_usage.
--
-- Alleen deze functie; geen andere objecten.
-- ═══════════════════════════════════════════════════════════════════════════

alter function public.pricing_set_updated_at() set search_path = '';
