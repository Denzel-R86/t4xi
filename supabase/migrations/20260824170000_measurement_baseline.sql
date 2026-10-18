-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: meetnulpunt voor conversie — telling start opnieuw op 2026-08-24
-- Datum: 2026-08-24
--
-- AANLEIDING
--   De cijfers van vóór vandaag zijn onbruikbaar als conversiebasis:
--     · ze bevatten audit- en testverkeer (o.a. de full-stack audit van 19-08);
--     · één bezoeker levert 3 tot 11 offerteregels op (live prijs bij elke
--       wijziging van adres, datum, tijd of bagage). Op 14-08 stonden er
--       43 offertes tegenover 4 unieke vertrekpunten, op 15-08 49 tegen 5.
--
-- WAT DEZE MIGRATIE WEL DOET
--   Legt een expliciet nulpunt vast en levert één rapportageweergave die
--   uitsluitend telt vanaf dat moment. Additief en volledig omkeerbaar.
--
-- WAT DEZE MIGRATIE BEWUST NIET DOET
--   Er wordt NIETS verwijderd. `pricing_quote_logs` is de historische bron
--   waar de pricing brain-factor `hist_acceptance` op wacht (zie
--   20260706140100_pricing_brain_seed_factors.sql) en is tevens het
--   audit-spoor van de prijsengine. Wissen is onomkeerbaar en levert geen
--   beter cijfer op — alleen een leger cijfer.
--
-- BELANGRIJKE BEPERKING — LEES DIT VOORDAT JE DE CIJFERS GEBRUIKT
--   Deze weergave meet GEEN conversie in marketingzin. In de database staat
--   geen bezoeker-id, sessie-id, IP of user-agent. Daardoor is niet te zien:
--     · hoeveel mensen de site bezochten zonder een adres in te vullen;
--     · of tien offertes van één persoon of van tien personen komen;
--     · waar iemand afhaakt.
--   De teller `boekingen` is betrouwbaar. Alles wat op offertes is gebaseerd,
--   is een BOVENGRENS van de intentie, geen bezoekersaantal. Echte conversie
--   vereist frontend-analytics met vier stappen (pagina → adres → prijs →
--   boeking). Zie het auditrapport.
--
-- Idempotent. NIET AUTOMATISCH — eerst staging, dan prod op sein.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Apart schema, buiten de PostgREST-API ───────────────────────────────
-- `public` wordt door Supabase als REST-API aangeboden. Rapportage over
-- boekingsaantallen hoort daar niet in, ook niet achter RLS. Een eigen schema
-- dat niet in `db-schemas` staat, is nooit via /rest/v1 bereikbaar.
create schema if not exists analytics;

revoke all on schema analytics from anon, authenticated;
grant usage on schema analytics to service_role;

-- ── 2. Het nulpunt zelf ────────────────────────────────────────────────────
-- Als tabel vastgelegd in plaats van hardcoded, zodat een volgende reset een
-- rij is en geen codewijziging. `id` is de meetreeks; er kunnen er meer komen.
create table if not exists analytics.measurement_baselines (
  id          text        primary key,
  starts_at   timestamptz not null,
  reason      text        not null,
  created_at  timestamptz not null default now()
);

revoke all on analytics.measurement_baselines from anon, authenticated;
grant select, insert, update on analytics.measurement_baselines to service_role;

-- LET OP — waarom 25 en niet 24 augustus.
-- Op 24-08 is de hercontrole van de audit uitgevoerd: circa 25 offerte-aanroepen
-- en een rate-limittest van 18 requests, allemaal op dezelfde route. Die dag
-- telt 31 offerteaanvragen tegenover 2 unieke ritintenties. Het nulpunt ligt
-- daarom op de eerstvolgende middernacht, zodat dag 1 van de meting schoon is.
-- Wil je toch vanaf 24-08 tellen: zet de datum hieronder terug.
insert into analytics.measurement_baselines (id, starts_at, reason)
values (
  'conversion',
  timestamptz '2026-08-25 00:00:00+02',
  'Schone start na de full-stack audit: prijsmanipulatie gedicht, rate limiting actief, anon-insertpolicies verwijderd, EN-landingspagina''s live. 24-08 is bewust uitgesloten omdat die dag auditverkeer bevat.'
)
on conflict (id) do nothing;

-- ── 3. Rapportage vanaf het nulpunt ────────────────────────────────────────
-- security_invoker: de weergave draait met de rechten van de aanroeper, niet
-- van de eigenaar. Zonder dit zou hij RLS omzeilen.
create or replace view analytics.conversion_since_baseline
with (security_invoker = true) as
with basis as (
  select starts_at from analytics.measurement_baselines where id = 'conversion'
)
select
  (select starts_at from basis)                                as gemeten_vanaf,
  now()                                                        as gemeten_tot,

  -- Betrouwbaar: één rij per daadwerkelijk vastgelegde boeking.
  (select count(*) from public.bookings b, basis
     where b.created_at >= basis.starts_at)                    as boekingen,
  (select count(*) from public.bookings b, basis
     where b.created_at >= basis.starts_at
       and b.payment_status = 'paid')                          as boekingen_betaald,
  (select coalesce(sum(b.price_euros), 0) from public.bookings b, basis
     where b.created_at >= basis.starts_at
       and b.payment_status = 'paid')                          as omzet_betaald_euro,

  -- Bovengrens van de intentie, GEEN bezoekersaantal (zie kop).
  (select count(*) from public.price_snapshots s, basis
     where s.created_at >= basis.starts_at)                    as offertes_ruw,
  (select count(*) from public.price_snapshots s, basis
     where s.created_at >= basis.starts_at
       and s.consumed_at is not null)                          as offertes_omgezet,

  -- Grove ontdubbeling: dezelfde route op dezelfde dag telt één keer. Dit
  -- benadert "unieke ritintenties" beter dan de ruwe telling, maar blijft een
  -- schatting zolang er geen sessie-id is.
  (select count(*) from (
     select distinct s.created_at::date,
            s.route_snapshot->>'pickupSlug',
            s.route_snapshot->>'dropoffSlug'
       from public.price_snapshots s, basis
      where s.created_at >= basis.starts_at
   ) d)                                                        as unieke_ritintenties_schatting,

  -- Kwaliteit van de prijsdekking: hoe vaak kon er géén prijs worden gegeven.
  (select count(*) from public.pricing_quote_logs q, basis
     where q.created_at >= basis.starts_at)                    as offerteaanvragen,
  (select count(*) from public.pricing_quote_logs q, basis
     where q.created_at >= basis.starts_at
       and q.error_code is not null)                           as zonder_prijs,
  (select round(
     100.0 * count(*) filter (where q.error_code is not null)
     / nullif(count(*), 0), 1)
     from public.pricing_quote_logs q, basis
    where q.created_at >= basis.starts_at)                     as zonder_prijs_pct;

revoke all on analytics.conversion_since_baseline from anon, authenticated;
grant select on analytics.conversion_since_baseline to service_role;

-- ── 4. Dagstaat, voor trend na een campagne ────────────────────────────────
create or replace view analytics.conversion_daily
with (security_invoker = true) as
with basis as (
  select starts_at from analytics.measurement_baselines where id = 'conversion'
),
dagen as (
  select generate_series(
           (select starts_at from basis)::date,
           current_date,
           interval '1 day'
         )::date as dag
)
select
  d.dag,
  (select count(*) from public.pricing_quote_logs q
     where q.created_at::date = d.dag)                         as offerteaanvragen,
  (select count(*) from public.pricing_quote_logs q
     where q.created_at::date = d.dag
       and q.error_code is not null)                           as zonder_prijs,
  (select count(*) from (
     select distinct s.route_snapshot->>'pickupSlug',
            s.route_snapshot->>'dropoffSlug'
       from public.price_snapshots s
      where s.created_at::date = d.dag
   ) x)                                                        as unieke_ritintenties_schatting,
  (select count(*) from public.bookings b
     where b.created_at::date = d.dag)                         as boekingen,
  (select count(*) from public.bookings b
     where b.created_at::date = d.dag
       and b.payment_status = 'paid')                          as boekingen_betaald
from dagen d
order by d.dag desc;

revoke all on analytics.conversion_daily from anon, authenticated;
grant select on analytics.conversion_daily to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- TERUGDRAAIEN (indien nodig)
--   drop view if exists analytics.conversion_daily;
--   drop view if exists analytics.conversion_since_baseline;
--   drop table if exists analytics.measurement_baselines;
--   drop schema if exists analytics;
--
-- NULPUNT LATER VERZETTEN (bijvoorbeeld bij de start van een campagne)
--   update analytics.measurement_baselines
--      set starts_at = timestamptz '2026-09-01 00:00:00+02',
--          reason    = 'Start campagne X'
--    where id = 'conversion';
-- ═══════════════════════════════════════════════════════════════════════════
