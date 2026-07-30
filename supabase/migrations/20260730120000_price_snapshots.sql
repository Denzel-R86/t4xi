-- ───────────────────────────────────────────────────────────────────────────
-- Migratie: price_snapshots — persistente prijs-snapshot / quote-lock (PR 7.6.3B)
-- ───────────────────────────────────────────────────────────────────────────
-- WAAROM
--   Sprint 7.6 introduceert één bindende, herbruikbare prijsuitkomst: de klant
--   krijgt bij preview een `quote_id` terug; booking, Stripe, bevestiging, e-mail
--   en dashboard lezen daarna EXACT dezelfde snapshot (quote-lock). Zie het
--   ontwerp in docs/architecture/price-snapshot-contract.md (beslist 2026-07-30).
--
-- SCOPE & VEILIGHEID
--   PUUR ADDITIEF: één nieuwe tabel, geen wijziging aan bestaande objecten of data.
--   Deze migratie zet ALLEEN het datamodel neer. Er is nog GEEN runtimecode,
--   booking-logica, Stripe-afleiding of UI die deze tabel gebruikt — dat volgt in
--   7.6.3C+. Geld wordt in INTEGER CENTS bewaard (geen floats). RLS staat aan met
--   BEWUST GEEN anon/authenticated policy → uitsluitend service_role (server-only),
--   net als public.pricing_quote_logs. De snapshot is immutabel: service_role krijgt
--   SELECT/INSERT/DELETE maar GEEN UPDATE.
--
-- ROLLBACK (veilig — tabel wordt door geen enkele code gebruikt in 7.6.3B):
--   begin;
--     drop table if exists public.price_snapshots;
--   commit;
--
-- VALIDATIE: eerst op staging toepassen en de DROP-rollback bewijzen; productie
--   nooit blind muteren.
-- ───────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. TABEL ────────────────────────────────────────────────────────────────
create table if not exists public.price_snapshots (
  -- Ondoorzichtige, niet-oplopende identifier. App mag een UUID v7 meegeven;
  -- de default (v4) borgt dat inserts ook zonder app-side generatie slagen.
  quote_id        uuid primary key default gen_random_uuid(),

  -- Versie van de prijsregels/logica. Inert in 7.6.3 (opgeslagen, geen branch-logica).
  pricing_version text not null,

  -- Herkomst van de prijs. Vandaag altijd 'fixed_route_prices'; forward-compatible.
  pricing_source  text not null default 'fixed_route_prices'
                    check (pricing_source in (
                      'fixed_route_prices', 'dynamic', 'manual',
                      'hotel_rate', 'airport_rate', 'contract_rate', 'promotion'
                    )),

  currency        text not null default 'EUR' check (currency = 'EUR'),

  -- ── Geld: uitsluitend integer cents ──
  subtotal_cents  integer not null check (subtotal_cents >= 0),
  adjustments     jsonb   not null default '[]'::jsonb
                    check (jsonb_typeof(adjustments) = 'array'),
  total_cents     integer not null check (total_cents >= 0),

  -- Volledige reconstructie van de rit los van de huidige tarieftabel.
  route_snapshot  jsonb   not null check (jsonb_typeof(route_snapshot) = 'object'),

  -- Tijdstempels: wanneer BEREKEND, wanneer VERLOPEN (15-min quote-lock), wanneer VASTGELEGD.
  calculated_at   timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '15 minutes'),
  created_at      timestamptz not null default now(),

  -- Invariant: zonder adjustments moet total == subtotal. De volledige som-invariant
  -- (total == subtotal + Σ adjustments) volgt in 7.6.3C zodra adjustments echt
  -- gevuld worden. De guard vermijdt een runtime-fout als adjustments geen array is
  -- (die wordt al door de kolom-check afgekeurd).
  constraint price_snapshots_total_matches_subtotal_when_empty
    check (
      jsonb_typeof(adjustments) <> 'array'
      or jsonb_array_length(adjustments) > 0
      or total_cents = subtotal_cents
    ),

  constraint price_snapshots_expiry_after_calc
    check (expires_at > calculated_at)
);

-- ── 2. INDEXEN (voor de latere opschoning/GC in 7.6.3C+) ────────────────────
create index if not exists price_snapshots_expires_at_idx on public.price_snapshots(expires_at);
create index if not exists price_snapshots_created_at_idx on public.price_snapshots(created_at);

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
-- RLS aan, BEWUST GEEN anon/authenticated policy → deny-by-default. Alle toegang
-- loopt via de server-only service_role (zoals public.pricing_quote_logs).
alter table public.price_snapshots enable row level security;

-- ── 4. GRANTS ─────────────────────────────────────────────────────────────────
-- service_role: server-only, bypasst RLS. SELECT/INSERT/DELETE (DELETE voor de
-- 48u-GC van niet-geboekte snapshots). GEEN UPDATE → snapshot immutabel.
grant select, insert, delete on public.price_snapshots to service_role;
revoke update, truncate on public.price_snapshots from service_role;
-- Defensief expliciet: de publieke rollen krijgen niets (bevatten prijsdata).
revoke all on public.price_snapshots from anon, authenticated;

-- ── 5. DOCUMENTATIE ───────────────────────────────────────────────────────────
comment on table public.price_snapshots is
  'Persistente, immutabele prijs-snapshot (quote-lock, Sprint 7.6). Booking/Stripe/mail/dashboard lezen exact dezelfde rij via quote_id. Server-only (service_role). Zie docs/architecture/price-snapshot-contract.md.';
comment on column public.price_snapshots.quote_id is 'Ondoorzichtige identifier (UUID v7 door app, v4-default fallback); loopt ongewijzigd door de hele flow.';
comment on column public.price_snapshots.pricing_version is 'Versie van de prijslogica, bv. 2026.07.v1. Inert in 7.6.3 (alleen opslag).';
comment on column public.price_snapshots.pricing_source is 'Herkomst van de prijs; vandaag altijd fixed_route_prices. Forward-compatible voor audits/support.';
comment on column public.price_snapshots.subtotal_cents is 'Basisprijs in integer cents (geen floats).';
comment on column public.price_snapshots.adjustments is 'Additieve, expliciete correcties (leeg in 7.6.3). Nooit verborgen dubbele toepassing.';
comment on column public.price_snapshots.total_cents is 'Bindend totaal in integer cents = subtotal_cents + som(adjustments). Stripe rekent hiermee.';
comment on column public.price_snapshots.route_snapshot is 'Reproduceerbare route/tarief-context (slugs, afstand, duur, source_label, valid_from, vatRate).';
comment on column public.price_snapshots.expires_at is 'Quote-lock geldigheidsvenster: calculated_at + 15 min. Daarna verse quote vereist.';

commit;
