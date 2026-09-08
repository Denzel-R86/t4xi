-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: bookings.quote_id — vroege quote-koppeling
-- Versie: 20260730140000
--
-- GERECONSTRUEERD BESTAND (Phase 6.2, 2026-08-28) — LEES DIT EERST
--   Deze migratie is op 2026-07-30 op STAGING toegepast, maar:
--     • het bestand heeft nooit in de repository bestaan (git-historie
--       doorzocht over alle branches);
--     • de database bewaarde GEEN `statements`, dus de oorspronkelijke SQL is
--       niet meer op te halen;
--     • productie kent deze versie niet.
--
--   Wat wél bewijsbaar is uit het schema van staging: de kolom
--   `bookings.quote_id` en de foreign key `bookings_quote_id_fkey` bestaan er
--   sinds die datum. De overige onderdelen van de latere quote-lock
--   (`price_snapshots.consumed_at`, `price_snapshots.booking_id`, de unieke
--   index `bookings_quote_id_key` en `create_booking_from_snapshot`) ontbraken
--   juist — dit was dus een VROEGE, GEDEELTELIJKE voorloper van
--   20260808111336_booking_quote_lock.sql, dat de volledige functionaliteit
--   levert en deze effecten volledig omvat.
--
--   Dit bestand legt uitsluitend die bewezen effecten vast, idempotent, zodat:
--     • de migratiehistorie van staging weer een bestand in de repo heeft en
--       `supabase db push` niet langer blokkeert op een onbekende versie;
--     • herhaald uitvoeren op welk project dan ook een no-op is.
--
--   Het is NADRUKKELIJK geen kopie van de oorspronkelijke SQL. Wie de echte
--   quote-lock wil begrijpen: 20260808111336 is de migratie die telt.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table public.bookings
  add column if not exists quote_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_quote_id_fkey') then
    alter table public.bookings
      add constraint bookings_quote_id_fkey
      foreign key (quote_id) references public.price_snapshots(quote_id) on delete set null;
  end if;
end $$;

commit;
