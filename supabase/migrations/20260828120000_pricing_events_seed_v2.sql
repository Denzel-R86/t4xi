-- ═══════════════════════════════════════════════════════════════════════════
-- Seed: Event Pricing productiedataset V2 (Phase 5.6)
-- Datum: 2026-08-28 — vervangt de V1-set van 2026-08-27 volledig
--
-- UITSLUITEND DATA. Geen schema, geen functies, geen configuratiewijziging.
-- De kill switch (pricing_event_config.enabled) blijft UIT en elk evenement
-- hieronder staat op pricing_enabled = false. Deze migratie verandert dus GEEN
-- ENKELE klantprijs.
--
-- WAT ER VERANDERT TEN OPZICHTE VAN V1
--   Phase 5.5 maakte postcode4 en woonplaats beschikbaar in de prijspijplijn.
--   Daardoor kan deze set:
--     • de Amsterdam Marathon zoneren op de POSTCODES DIE DE ORGANISATOR ZELF
--       als afgesloten opgeeft, in plaats van op heel Amsterdam;
--     • festivals buiten de locatiecatalogus opnemen (Biddinghuizen,
--       Landgraaf, Lichtenvoorde) via woonplaats en venue-postcode;
--     • een venue-evenement als North Sea Jazz beperken tot de Ahoy-postcode
--       in plaats van heel Rotterdam.
--   Vervallen is het landelijke Bevrijdingsdag-record: een nationale feestdag
--   is op zichzelf geen operationele verstoring, en voor de afzonderlijke
--   bevrijdingsfestivals van 2027 is nog geen editie bevestigd.
--
-- ZONERINGSPRINCIPE
--   Per evenement de meest specifieke matcher die operationeel klopt, niet de
--   eerst beschikbare. Zones zijn EVENEMENT-breed (niet per venster), dus een
--   brede zone is alleen toegevoegd waar de impact bij ELK venster van dat
--   evenement breed is. Liever een geldige eventrit missen dan een
--   niet-getroffen klant een toeslag rekenen.
--
-- TIJDZONE
--   Alle tijdstippen in UTC, omgerekend uit Nederlandse wandkloktijd. Let op de
--   zomertijdwissels 2026-10-25 en 2027-10-31 (beide 03:00 lokaal).
--
-- IDEMPOTENTIE
--   Evenementen worden ge-upsert op slug; `pricing_enabled` wordt NOOIT
--   overschreven zodat een handmatige vrijgave niet stil terugdraait. Vensters
--   en zones worden per geseed evenement vervangen. Het V1-record
--   'bevrijdingsdag-2027' wordt expliciet opgeruimd.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door de eigenaar, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. EVENEMENTEN ──────────────────────────────────────────────────────────
-- Elk record heeft een primaire bron (organisator, venue of overheid) die op
-- 2026-08-28 is geraadpleegd. Zonder zulke bron: niet opgenomen.

insert into public.pricing_events (
  slug, name, category, city, venue, starts_at, ends_at, status,
  expected_attendance, source_url, source_name, source_type, source_priority,
  verification_status, last_verified_at, requires_annual_confirmation, pricing_enabled
) values
  ( 'amsterdam-marathon-2026', 'TCS Amsterdam Marathon 2026', 'sports', 'Amsterdam', 'Olympisch Stadion', '2026-10-18T04:30:00Z', '2026-10-18T16:30:00Z', 'confirmed', null, 'https://www.tcsamsterdammarathon.nl/bewoners', 'TCS Amsterdam Marathon — bewonersinformatie wegafsluitingen', 'organiser', 1, 'verified', '2026-08-28T00:00:00Z', true, false ),
  ( 'ade-2026', 'Amsterdam Dance Event 2026', 'festival', 'Amsterdam', null, '2026-10-21T20:00:00Z', '2026-10-26T03:00:00Z', 'confirmed', null, 'https://www.amsterdam-dance-event.nl/en/', 'Officiele website Amsterdam Dance Event', 'organiser', 1, 'verified', '2026-08-28T00:00:00Z', true, false ),
  ( 'oud-en-nieuw-2026', 'Oud & Nieuw 2026/2027', 'public_holiday', 'Landelijk', null, '2026-12-31T19:00:00Z', '2027-01-01T07:00:00Z', 'confirmed', null, 'https://www.rijksoverheid.nl/onderwerpen/arbeidsovereenkomst-en-cao/vraag-en-antwoord/officiele-feestdagen', 'Rijksoverheid — officiele feestdagen', 'municipality', 3, 'verified', '2026-08-28T00:00:00Z', false, false ),
  ( 'koningsdag-2027', 'Koningsnacht & Koningsdag 2027', 'public_holiday', 'Landelijk', null, '2027-04-26T18:00:00Z', '2027-04-28T01:00:00Z', 'confirmed', null, 'https://www.rijksoverheid.nl/onderwerpen/arbeidsovereenkomst-en-cao/vraag-en-antwoord/officiele-feestdagen', 'Rijksoverheid — officiele feestdagen', 'municipality', 3, 'verified', '2026-08-28T00:00:00Z', false, false ),
  ( 'pinkpop-2027', 'Pinkpop 2027', 'festival', 'Landgraaf', 'Megaland', '2027-06-18T06:00:00Z', '2027-06-21T14:00:00Z', 'confirmed', null, 'https://www.pinkpop.nl/', 'Officiele website Pinkpop', 'organiser', 1, 'verified', '2026-08-28T00:00:00Z', true, false ),
  ( 'defqon1-2027', 'Defqon.1 2027', 'festival', 'Biddinghuizen', 'Walibi Holland', '2027-06-24T06:00:00Z', '2027-06-28T14:00:00Z', 'confirmed', null, 'https://www.q-dance.com/l/defqon1-2026', 'Q-dance — aankondiging data 2027', 'organiser', 1, 'verified', '2026-08-28T00:00:00Z', true, false ),
  ( 'north-sea-jazz-2027', 'NN North Sea Jazz 2027', 'festival', 'Rotterdam', 'Rotterdam Ahoy', '2027-07-09T15:00:00Z', '2027-07-12T01:00:00Z', 'confirmed', null, 'https://www.northseajazz.com/', 'Officiele website North Sea Jazz', 'organiser', 1, 'verified', '2026-08-28T00:00:00Z', true, false ),
  ( 'zwarte-cross-2027', 'Zwarte Cross 2027', 'festival', 'Lichtenvoorde', 'De Schans', '2027-07-15T06:00:00Z', '2027-07-19T14:00:00Z', 'confirmed', null, 'https://www.zwartecross.nl/veelgestelde-vragen/', 'Officiele website Zwarte Cross', 'organiser', 1, 'verified', '2026-08-28T00:00:00Z', true, false ),
  ( 'lowlands-2027', 'Lowlands 2027', 'festival', 'Biddinghuizen', 'Walibi Holland', '2027-08-19T06:00:00Z', '2027-08-23T14:00:00Z', 'confirmed', null, 'https://lowlands.nl/', 'Officiele website Lowlands', 'organiser', 1, 'verified', '2026-08-28T00:00:00Z', true, false ),
  ( 'amsterdam-marathon-2027', 'TCS Amsterdam Marathon 2027', 'sports', 'Amsterdam', 'Olympisch Stadion', '2027-10-31T05:30:00Z', '2027-10-31T17:30:00Z', 'confirmed', null, 'https://www.tcsamsterdammarathon.nl/programma', 'Officieel programma TCS Amsterdam Marathon', 'organiser', 1, 'verified', '2026-08-28T00:00:00Z', true, false ),
  ( 'oud-en-nieuw-2027', 'Oud & Nieuw 2027/2028', 'public_holiday', 'Landelijk', null, '2027-12-31T19:00:00Z', '2028-01-01T07:00:00Z', 'confirmed', null, 'https://www.rijksoverheid.nl/onderwerpen/arbeidsovereenkomst-en-cao/vraag-en-antwoord/officiele-feestdagen', 'Rijksoverheid — officiele feestdagen', 'municipality', 3, 'verified', '2026-08-28T00:00:00Z', false, false )
on conflict (lower(slug)) do update set
  name = excluded.name,
  category = excluded.category,
  city = excluded.city,
  venue = excluded.venue,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  status = excluded.status,
  expected_attendance = excluded.expected_attendance,
  source_url = excluded.source_url,
  source_name = excluded.source_name,
  source_type = excluded.source_type,
  source_priority = excluded.source_priority,
  verification_status = excluded.verification_status,
  last_verified_at = excluded.last_verified_at,
  requires_annual_confirmation = excluded.requires_annual_confirmation,
  updated_at = now();
  -- pricing_enabled staat hier BEWUST niet tussen.

-- ── 2. V1-RESTANT OPRUIMEN ──────────────────────────────────────────────────
-- Het landelijke Bevrijdingsdag-record uit V1 vervalt: de feestdag zelf is geen
-- operationele verstoring. Alleen verwijderen zolang niemand het handmatig heeft
-- vrijgegeven — dan is het een bewuste keuze van een operator en blijft het staan.
delete from public.pricing_events
where slug = 'bevrijdingsdag-2027' and pricing_enabled = false;

create temporary table seeded_event_ids on commit drop as
select id, slug from public.pricing_events
where slug in (
  'amsterdam-marathon-2026', 'ade-2026', 'oud-en-nieuw-2026', 'koningsdag-2027',
  'pinkpop-2027', 'defqon1-2027', 'north-sea-jazz-2027', 'zwarte-cross-2027',
  'lowlands-2027', 'amsterdam-marathon-2027', 'oud-en-nieuw-2027'
);

delete from public.pricing_event_windows where event_id in (select id from seeded_event_ids);
delete from public.pricing_event_zones   where event_id in (select id from seeded_event_ids);

-- ── 3. TIJDVENSTERS ─────────────────────────────────────────────────────────
-- Richting is expliciet: aankomst belast de AFZETKANT, uitstroom de OPHAALKANT.
-- Geen hele kalenderdagen; alleen de uren waarin de uitvoering aantoonbaar
-- zwaarder is.

insert into public.pricing_event_windows (
  event_id, starts_at, ends_at, event_phase, pickup_impact_level, dropoff_impact_level
)
select e.id, w.starts_at::timestamptz, w.ends_at::timestamptz, w.phase, w.pickup, w.dropoff
from seeded_event_ids e
join (values
  -- TCS Amsterdam Marathon 2026 — zondag 18 oktober (CEST). De organisator geeft
  -- afsluitingen van 06:00 tot 19:00 in het stadiongebied; venster 06:30–18:30
  -- lokaal dekt de opbouw en het vrijgeven van het parcours. De zaterdagraces
  -- (7,5 km) zijn BEWUST NIET opgenomen: te weinig verstoring voor een toeslag.
  ('amsterdam-marathon-2026', '2026-10-18T04:30:00Z', '2026-10-18T16:30:00Z', 'active', 'high', 'high'),

  -- Amsterdam Dance Event 2026 — nachtelijke uitstroom is bepalend, niet de
  -- conferentie overdag. Zomertijd eindigt in de nacht van 24 op 25 oktober.
  ('ade-2026', '2026-10-21T20:00:00Z', '2026-10-22T03:00:00Z', 'exit', 'high', 'elevated'),
  ('ade-2026', '2026-10-22T20:00:00Z', '2026-10-23T03:00:00Z', 'exit', 'high', 'elevated'),
  ('ade-2026', '2026-10-23T20:00:00Z', '2026-10-24T04:00:00Z', 'exit', 'very_high', 'high'),
  ('ade-2026', '2026-10-24T19:00:00Z', '2026-10-25T06:00:00Z', 'exit', 'very_high', 'high'),
  ('ade-2026', '2026-10-25T19:00:00Z', '2026-10-26T03:00:00Z', 'exit', 'high', 'elevated'),

  -- Oud & Nieuw 2026/2027 (CET). Kern 23:00–04:00 lokaal, schouders eromheen.
  ('oud-en-nieuw-2026', '2026-12-31T19:00:00Z', '2026-12-31T22:00:00Z', 'active', 'very_high', 'very_high'),
  ('oud-en-nieuw-2026', '2026-12-31T22:00:00Z', '2027-01-01T03:00:00Z', 'exit', 'extreme', 'extreme'),
  ('oud-en-nieuw-2026', '2027-01-01T03:00:00Z', '2027-01-01T07:00:00Z', 'exit', 'very_high', 'very_high'),

  -- Koningsnacht (26 april) en Koningsdag (27 april), CEST. Amsterdam krijgt via
  -- een zone-override een niveau hoger dan de andere steden.
  ('koningsdag-2027', '2027-04-26T18:00:00Z', '2027-04-27T02:00:00Z', 'exit', 'high', 'elevated'),
  ('koningsdag-2027', '2027-04-27T07:00:00Z', '2027-04-28T01:00:00Z', 'active', 'high', 'high'),

  -- Pinkpop 2027 — 18/19/20 juni, Megaland (CEST). Aankomst op de eerste dag,
  -- uitstroom in de slotnacht en de kampeerafbouw op maandag.
  ('pinkpop-2027', '2027-06-18T06:00:00Z', '2027-06-18T18:00:00Z', 'arrival', 'none', 'high'),
  ('pinkpop-2027', '2027-06-20T20:00:00Z', '2027-06-21T01:00:00Z', 'overnight', 'very_high', 'none'),
  ('pinkpop-2027', '2027-06-21T05:00:00Z', '2027-06-21T14:00:00Z', 'departure', 'very_high', 'none'),

  -- Defqon.1 2027 — 24 t/m 27 juni, Walibi Biddinghuizen (CEST). Maandagochtend
  -- verlaat een meerdaags kampeerpubliek een dorp van ~6.000 inwoners.
  ('defqon1-2027', '2027-06-24T06:00:00Z', '2027-06-24T18:00:00Z', 'arrival', 'none', 'high'),
  ('defqon1-2027', '2027-06-27T20:00:00Z', '2027-06-28T01:00:00Z', 'overnight', 'very_high', 'none'),
  ('defqon1-2027', '2027-06-28T05:00:00Z', '2027-06-28T14:00:00Z', 'departure', 'extreme', 'none'),

  -- NN North Sea Jazz 2027 — 9/10/11 juli, Rotterdam Ahoy (CEST). Geen camping:
  -- per avond een aankomst- en een uitstroompiek.
  ('north-sea-jazz-2027', '2027-07-09T15:00:00Z', '2027-07-09T19:00:00Z', 'arrival', 'none', 'high'),
  ('north-sea-jazz-2027', '2027-07-09T21:30:00Z', '2027-07-10T01:00:00Z', 'exit', 'very_high', 'none'),
  ('north-sea-jazz-2027', '2027-07-10T15:00:00Z', '2027-07-10T19:00:00Z', 'arrival', 'none', 'high'),
  ('north-sea-jazz-2027', '2027-07-10T21:30:00Z', '2027-07-11T01:00:00Z', 'exit', 'very_high', 'none'),
  ('north-sea-jazz-2027', '2027-07-11T14:00:00Z', '2027-07-11T18:00:00Z', 'arrival', 'none', 'high'),
  ('north-sea-jazz-2027', '2027-07-11T21:00:00Z', '2027-07-12T01:00:00Z', 'exit', 'very_high', 'none'),

  -- Zwarte Cross 2027 — 15 t/m 18 juli, Lichtenvoorde (CEST).
  ('zwarte-cross-2027', '2027-07-15T06:00:00Z', '2027-07-15T18:00:00Z', 'arrival', 'none', 'high'),
  ('zwarte-cross-2027', '2027-07-18T20:00:00Z', '2027-07-19T01:00:00Z', 'overnight', 'very_high', 'none'),
  ('zwarte-cross-2027', '2027-07-19T05:00:00Z', '2027-07-19T14:00:00Z', 'departure', 'very_high', 'none'),

  -- Lowlands 2027 — 20/21/22 augustus, Walibi Biddinghuizen (CEST). De camping
  -- opent traditioneel de dag ervoor; beide aankomstdagen hebben een venster.
  ('lowlands-2027', '2027-08-19T06:00:00Z', '2027-08-19T18:00:00Z', 'arrival', 'none', 'high'),
  ('lowlands-2027', '2027-08-20T06:00:00Z', '2027-08-20T16:00:00Z', 'arrival', 'none', 'high'),
  ('lowlands-2027', '2027-08-22T20:00:00Z', '2027-08-23T01:00:00Z', 'overnight', 'very_high', 'none'),
  ('lowlands-2027', '2027-08-23T05:00:00Z', '2027-08-23T14:00:00Z', 'departure', 'extreme', 'none'),

  -- TCS Amsterdam Marathon 2027 — zondag 31 oktober. Zomertijd eindigt die nacht,
  -- dus CET. De afsluitingslijst voor 2027 is nog niet gepubliceerd; deze zones en
  -- tijden volgen die van 2026 en moeten opnieuw worden bevestigd.
  ('amsterdam-marathon-2027', '2027-10-31T05:30:00Z', '2027-10-31T17:30:00Z', 'active', 'high', 'high'),

  -- Oud & Nieuw 2027/2028 (CET), identieke opbouw.
  ('oud-en-nieuw-2027', '2027-12-31T19:00:00Z', '2027-12-31T22:00:00Z', 'active', 'very_high', 'very_high'),
  ('oud-en-nieuw-2027', '2027-12-31T22:00:00Z', '2028-01-01T03:00:00Z', 'exit', 'extreme', 'extreme'),
  ('oud-en-nieuw-2027', '2028-01-01T03:00:00Z', '2028-01-01T07:00:00Z', 'exit', 'very_high', 'very_high')
) as w(slug, starts_at, ends_at, phase, pickup, dropoff) on w.slug = e.slug;

-- ── 4. ZONES ────────────────────────────────────────────────────────────────
-- Eén uniforme tabel: (evenement, matchertype, waarde, richting, override).
-- Keuze per evenement, met de motivatie in het rapport bij deze migratie:
--
--   postcode4      Amsterdam Marathon (de door de organisator opgegeven
--                  afgesloten straten, elk PDOK-geverifieerd op 2026-08-28),
--                  Megaland 6373, Walibi 8256, Ahoy 3084, Zwarte Cross 7131
--   locality       alleen waar de impact aantoonbaar plaatsbreed is:
--                  Biddinghuizen (~6.000 inwoners, 60.000+ bezoekers),
--                  Landgraaf en Lichtenvoorde. NOOIT voor Rotterdam of Amsterdam.
--   location_slug  city-wide evenementen: ADE, Koningsdag, Oud & Nieuw
--
-- Zones gelden per EVENEMENT, dus voor alle vensters ervan. Een brede zone staat
-- er daarom alleen bij een evenement waarvan élk venster die breedte rechtvaardigt.

insert into public.pricing_event_zones (
  event_id, zone_type, location_slug, postcode4, locality, direction, impact_override
)
select
  e.id,
  z.zone_type,
  case when z.zone_type = 'location_slug' then z.value end,
  case when z.zone_type = 'postcode4' then z.value::smallint end,
  case when z.zone_type = 'locality' then z.value end,
  z.direction,
  nullif(z.impact_override, '')
from seeded_event_ids e
join (values
  ('ade-2026', 'location_slug', 'amsterdam', 'both', ''),
  ('ade-2026', 'location_slug', 'amsterdam-centrum', 'both', ''),
  ('ade-2026', 'location_slug', 'amsterdam-noord', 'both', ''),
  ('ade-2026', 'location_slug', 'amsterdam-oost', 'both', ''),
  ('ade-2026', 'location_slug', 'amsterdam-oud-zuid-de-pijp', 'both', ''),
  ('ade-2026', 'location_slug', 'amsterdam-zuidas', 'both', ''),
  ('ade-2026', 'location_slug', 'amsterdam-zuidoost-bijlmer', 'both', ''),
  ('amsterdam-marathon-2026', 'postcode4', '1054', 'both', ''),
  ('amsterdam-marathon-2026', 'postcode4', '1071', 'both', ''),
  ('amsterdam-marathon-2026', 'postcode4', '1073', 'both', ''),
  ('amsterdam-marathon-2026', 'postcode4', '1074', 'both', ''),
  ('amsterdam-marathon-2026', 'postcode4', '1075', 'both', ''),
  ('amsterdam-marathon-2026', 'postcode4', '1076', 'both', ''),
  ('amsterdam-marathon-2026', 'postcode4', '1077', 'both', ''),
  ('amsterdam-marathon-2026', 'postcode4', '1078', 'both', ''),
  ('amsterdam-marathon-2026', 'postcode4', '1079', 'both', ''),
  ('amsterdam-marathon-2026', 'postcode4', '1082', 'both', ''),
  ('amsterdam-marathon-2026', 'postcode4', '1093', 'both', ''),
  ('amsterdam-marathon-2026', 'postcode4', '1094', 'both', ''),
  ('amsterdam-marathon-2026', 'postcode4', '1095', 'both', ''),
  ('amsterdam-marathon-2026', 'postcode4', '1098', 'both', ''),
  ('amsterdam-marathon-2026', 'postcode4', '1114', 'both', ''),
  ('amsterdam-marathon-2027', 'postcode4', '1054', 'both', ''),
  ('amsterdam-marathon-2027', 'postcode4', '1071', 'both', ''),
  ('amsterdam-marathon-2027', 'postcode4', '1073', 'both', ''),
  ('amsterdam-marathon-2027', 'postcode4', '1074', 'both', ''),
  ('amsterdam-marathon-2027', 'postcode4', '1075', 'both', ''),
  ('amsterdam-marathon-2027', 'postcode4', '1076', 'both', ''),
  ('amsterdam-marathon-2027', 'postcode4', '1077', 'both', ''),
  ('amsterdam-marathon-2027', 'postcode4', '1078', 'both', ''),
  ('amsterdam-marathon-2027', 'postcode4', '1079', 'both', ''),
  ('amsterdam-marathon-2027', 'postcode4', '1082', 'both', ''),
  ('amsterdam-marathon-2027', 'postcode4', '1093', 'both', ''),
  ('amsterdam-marathon-2027', 'postcode4', '1094', 'both', ''),
  ('amsterdam-marathon-2027', 'postcode4', '1095', 'both', ''),
  ('amsterdam-marathon-2027', 'postcode4', '1098', 'both', ''),
  ('amsterdam-marathon-2027', 'postcode4', '1114', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'almere', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'almere-buiten', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'almere-haven', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'almere-hout', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'almere-muziekwijk', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'almere-oostvaarders', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'almere-poort', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'almere-stad-centrum', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'amsterdam', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'amsterdam-centrum', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'amsterdam-noord', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'amsterdam-oost', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'amsterdam-oud-zuid-de-pijp', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'amsterdam-zuidas', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'amsterdam-zuidoost-bijlmer', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'utrecht', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'utrecht-centrum', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'leidsche-rijn', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'de-uithof-science-park', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'rotterdam', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'rotterdam-blijdorp', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'rotterdam-centrum', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'rotterdam-delfshaven', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'rotterdam-hillegersberg', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'rotterdam-kralingen', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'rotterdam-prins-alexander', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'den-haag', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'den-haag-benoordenhout', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'den-haag-centrum', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'den-haag-loosduinen', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'den-haag-scheveningen', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'den-haag-statenkwartier', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'den-haag-ypenburg', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'spijkenisse', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'spijkenisse-centrum', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'spijkenisse-de-akkers', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'spijkenisse-groenewoud', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'spijkenisse-hoogwerf', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'spijkenisse-maaswijk', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'spijkenisse-sterrenkwartier', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'breda', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'den-bosch', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'eindhoven', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'tilburg', 'both', ''),
  ('oud-en-nieuw-2026', 'location_slug', 'roosendaal', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'almere', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'almere-buiten', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'almere-haven', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'almere-hout', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'almere-muziekwijk', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'almere-oostvaarders', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'almere-poort', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'almere-stad-centrum', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'amsterdam', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'amsterdam-centrum', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'amsterdam-noord', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'amsterdam-oost', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'amsterdam-oud-zuid-de-pijp', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'amsterdam-zuidas', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'amsterdam-zuidoost-bijlmer', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'utrecht', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'utrecht-centrum', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'leidsche-rijn', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'de-uithof-science-park', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'rotterdam', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'rotterdam-blijdorp', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'rotterdam-centrum', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'rotterdam-delfshaven', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'rotterdam-hillegersberg', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'rotterdam-kralingen', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'rotterdam-prins-alexander', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'den-haag', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'den-haag-benoordenhout', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'den-haag-centrum', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'den-haag-loosduinen', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'den-haag-scheveningen', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'den-haag-statenkwartier', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'den-haag-ypenburg', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'spijkenisse', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'spijkenisse-centrum', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'spijkenisse-de-akkers', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'spijkenisse-groenewoud', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'spijkenisse-hoogwerf', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'spijkenisse-maaswijk', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'spijkenisse-sterrenkwartier', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'breda', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'den-bosch', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'eindhoven', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'tilburg', 'both', ''),
  ('oud-en-nieuw-2027', 'location_slug', 'roosendaal', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'amsterdam', 'both', 'very_high'),
  ('koningsdag-2027', 'location_slug', 'amsterdam-centrum', 'both', 'very_high'),
  ('koningsdag-2027', 'location_slug', 'amsterdam-noord', 'both', 'very_high'),
  ('koningsdag-2027', 'location_slug', 'amsterdam-oost', 'both', 'very_high'),
  ('koningsdag-2027', 'location_slug', 'amsterdam-oud-zuid-de-pijp', 'both', 'very_high'),
  ('koningsdag-2027', 'location_slug', 'amsterdam-zuidas', 'both', 'very_high'),
  ('koningsdag-2027', 'location_slug', 'amsterdam-zuidoost-bijlmer', 'both', 'very_high'),
  ('koningsdag-2027', 'location_slug', 'utrecht', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'utrecht-centrum', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'leidsche-rijn', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'de-uithof-science-park', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'rotterdam', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'rotterdam-blijdorp', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'rotterdam-centrum', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'rotterdam-delfshaven', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'rotterdam-hillegersberg', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'rotterdam-kralingen', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'rotterdam-prins-alexander', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'den-haag', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'den-haag-benoordenhout', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'den-haag-centrum', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'den-haag-loosduinen', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'den-haag-scheveningen', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'den-haag-statenkwartier', 'both', ''),
  ('koningsdag-2027', 'location_slug', 'den-haag-ypenburg', 'both', ''),
  ('pinkpop-2027', 'postcode4', '6373', 'both', ''),
  ('pinkpop-2027', 'locality', 'landgraaf', 'both', ''),
  ('defqon1-2027', 'postcode4', '8256', 'both', ''),
  ('defqon1-2027', 'locality', 'biddinghuizen', 'both', ''),
  ('north-sea-jazz-2027', 'postcode4', '3084', 'both', ''),
  ('zwarte-cross-2027', 'postcode4', '7131', 'both', ''),
  ('zwarte-cross-2027', 'locality', 'lichtenvoorde', 'both', ''),
  ('lowlands-2027', 'postcode4', '8256', 'both', ''),
  ('lowlands-2027', 'locality', 'biddinghuizen', 'both', '')
) as z(slug, zone_type, value, direction, impact_override) on z.slug = e.slug;

-- ── 5. VANGNET ──────────────────────────────────────────────────────────────

do $$
declare
  orphan text;
  bad_slug text;
begin
  select string_agg(e.slug, ', ') into orphan
  from seeded_event_ids e
  where not exists (select 1 from public.pricing_event_windows w where w.event_id = e.id)
     or not exists (select 1 from public.pricing_event_zones z where z.event_id = e.id);
  if orphan is not null then
    raise exception 'pricing_events_seed: evenement(en) zonder venster of zone: % — migratie afgebroken', orphan;
  end if;

  select string_agg(distinct z.location_slug, ', ') into bad_slug
  from public.pricing_event_zones z
  join seeded_event_ids e on e.id = z.event_id
  where z.zone_type = 'location_slug'
    and not exists (select 1 from public.locations l where l.slug = z.location_slug and l.active);
  if bad_slug is not null then
    raise exception 'pricing_events_seed: zone verwijst naar onbekende/inactieve locatie(s): % — migratie afgebroken', bad_slug;
  end if;
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- ACTIVERING — NIET onderdeel van deze migratie. Zie het Phase 5.6-rapport voor
-- de volledige stappen; kort samengevat, eerst op staging:
--
--   update public.pricing_events set pricing_enabled = true, updated_at = now()
--   where slug = 'ade-2026';
--
--   update public.pricing_event_config set enabled = true, updated_at = now()
--   where active;
--
--   -- noodknop (werkt binnen 60 seconden door de cache-TTL heen)
--   update public.pricing_event_config set enabled = false, updated_at = now() where active;
-- ═══════════════════════════════════════════════════════════════════════════
