-- ADE 2026 — venstercorrectie (optie B uit het rendementsmodel van 2026-10-09).
--
-- WAAROM. De bestaande ADE-configuratie heeft vijf vensters, alle met
-- event_phase = 'exit', en lokale starttijden die onderling verschillen
-- (22:00 / 22:00 / 22:00 / 21:00 / 20:00). Daardoor:
--
--   1. ADE Pro overdag (21–24 oktober, geverifieerd op de officiële
--      programma-aankondiging) is volledig onbelast;
--   2. de clubaankomst tussen 18:00 en 22:00 lokaal is onbelast — een rit om
--      21:00 lokaal levert vandaag €0,00 evenemententarief op;
--   3. de uitstroomstaart stopt om 05:00–07:00 lokaal, terwijl venues met een
--      24-uurslicentie (Shelter programmeert 23:00–08:00) tot 08:00 doorlopen;
--   4. de ongelijke starttijden zijn vrijwel zeker een UTC-omrekenfout rond de
--      zomertijdwisseling, niet een bewuste keuze.
--
-- WAT. Vervangt UITSLUITEND de vensters van ade-2026 door een volledige,
-- DST-correcte set van veertien vensters. Raakt geen enkel ander evenement,
-- geen zones, geen tariefregels en niet pricing_event_config. `pricing_enabled`
-- blijft zoals het staat — deze migratie zet Event Pricing NIET aan.
--
-- TIJDZONE. Alle grenzen zijn hier als UTC opgeslagen, bewust, omdat de
-- zomertijd op zondag 25 oktober 2026 om 03:00 CEST naar 02:00 CET gaat.
-- Tot en met 25 oktober 02:59 lokaal geldt UTC+2, daarna UTC+1. De nacht van
-- zaterdag op zondag duurt daardoor elf klokuren in plaats van tien; dat is
-- correct en opzettelijk.
--
-- ROLLBACK. Forward-only (geen PITR op dit plan). De omgekeerde migratie staat
-- in 20261009120001_ade_2026_window_correction_rollback.sql en herstelt exact
-- de vijf oorspronkelijke vensters.

begin;

-- Veiligheidsnet: faal hard als het evenement niet bestaat, zodat deze migratie
-- nooit stilletjes niets doet.
do $$
begin
  if not exists (select 1 from public.pricing_events where slug = 'ade-2026') then
    raise exception 'ade-2026 bestaat niet — migratie afgebroken';
  end if;
end $$;

delete from public.pricing_event_windows
where event_id = (select id from public.pricing_events where slug = 'ade-2026');

insert into public.pricing_event_windows
  (event_id, starts_at, ends_at, event_phase, pickup_impact_level, dropoff_impact_level, active)
select e.id, w.starts_at, w.ends_at, w.event_phase, w.pickup_impact_level, w.dropoff_impact_level, true
from public.pricing_events e
cross join (values
  -- ── ADE Pro, overdag 10:00–18:00 lokaal (CEST, UTC+2) ─────────────────────
  -- Zakelijk bezoek en conferentieverkeer. Bewust 'elevated' en niet hoger:
  -- de drukte is reëel maar de nachtelijke uitstroomproblematiek ontbreekt.
  ('2026-10-21T08:00:00Z'::timestamptz, '2026-10-21T16:00:00Z'::timestamptz, 'active',  'elevated',  'elevated'),
  ('2026-10-22T08:00:00Z'::timestamptz, '2026-10-22T16:00:00Z'::timestamptz, 'active',  'elevated',  'elevated'),
  ('2026-10-23T08:00:00Z'::timestamptz, '2026-10-23T16:00:00Z'::timestamptz, 'active',  'elevated',  'elevated'),
  ('2026-10-24T08:00:00Z'::timestamptz, '2026-10-24T16:00:00Z'::timestamptz, 'active',  'elevated',  'elevated'),

  -- ── Aankomst 18:00–22:00 lokaal ───────────────────────────────────────────
  -- Dropoff weegt zwaarder dan pickup: het afzetten bij een vol wordende venue
  -- kost tijd, het ophalen elders niet.
  ('2026-10-21T16:00:00Z'::timestamptz, '2026-10-21T20:00:00Z'::timestamptz, 'arrival', 'elevated',  'high'),
  ('2026-10-22T16:00:00Z'::timestamptz, '2026-10-22T20:00:00Z'::timestamptz, 'arrival', 'elevated',  'high'),
  ('2026-10-23T16:00:00Z'::timestamptz, '2026-10-23T20:00:00Z'::timestamptz, 'arrival', 'elevated',  'high'),
  ('2026-10-24T16:00:00Z'::timestamptz, '2026-10-24T20:00:00Z'::timestamptz, 'arrival', 'elevated',  'high'),
  -- 25 oktober valt ná de wisseling naar wintertijd: 18:00 lokaal = 17:00Z.
  ('2026-10-25T17:00:00Z'::timestamptz, '2026-10-25T21:00:00Z'::timestamptz, 'arrival', 'elevated',  'high'),

  -- ── Uitstroom 22:00 lokaal → 08:00 lokaal de volgende ochtend ─────────────
  -- Pickup weegt het zwaarst: menigte, afsluitingen, wachttijd. De weekcurve
  -- van de oorspronkelijke configuratie is bewust behouden — woensdag en
  -- donderdag 'high', vrijdag en zaterdag 'very_high', zondag terug naar 'high'.
  ('2026-10-21T20:00:00Z'::timestamptz, '2026-10-22T06:00:00Z'::timestamptz, 'exit', 'high',      'elevated'),
  ('2026-10-22T20:00:00Z'::timestamptz, '2026-10-23T06:00:00Z'::timestamptz, 'exit', 'high',      'elevated'),
  ('2026-10-23T20:00:00Z'::timestamptz, '2026-10-24T06:00:00Z'::timestamptz, 'exit', 'very_high', 'high'),
  -- Nacht zaterdag→zondag: elf klokuren, want de klok gaat een uur terug.
  ('2026-10-24T20:00:00Z'::timestamptz, '2026-10-25T07:00:00Z'::timestamptz, 'exit', 'very_high', 'high'),
  -- Nacht zondag→maandag: volledig in wintertijd, 22:00 lokaal = 21:00Z.
  ('2026-10-25T21:00:00Z'::timestamptz, '2026-10-26T07:00:00Z'::timestamptz, 'exit', 'high',      'elevated')
) as w(starts_at, ends_at, event_phase, pickup_impact_level, dropoff_impact_level)
where e.slug = 'ade-2026';

-- Controle: exact veertien vensters, en geen enkel venster dat de klok ingaat.
do $$
declare n int; bad int;
begin
  select count(*) into n from public.pricing_event_windows w
  join public.pricing_events e on e.id = w.event_id where e.slug = 'ade-2026';
  if n <> 14 then raise exception 'verwacht 14 ADE-vensters, kreeg %', n; end if;

  select count(*) into bad from public.pricing_event_windows w
  join public.pricing_events e on e.id = w.event_id
  where e.slug = 'ade-2026' and w.ends_at <= w.starts_at;
  if bad > 0 then raise exception '% venster(s) met eind <= start', bad; end if;
end $$;

commit;
