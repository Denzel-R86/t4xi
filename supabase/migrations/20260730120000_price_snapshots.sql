-- ───────────────────────────────────────────────────────────────────────────
-- Migratie: price_snapshots (+ price_snapshot_adjustments) — quote-lock (PR 7.6.3B)
-- ───────────────────────────────────────────────────────────────────────────
-- WAAROM
--   Sprint 7.6 introduceert één bindende, herbruikbare prijsuitkomst: de klant
--   krijgt bij preview een `quote_id` terug; booking, Stripe, bevestiging, e-mail
--   en dashboard lezen daarna EXACT dezelfde snapshot (quote-lock). Zie het
--   ontwerp in docs/architecture/price-snapshot-contract.md (beslist 2026-07-30,
--   design-review 7.6.3B verwerkt).
--
-- SCOPE & VEILIGHEID
--   PUUR ADDITIEF: twee nieuwe tabellen, geen wijziging aan bestaande objecten of
--   data. ALLEEN datamodel — geen runtimecode, booking-logica, Stripe-afleiding of
--   UI gebruikt deze tabellen (volgt in 7.6.3C+). Geld in INTEGER CENTS (geen floats).
--   RLS aan met BEWUST GEEN anon/authenticated policy → uitsluitend service_role
--   (server-only, zoals public.pricing_quote_logs). Snapshots zijn immutabel:
--   service_role krijgt SELECT/INSERT/DELETE, GEEN UPDATE.
--
--   DB-ONTWERPKEUZES (design-review):
--     • quote_id heeft GEEN default: de applicatie is de ENIGE generator (UUID v7,
--       precies één keer bij snapshot-creatie). Geen dubbele bron, geen client-id.
--     • adjustments zijn GENORMALISEERD in een aparte tabel (sorteren/filteren/
--       rapporteren/BTW-uitsplitsing), niet als JSONB in de snapshot.
--     • CHECK-constraints zijn UITSLUITEND structureel (integer, >= 0, currency,
--       temporeel). De financiële invariant (subtotal + Σ adjustments = total)
--       wordt in de applicatielaag + tests gevalideerd (7.6.3C).
--
-- ROLLBACK (veilig — tabellen worden door geen enkele code gebruikt in 7.6.3B):
--   begin;
--     drop table if exists public.price_snapshot_adjustments;
--     drop table if exists public.price_snapshots;
--   commit;
--
-- VALIDATIE: eerst op staging toepassen en de DROP-rollback bewijzen; productie
--   nooit blind muteren.
-- ───────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. SNAPSHOT-TABEL ─────────────────────────────────────────────────────────
create table if not exists public.price_snapshots (
  -- GEEN default: de applicatie genereert de quote_id (UUID v7) precies één keer.
  -- Ondoorzichtig, niet-oplopend, niet-afleidbaar; nooit door een client aangeleverd.
  quote_id        uuid primary key,

  -- Versie van de prijslogica. Inert in 7.6.3 (opslag, geen branch-logica).
  pricing_version text not null,

  -- Herkomst van de prijs. Vandaag altijd 'fixed_route_prices'; forward-compatible.
  pricing_source  text not null default 'fixed_route_prices'
                    check (pricing_source in (
                      'fixed_route_prices', 'dynamic', 'manual',
                      'hotel_rate', 'airport_rate', 'contract_rate', 'promotion'
                    )),

  currency        text not null default 'EUR' check (currency = 'EUR'),

  -- ── Geld: uitsluitend integer cents. Alleen structurele validatie. ──
  subtotal_cents  integer not null check (subtotal_cents >= 0),
  total_cents     integer not null check (total_cents >= 0),
  -- (De invariant total = subtotal + Σ adjustments wordt in de app-laag + tests
  --  bewaakt, niet in een CHECK — de berekening wordt te complex/cross-table.)

  -- Reproductie van de rit los van de huidige tarieftabel (read-only blob).
  route_snapshot  jsonb   not null check (jsonb_typeof(route_snapshot) = 'object'),

  -- Wanneer BEREKEND, wanneer VERLOPEN (15-min quote-lock), wanneer VASTGELEGD.
  calculated_at   timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '15 minutes'),
  created_at      timestamptz not null default now(),

  constraint price_snapshots_expiry_after_calc
    check (expires_at > calculated_at)
);

comment on table public.price_snapshots is
  'Persistente, immutabele prijs-snapshot (quote-lock, Sprint 7.6). Booking/Stripe/mail/dashboard lezen exact dezelfde rij via quote_id. Server-only (service_role). Zie docs/architecture/price-snapshot-contract.md.';
comment on column public.price_snapshots.quote_id is 'App-gegenereerde UUID v7; geen DB-default; loopt ongewijzigd door de hele flow. Nooit client-aangeleverd.';
comment on column public.price_snapshots.pricing_version is 'Versie van de prijslogica, bv. 2026.07.v1. Inert in 7.6.3 (alleen opslag).';
comment on column public.price_snapshots.pricing_source is 'Herkomst van de prijs; vandaag altijd fixed_route_prices. Forward-compatible voor audits/support.';
comment on column public.price_snapshots.subtotal_cents is 'Basisprijs in integer cents (geen floats).';
comment on column public.price_snapshots.total_cents is 'Bindend totaal in integer cents. Stripe rekent hiermee. Financiële invariant in app-laag.';
comment on column public.price_snapshots.route_snapshot is 'Reproduceerbare route/tarief-context (slugs, afstand, duur, source_label, valid_from, vatRate).';
comment on column public.price_snapshots.expires_at is 'Quote-lock geldigheidsvenster: calculated_at + 15 min. Daarna verse quote vereist.';

-- ── 2. ADJUSTMENTS-TABEL (genormaliseerd) ─────────────────────────────────────
-- Leeg in 7.6.3; structuur staat vast zodat toeslagen/kortingen later zonder
-- hermigratie sorteerbaar/filterbaar/rapporteerbaar zijn (incl. BTW-uitsplitsing).
create table if not exists public.price_snapshot_adjustments (
  -- Interne surrogate-PK: de DB is hier de enige generator (niet flow-spannend).
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null
                 references public.price_snapshots(quote_id) on delete cascade,
  code         text not null,               -- machine-leesbaar, bv. 'return_discount'
  label        text not null,               -- klantzichtbaar
  amount_cents integer not null,            -- + = toeslag, − = korting (mag negatief)
  taxable      boolean not null default true,
  vat_rate     numeric(5, 2),               -- voor BTW-uitsplitsing/rapportage (nullable)
  sort_order   integer not null default 0,  -- weergavevolgorde
  created_at   timestamptz not null default now()
);

comment on table public.price_snapshot_adjustments is
  'Genormaliseerde, additieve prijscorrecties per snapshot (toeslagen/kortingen). Leeg in 7.6.3. Server-only; immutabel. amount_cents mag negatief zijn (korting).';

-- ── 3. INDEXEN (uitsluitend voor verwachte querypatronen — geen "voor de zekerheid") ──
-- Snapshot: expires_at bedient de latere leeftijd-sweep (GC van verlopen, niet-geboekte
--   snapshots). created_at blijft als audit-kolom bestaan maar wordt NIET geïndexeerd —
--   de sweep draait op expires_at (= created_at + 15 min; functioneel identiek). Een
--   created_at-index komt pas als een query 'm echt nodig heeft. De lock-lookup gaat via
--   de PK (quote_id) en heeft geen extra index nodig.
create index if not exists price_snapshots_expires_at_idx on public.price_snapshots(expires_at);
-- Child: FK-lookup "regels van deze snapshot" (Postgres indexeert FK-kolommen niet auto).
create index if not exists price_snapshot_adjustments_quote_id_idx on public.price_snapshot_adjustments(quote_id);

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
-- RLS aan, BEWUST GEEN anon/authenticated policy → deny-by-default. Alle toegang
-- loopt via de server-only service_role (zoals public.pricing_quote_logs).
alter table public.price_snapshots            enable row level security;
alter table public.price_snapshot_adjustments enable row level security;

-- ── 5. GRANTS ─────────────────────────────────────────────────────────────────
-- service_role: server-only, bypasst RLS. SELECT/INSERT/DELETE (DELETE voor de
-- 48u-GC; cascade ruimt de child mee op). GEEN UPDATE → immutabel.
grant select, insert, delete on public.price_snapshots            to service_role;
grant select, insert, delete on public.price_snapshot_adjustments to service_role;
revoke update, truncate on public.price_snapshots            from service_role;
revoke update, truncate on public.price_snapshot_adjustments from service_role;
-- Defensief expliciet: de publieke rollen krijgen niets (tabellen bevatten prijsdata).
revoke all on public.price_snapshots            from anon, authenticated;
revoke all on public.price_snapshot_adjustments from anon, authenticated;

commit;
