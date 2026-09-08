-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: pricing_event_shadow_logs — observatie van het evenemententarief
-- Datum: 2026-08-28 (Phase 6, shadow mode)
--
-- WAAROM EEN EIGEN TABEL, EN NIET pricing_quote_logs
--   Onderzocht vóór implementatie. `pricing_quote_logs.price_breakdown` is de
--   bestaande observatiekanaal voor het deadhead- en aanrijmodel, en zou qua
--   vorm prima passen. Het werkt hier alleen niet, om één harde reden:
--
--     `logQuote()` wordt aangeroepen BINNEN `resolveQuote()` in
--     lib/pricing/service.ts. Het evenemententarief wordt pas daarna bepaald,
--     in `calculateBookingPrice()` in lib/pricing/engine.ts. Op het moment dat
--     de rij wordt geschreven bestaat het eventresultaat dus nog niet.
--
--   Dat alsnog in dezelfde rij krijgen kan op twee manieren, beide slechter:
--     • de insert een id laten teruggeven, dat door PricingQuoteResult heen
--       rijgen en de rij later UPDATEN — dat maakt van een append-only auditlog
--       een muteerbare tabel, kost een tweede schrijfactie per offerte, en
--       levert niets op wanneer de logregel zelf ontbreekt (de log is
--       best-effort en slaat stil over zonder service-role key);
--     • de eventberekening naar service.ts verplaatsen — dan zit het laden van
--       eventdata in de prijsservice en verdwijnt de enkele koppelplek die
--       Phase 4 juist heeft opgeleverd.
--
--   Deze tabel is bovendien inhoudelijk zuiverder: ze bevat GEEN adresvelden.
--   `pricing_quote_logs` draagt `pickup_input`/`dropoff_input` en een volledig
--   `request_payload`; observatiedata voor tariefkalibratie heeft dat niet
--   nodig en krijgt het hier dus ook niet.
--
--   Koppeling loopt via `quote_id`: dezelfde server-side UUID als
--   price_snapshots.quote_id. Dat is een sterkere sleutel dan
--   pricing_quote_logs biedt (die heeft helemaal geen quote-identifier).
--
-- INHOUD
--   Eén rij per GEËVALUEERD ritdeel, ook wanneer er geen match was — anders is
--   er geen noemer en kan de matchratio niet worden berekend. Uitsluitend
--   identifiers, niveaus en bedragen; nooit een adres, naam of ander
--   klantgegeven.
--
-- BEVEILIGING
--   Zelfde patroon als price_snapshots/pricing_quote_logs: RLS aan, GEEN
--   anon/authenticated policy, append-only voor service_role.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door de eigenaar, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.pricing_event_shadow_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- De modus waarin deze observatie ontstond. 'off' komt hier nooit voor:
  -- in die toestand wordt er niets berekend en dus niets gelogd.
  mode text not null check (mode in ('shadow', 'live')),
  -- Server-side quote-UUID; koppelt aan price_snapshots.quote_id. Null op het
  -- boekingspad zonder quoteId, waar geen snapshot wordt gemaakt.
  quote_id uuid,
  leg text not null check (leg in ('outbound', 'return')),
  -- Herkomst van de onderliggende prijs, zodat vaste routes en het
  -- afstandstarief los te analyseren zijn.
  pricing_source text,
  matched boolean not null,
  impact_level text not null
    check (impact_level in ('none', 'elevated', 'high', 'very_high', 'extreme')),
  -- Wat de klant EXTRA zou hebben betaald. In shadow is dit per definitie niet
  -- in rekening gebracht; in live wel.
  amount_cents integer not null check (amount_cents >= 0),
  -- De normale ritprijs waarop de toeslag zou zijn gekomen — nodig om de
  -- relatieve zwaarte van een tarief te kunnen beoordelen.
  base_subtotal_cents integer check (base_subtotal_cents is null or base_subtotal_cents >= 0),
  concurrent_event_count smallint not null default 0 check (concurrent_event_count >= 0),
  upgrade_applied boolean not null default false,
  capped_by_max_level boolean not null default false,
  -- Wat er matchte. Arrays in plaats van losse rijen: één observatie per
  -- ritdeel blijft zo één rij, en dit is genoeg om per evenement, zonesoort en
  -- richting te tellen.
  event_slugs text[] not null default '{}',
  window_ids text[] not null default '{}',
  zone_types text[] not null default '{}',
  match_sides text[] not null default '{}'
);

comment on table public.pricing_event_shadow_logs is
  'Observatie van het evenemententarief per geevalueerd ritdeel (shadow en live). Bevat UITSLUITEND identifiers, niveaus en bedragen — nooit adres-, naam- of andere klantgegevens. Append-only.';
comment on column public.pricing_event_shadow_logs.amount_cents is
  'Bedrag dat zou zijn (shadow) of is (live) toegevoegd. In shadow raakt dit de klantprijs nooit.';
comment on column public.pricing_event_shadow_logs.quote_id is
  'Koppelt aan price_snapshots.quote_id. Null op het boekingspad zonder quoteId.';

-- Het enige verwachte leespatroon: een periode analyseren, meestal gefilterd op
-- matches. Partieel op `matched` houdt de index klein bij veel niet-matches.
create index if not exists pricing_event_shadow_logs_created_at_idx
  on public.pricing_event_shadow_logs (created_at);
create index if not exists pricing_event_shadow_logs_matched_created_at_idx
  on public.pricing_event_shadow_logs (created_at)
  where matched;

alter table public.pricing_event_shadow_logs enable row level security;

-- Append-only: geen UPDATE, geen DELETE. Observatiedata mag niet herschreven
-- worden — anders is een kalibratie achteraf niet meer te vertrouwen.
grant select, insert on public.pricing_event_shadow_logs to service_role;
revoke update, delete, truncate on public.pricing_event_shadow_logs from service_role;
revoke all on public.pricing_event_shadow_logs from anon, authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- ANALYSE — losse query, geen dashboard. Draai deze met de service-role
-- verbinding en pas het venster aan. Geeft per evenement wat er nodig is om te
-- beoordelen of de ZONERING klopt, vóór er ook maar over tarieven wordt gepraat.
--
--   with observed as (
--     select l.*, unnest(l.event_slugs) as event_slug
--     from public.pricing_event_shadow_logs l
--     where l.created_at >= now() - interval '30 days'
--   )
--   select
--     event_slug,
--     count(*)                                             as matches,
--     count(*) filter (where leg = 'outbound')             as outbound,
--     count(*) filter (where leg = 'return')               as retour,
--     count(*) filter (where 'pickup'  = any(match_sides)) as pickup_matches,
--     count(*) filter (where 'dropoff' = any(match_sides)) as dropoff_matches,
--     impact_level,
--     round(avg(amount_cents) / 100.0, 2)                  as gem_toeslag_eur,
--     round(avg(base_subtotal_cents) / 100.0, 2)           as gem_basisprijs_eur,
--     count(*) filter (where upgrade_applied)              as upgrades,
--     count(*) filter (where capped_by_max_level)          as capped,
--     count(*) filter (where 'postcode4'     = any(zone_types)) as via_postcode4,
--     count(*) filter (where 'locality'      = any(zone_types)) as via_locality,
--     count(*) filter (where 'location_slug' = any(zone_types)) as via_slug
--   from observed
--   where matched
--   group by event_slug, impact_level
--   order by event_slug, impact_level;
--
-- Matchratio over dezelfde periode (noemer = alle geevalueerde ritdelen):
--
--   select
--     mode,
--     count(*)                                as geevalueerde_ritdelen,
--     count(*) filter (where matched)         as matches,
--     round(100.0 * count(*) filter (where matched) / nullif(count(*), 0), 1) as match_pct
--   from public.pricing_event_shadow_logs
--   where created_at >= now() - interval '30 days'
--   group by mode;
-- ═══════════════════════════════════════════════════════════════════════════
