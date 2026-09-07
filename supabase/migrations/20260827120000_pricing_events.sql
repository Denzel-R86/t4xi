-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: Event Availability Pricing — schema + configuratie (Phase 2)
-- Datum: 2026-08-27
--
-- Levert UITSLUITEND de datastructuur en de tariefconfiguratie voor het
-- evenemententarief. GEEN berekening (Phase 3), GEEN koppeling aan
-- /api/pricing/quote (Phase 4), GEEN evenementdata (Phase 5). Bestaande
-- prijsbepaling — vaste routes, afstandstarief, nachttarief, aanrijcomponent,
-- quote-lock — blijft door deze migratie volledig ongewijzigd.
--
-- Commercieel uitgangspunt: het evenemententarief is GEEN dynamische surge.
-- Het is een vooraf vastgestelde, additieve beschikbaarheidsprijs die bij de
-- offerte zichtbaar is en na bevestiging niet meer wijzigt. Technisch landt
-- die als één extra regel in de BESTAANDE snapshot-adjustments
-- (public.price_snapshot_adjustments, code 'event_availability') — daarom
-- introduceert deze migratie GEEN tweede prijs- of breakdown-opslag.
--
-- Geografische matching gebeurt bewust op wat de pijplijn AL kent zonder
-- extra externe call: de opgeloste route-slug, de officiële PDOK-gemeente van
-- het ophaaladres (lookupOfficialGemeente, al in de pijplijn) en een
-- postcode4-prefix als fail-closed fallback — hetzelfde patroon als
-- lib/pricing/deadhead-zone.ts. Er worden BEWUST geen latitude/longitude/
-- radius-kolommen aangelegd: er is vandaag geen coördinaat van een vrij
-- ingetypt ophaaladres, dus die kolommen zouden leeg blijven en niets sturen.
-- Zodra een geocode wel beschikbaar is, is dat een additieve vervolgmigratie.
--
-- Historische evenementen zijn buiten scope (eigenaar, 2026-08-27): er wordt
-- niets gebackfilled en niets gereconstrueerd. Het schema kan een afgelopen
-- evenement wél blijven bewaren (status 'completed'), zodat latere analyse
-- mogelijk blijft — die analytics worden hier niet gebouwd.
--
-- Beveiliging: zelfde patroon als price_snapshots/pricing_deadhead_config/
-- pricing_approach_fee_config — RLS aan, GEEN anon/authenticated policy
-- (deny-by-default), uitsluitend service_role. Anders dan de immutabele
-- snapshots heeft service_role hier WEL update-rechten: de wekelijkse sync
-- werkt status/verificatievelden van bestaande evenementen bij.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door de eigenaar, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. EVENEMENTEN ──────────────────────────────────────────────────────────
-- `starts_at`/`ends_at` zijn de INFORMATIEVE totale duur van het evenement en
-- sturen zelf geen prijs: prijsbepalend zijn uitsluitend de tijdvensters in
-- pricing_event_windows. Zo kan de aankomstdag een ander niveau hebben dan de
-- uitstroom 's nachts, zonder dat de eventduur zelf iets afdwingt.
--
-- `pricing_enabled` staat BEWUST op false by default (fail-closed): een
-- automatisch gesynchroniseerd of nieuw ingevoerd evenement mag nooit
-- stilzwijgend prijzen beïnvloeden voordat het is vrijgegeven.

create table if not exists public.pricing_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  category text not null
    check (category in (
      'festival',
      'concert',
      'sports',
      'city_event',
      'public_holiday',
      'conference',
      'other'
    )),
  city text not null,
  venue text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'expected'
    check (status in (
      'expected',              -- datum aangekondigd/aannemelijk, nog niet officieel
      'confirmed',             -- officieel bevestigd door organisator/venue/gemeente
      'changed',               -- datum/opzet gewijzigd t.o.v. eerdere bevestiging
      'cancelled',             -- officieel geannuleerd
      'completed',             -- voorbij; blijft bewaard voor latere analyse
      'verification_required'  -- verdwenen/tegenstrijdig in de bron → menselijke check
    )),
  expected_attendance integer check (expected_attendance is null or expected_attendance > 0),
  source_url text,
  -- Leesbare bronaanduiding naast de URL (bv. "Officiele website Pinkpop"),
  -- zodat een validatierapport te lezen is zonder elke link te openen.
  source_name text,
  source_type text not null default 'other'
    check (source_type in ('organiser', 'venue', 'municipality', 'ticketing', 'other')),
  -- Lager getal = hogere autoriteit. Een bron met een HOGER (zwakker) getal mag
  -- een bevestigd evenement nooit stilzwijgend overschrijven; die regel wordt in
  -- de sync-laag afgedwongen (Phase 6), niet hier.
  source_priority smallint not null default 5 check (source_priority between 1 and 5),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'needs_review')),
  last_verified_at timestamptz,
  last_changed_at timestamptz,
  -- Terugkerende evenementen worden NOOIT automatisch naar een volgend jaar
  -- gekopieerd. De Dutch Grand Prix is daarvan het duidelijkste voorbeeld: de
  -- editie van augustus 2026 was de laatste geplande in Zandvoort.
  requires_annual_confirmation boolean not null default true,
  pricing_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_events_span_check check (ends_at > starts_at)
);

comment on table public.pricing_events is
  'Evenementen die de chauffeurbeschikbaarheid of bereikbaarheid beinvloeden. Server-only. pricing_enabled is fail-closed (default false): een evenement prijst pas mee na expliciete vrijgave.';
comment on column public.pricing_events.starts_at is
  'Informatieve totale duur van het evenement. NIET prijsbepalend — dat zijn uitsluitend de rijen in pricing_event_windows.';
comment on column public.pricing_events.source_priority is
  'Bronautoriteit, 1 = organisator/officieel t/m 5 = overig. Een zwakkere bron mag een bevestigd evenement niet overschrijven (afgedwongen in de sync-laag).';
comment on column public.pricing_events.requires_annual_confirmation is
  'True = datum moet elk jaar opnieuw bevestigd worden; nooit automatisch doorrollen naar een volgende editie.';

-- Slug is de stabiele, jaargebonden sleutel (bv. "ade-2026"), ook voor
-- afgelopen edities die bewaard blijven — daarom globaal uniek, niet
-- "uniek zolang actief".
create unique index if not exists pricing_events_slug_unique
  on public.pricing_events (lower(slug));

-- Het enige verwachte leespatroon aan de prijskant: laad de vrijgegeven
-- evenementen die nog een toekomstig venster kunnen hebben. Partieel op
-- pricing_enabled, zodat afgelopen/uitgeschakelde edities de index niet vullen.
create index if not exists pricing_events_enabled_ends_at_idx
  on public.pricing_events (ends_at)
  where pricing_enabled;

alter table public.pricing_events enable row level security;

-- ── 2. TIJDVENSTERS ─────────────────────────────────────────────────────────
-- Een evenement heeft niet de hele duur dezelfde schaarste. Aankomstdag,
-- actieve dagen, uitstroom na de laatste show en de vertrekochtend zijn elk
-- een eigen venster met een eigen niveau.
--
-- Bewust GEEN generiek `impact_level` naast de twee richtingen: één bron van
-- waarheid per richting voorkomt de vraag "welk veld wint". Een venster dat
-- alleen ophalen raakt, zet dropoff_impact_level op 'none'.
--
-- Overlappende vensters binnen hetzelfde evenement zijn TOEGESTAAN (aankomst
-- en actief kunnen elkaar raken); de hoogste toepasselijke waarde wint. Die
-- resolutie zit in de rekenlaag (Phase 3), niet in een constraint.

create table if not exists public.pricing_event_windows (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.pricing_events(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  event_phase text not null default 'custom'
    check (event_phase in ('arrival', 'active', 'exit', 'overnight', 'departure', 'custom')),
  pickup_impact_level text not null default 'none'
    check (pickup_impact_level in ('none', 'elevated', 'high', 'very_high', 'extreme')),
  dropoff_impact_level text not null default 'none'
    check (dropoff_impact_level in ('none', 'elevated', 'high', 'very_high', 'extreme')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint pricing_event_windows_span_check check (ends_at > starts_at)
);

comment on table public.pricing_event_windows is
  'Prijsbepalende tijdvensters per evenement, met een apart niveau voor ophalen en afzetten. Overlap is toegestaan; de hoogste toepasselijke waarde wint in de rekenlaag.';

-- Bedient zowel de FK-lookup/cascade als het laadpatroon "vensters van deze
-- evenementen, aflopend na nu" met één index.
create index if not exists pricing_event_windows_event_id_ends_at_idx
  on public.pricing_event_windows (event_id, ends_at)
  where active;

alter table public.pricing_event_windows enable row level security;

-- ── 3. ZONES ────────────────────────────────────────────────────────────────
-- Een evenement verhoogt NOOIT landelijk de prijs. Een zone koppelt het
-- evenement aan wat de pijplijn al kent van de rit:
--
--   'location_slug' → de opgeloste vaste-route-slug (pickupSlug/dropoffSlug)
--   'postcode4'     → de vier cijfers van de postcode uit het adreslabel
--   'locality'      → de woonplaats uit het adreslabel (Phase 5.5) — hiermee
--                     zijn ook bestemmingen ZONDER catalogus-slug zoneerbaar,
--                     zoals Biddinghuizen of Landgraaf
--   'gemeente'      → de officiele PDOK-gemeentenaam, uitsluitend beschikbaar
--                     wanneer de aanrijcomponent die al heeft opgezocht
--
-- `direction` bepaalt of de zone geldt bij ophalen, afzetten of beide: een
-- rit NAAR een festival en een rit VANAF datzelfde festival zijn commercieel
-- niet hetzelfde geval.

create table if not exists public.pricing_event_zones (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.pricing_events(id) on delete cascade,
  zone_type text not null check (zone_type in ('location_slug', 'postcode4', 'locality', 'gemeente')),
  location_slug text,
  gemeente_naam text,
  locality text,
  postcode4 smallint check (postcode4 is null or postcode4 between 1000 and 9999),
  direction text not null default 'both' check (direction in ('pickup', 'dropoff', 'both')),
  -- Optionele afwijking van het vensterniveau voor deze specifieke zone: de
  -- festivalweide zelf kan zwaarder wegen dan de omliggende gemeente.
  impact_override text
    check (impact_override is null or impact_override in ('none', 'elevated', 'high', 'very_high', 'extreme')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Precies één identificerende kolom, passend bij zone_type. Zo kan er nooit
  -- een zone bestaan die op twee manieren tegelijk zou matchen.
  constraint pricing_event_zones_identifier_check check (
    (zone_type = 'location_slug'
      and location_slug is not null and gemeente_naam is null and postcode4 is null and locality is null)
    or (zone_type = 'postcode4'
      and postcode4 is not null and location_slug is null and gemeente_naam is null and locality is null)
    or (zone_type = 'locality'
      and locality is not null and location_slug is null and gemeente_naam is null and postcode4 is null)
    or (zone_type = 'gemeente'
      and gemeente_naam is not null and location_slug is null and postcode4 is null and locality is null)
  )
);

comment on table public.pricing_event_zones is
  'Geografische reikwijdte per evenement, uitgedrukt in wat de prijspijplijn al kent: route-slug, postcode4, woonplaats of officiele PDOK-gemeente. Bewust geen radius: er is geen coordinaat van een vrij ingetypt ophaaladres.';

-- Database-side afgedwongen: dezelfde zone niet twee keer actief per
-- evenement en richting. postcode4 wordt naar tekst genormaliseerd zodat de
-- drie zonesoorten in één sleutel passen.
create unique index if not exists pricing_event_zones_active_unique
  on public.pricing_event_zones (
    event_id,
    direction,
    zone_type,
    coalesce(lower(location_slug), lower(gemeente_naam), lower(locality), postcode4::text)
  )
  where active;

alter table public.pricing_event_zones enable row level security;

-- ── 4. TARIEFREGELS ─────────────────────────────────────────────────────────
-- De bedragen per niveau staan in de DATABASE, nooit hardcoded in de
-- rekenlogica: ze worden gekalibreerd op de werkelijke acceptatiegraad van
-- chauffeurs. Integer centen — zelfde discipline als de rest van de
-- prijspijplijn, nooit floats-als-euro's.

create table if not exists public.pricing_event_fee_rules (
  id uuid primary key default gen_random_uuid(),
  impact_level text not null
    check (impact_level in ('none', 'elevated', 'high', 'very_high', 'extreme')),
  amount_cents integer not null check (amount_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pricing_event_fee_rules is
  'Evenemententarief per impactniveau in integer centen. Configuratie, geen code: de bedragen worden gekalibreerd op de werkelijke acceptatiegraad van chauffeurs.';

create unique index if not exists pricing_event_fee_rules_level_active_unique
  on public.pricing_event_fee_rules (impact_level)
  where active;

alter table public.pricing_event_fee_rules enable row level security;

-- ── 5. MODULECONFIGURATIE ───────────────────────────────────────────────────
-- `mode` bepaalt de operationele toestand van de hele module. Bij 'off' gedraagt
-- de prijspijplijn zich exact zoals vóór deze module, ongeacht wat er in de
-- tabellen staat; bij 'shadow' wordt alles berekend en geobserveerd zonder dat
-- een klant iets extra betaalt. Zo kan het schema live staan, en zelfs
-- meedraaien, voordat de klantprijs wordt beïnvloed.

create table if not exists public.pricing_event_config (
  id uuid primary key default gen_random_uuid(),
  -- Drie expliciete operationele toestanden in ÉÉN veld, bewust geen stapel
  -- losse booleans die elkaar kunnen tegenspreken:
  --   'off'    → niets berekenen, niets laden, niets loggen (de noodknop)
  --   'shadow' → volledig berekenen en observeren, maar NOOIT afrekenen
  --   'live'   → berekenen, observeren én als adjustment aan de prijs toevoegen
  mode text not null default 'off' check (mode in ('off', 'shadow', 'live')),
  -- Bij meerdere gelijktijdige evenementen wordt NOOIT opgeteld. Standaard
  -- wint het hoogste individuele tarief; optioneel mag het niveau één stap
  -- omhoog wanneer er genoeg zware evenementen tegelijk spelen.
  concurrent_upgrade_enabled boolean not null default false,
  concurrent_upgrade_min_events smallint not null default 2
    check (concurrent_upgrade_min_events >= 2),
  concurrent_upgrade_min_level text not null default 'high'
    check (concurrent_upgrade_min_level in ('elevated', 'high', 'very_high', 'extreme')),
  max_impact_level text not null default 'extreme'
    check (max_impact_level in ('elevated', 'high', 'very_high', 'extreme')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pricing_event_config is
  'Moduleconfiguratie voor het evenemententarief. mode = off | shadow | live. Bij off is de prijspijplijn identiek aan vóór deze module; bij shadow wordt alles berekend en geobserveerd maar niets afgerekend. Tarieven worden nooit opgeteld bij overlap; het hoogste wint.';
comment on column public.pricing_event_config.mode is
  'off = noodknop (geen berekening, geen lading, geen log). shadow = volledig evalueren en loggen, klantprijs ongewijzigd. live = evalueren, loggen en als adjustment doorbelasten.';

-- Database-side afgedwongen: ten hoogste één actieve configuratierij.
create unique index if not exists pricing_event_config_one_active
  on public.pricing_event_config ((true))
  where active;

alter table public.pricing_event_config enable row level security;

-- ── 6. SYNC-LOG ─────────────────────────────────────────────────────────────
-- Waarneembaarheid van de wekelijkse validatie (Phase 6). Bevat uitsluitend
-- tellingen en bronaanduidingen — geen adres-, klant- of persoonsgegevens.

create table if not exists public.pricing_event_sync_log (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  checked_at timestamptz not null default now(),
  events_seen integer not null default 0 check (events_seen >= 0),
  events_added integer not null default 0 check (events_added >= 0),
  events_changed integer not null default 0 check (events_changed >= 0),
  events_cancelled integer not null default 0 check (events_cancelled >= 0),
  events_needing_review integer not null default 0 check (events_needing_review >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  error_summary text,
  duration_ms integer not null default 0 check (duration_ms >= 0)
);

comment on table public.pricing_event_sync_log is
  'Uitkomst per bron per synchronisatieronde. Uitsluitend tellingen en bronaanduidingen — nooit adres-, klant- of persoonsgegevens.';

create index if not exists pricing_event_sync_log_checked_at_idx
  on public.pricing_event_sync_log (checked_at);

alter table public.pricing_event_sync_log enable row level security;

-- ── 7. GRANTS ───────────────────────────────────────────────────────────────
-- RLS staat aan en er is BEWUST geen anon/authenticated policy: alle toegang
-- loopt via de server-only service_role. Anders dan bij price_snapshots is
-- UPDATE hier wél nodig — de wekelijkse sync werkt status, verificatievelden
-- en datums van bestaande evenementen bij in plaats van rijen te vervangen.
-- Het sync-log is append-only: geen UPDATE.

grant select, insert, update, delete on public.pricing_events         to service_role;
grant select, insert, update, delete on public.pricing_event_windows  to service_role;
grant select, insert, update, delete on public.pricing_event_zones    to service_role;
grant select, insert, update, delete on public.pricing_event_fee_rules to service_role;
grant select, insert, update, delete on public.pricing_event_config   to service_role;
grant select, insert                 on public.pricing_event_sync_log to service_role;

revoke truncate on public.pricing_events          from service_role;
revoke truncate on public.pricing_event_windows   from service_role;
revoke truncate on public.pricing_event_zones     from service_role;
revoke truncate on public.pricing_event_fee_rules from service_role;
revoke truncate on public.pricing_event_config    from service_role;
revoke update, delete, truncate on public.pricing_event_sync_log from service_role;

-- Defensief expliciet: de publieke rollen krijgen niets. Deze tabellen bepalen
-- mee wat een klant betaalt.
revoke all on public.pricing_events          from anon, authenticated;
revoke all on public.pricing_event_windows   from anon, authenticated;
revoke all on public.pricing_event_zones     from anon, authenticated;
revoke all on public.pricing_event_fee_rules from anon, authenticated;
revoke all on public.pricing_event_config    from anon, authenticated;
revoke all on public.pricing_event_sync_log  from anon, authenticated;

-- ── 8. SEED — UITSLUITEND CONFIGURATIE ──────────────────────────────────────
-- Geen evenementdata in deze migratie: die volgt in Phase 5, en uitsluitend
-- voor vensters die ná 2026-08-27 liggen. Hieronder alleen de tariefstaffel en
-- de moduleconfiguratie, met hetzelfde idempotentie-/conflictbeleid als
-- 20260818120000_pickup_approach_fee.sql:
--   • ontbreekt          → invoegen
--   • bestaat, IDENTIEK  → veilige no-op
--   • bestaat, AFWIJKEND → RAISE EXCEPTION, hele transactie rolt terug
-- Nooit stilzwijgend een handmatig gekalibreerd bedrag overschrijven.

-- Startwaarden (voorstel, expliciet nog niet gekalibreerd): de bedragen zijn
-- gekozen om de vraag "wat is de minimale gegarandeerde prijs waarbij de rit
-- betrouwbaar wordt uitgevoerd" te kunnen gaan meten, niet als marktdata.
do $$
declare
  seed record;
  existing record;
begin
  for seed in
    select * from (values
      ('none', 0),
      ('elevated', 1250),
      ('high', 2500),
      ('very_high', 4000),
      ('extreme', 6000)
    ) as s(impact_level, amount_cents)
  loop
    select * into existing
      from public.pricing_event_fee_rules
      where impact_level = seed.impact_level and active
      limit 1;
    if not found then
      insert into public.pricing_event_fee_rules (impact_level, amount_cents)
      values (seed.impact_level, seed.amount_cents);
    elsif existing.amount_cents = seed.amount_cents then
      null; -- identiek: veilige no-op
    else
      raise exception
        'pricing_event_fee_rules: niveau "%" heeft al een actief bedrag van % cent terwijl de seed % cent verwacht — pas de bestaande rij handmatig aan of deactiveer die, in plaats van een gekalibreerd tarief te overschrijven',
        seed.impact_level, existing.amount_cents, seed.amount_cents;
    end if;
  end loop;
end $$;

-- Moduleconfiguratie: UIT bij oplevering. Het schema mag live staan zonder dat
-- er ook maar één offerte verandert; vrijgave is een aparte, bewuste stap.
do $$
declare
  existing record;
  seed_mode text := 'off';
  seed_concurrent_upgrade_enabled boolean := false;
  seed_concurrent_upgrade_min_events smallint := 2;
  seed_concurrent_upgrade_min_level text := 'high';
  seed_max_impact_level text := 'extreme';
begin
  select * into existing from public.pricing_event_config where active limit 1;
  if not found then
    insert into public.pricing_event_config (
      mode, concurrent_upgrade_enabled, concurrent_upgrade_min_events,
      concurrent_upgrade_min_level, max_impact_level
    ) values (
      seed_mode, seed_concurrent_upgrade_enabled, seed_concurrent_upgrade_min_events,
      seed_concurrent_upgrade_min_level, seed_max_impact_level
    );
  elsif existing.mode = seed_mode
    and existing.concurrent_upgrade_enabled = seed_concurrent_upgrade_enabled
    and existing.concurrent_upgrade_min_events = seed_concurrent_upgrade_min_events
    and existing.concurrent_upgrade_min_level = seed_concurrent_upgrade_min_level
    and existing.max_impact_level = seed_max_impact_level
  then
    null; -- identiek: veilige no-op
  else
    raise exception
      'pricing_event_config: er bestaat al een actieve configuratie met afwijkende waarden (mode=%, concurrent_upgrade_enabled=%, concurrent_upgrade_min_events=%, concurrent_upgrade_min_level=%, max_impact_level=%) — pas die handmatig aan in plaats van de seed te laten overschrijven',
      existing.mode, existing.concurrent_upgrade_enabled, existing.concurrent_upgrade_min_events,
      existing.concurrent_upgrade_min_level, existing.max_impact_level;
  end if;
end $$;

COMMIT;
