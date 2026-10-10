-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: aankomsttoeslag per luchthaven (configuratie)
-- Datum: 2026-10-10
--
-- Aanleiding: vaste routes bestonden uitsluitend in de richting STAD →
-- LUCHTHAVEN. Een rit die OP een luchthaven begint had daardoor geen enkele
-- prijsbron en viel altijd terug op "Offerte op aanvraag" — 27 van de laatste
-- 28 aankomstaanvragen (96,4%) kreeg geen prijs.
--
-- Commercieel akkoord (2026-10-10): de heenprijs wordt gespiegeld als basis,
-- met daarbovenop een vaste aankomsttoeslag per luchthaven. De voertuig-
-- kilometers zijn grotendeels symmetrisch, maar een aankomstrit vraagt extra
-- vluchtmonitoring, afstemming, mogelijke wachttijd en luchthaven-/parkeer-
-- kosten; alleen spiegelen zou opnieuw te krap zijn.
--
-- Deze migratie levert UITSLUITEND DE CONFIGURATIE. De gespiegelde routes
-- zitten in de volgmigratie 20261010120500_reverse_fixed_routes.sql; de
-- berekening staat in lib/pricing/airport-arrival-surcharge.ts.
--
-- Bewust configuratie in de DATABASE en niet in de code: het bedrag is een
-- commerciële parameter die per luchthaven moet kunnen verschillen en zonder
-- deploy bij te stellen moet zijn.
--
-- Additief: GEEN wijziging aan bestaande tabellen, routes of eerder toegepaste
-- migraties. Zelfde beveiligingspatroon als pricing_approach_fee_config /
-- pricing_deadhead_config: RLS aan, GEEN publieke policy, uitsluitend
-- service_role (de prijsbepaling draait server-side).
--
-- Seed-inserts zijn BEWUST NIET "on conflict do nothing": een bestaande rij met
-- een AFWIJKEND bedrag moet hard falen in plaats van stil genegeerd te worden.
-- Ontbreekt-dan-invoegen, bestaat-identiek-dan-no-op, bestaat-afwijkend-dan-
-- RAISE EXCEPTION (hele transactie rolt terug).
--
-- Antwerpen en Brussel krijgen BEWUST GEEN rij: onvoldoende kostendata voor de
-- grensoverschrijdende opstelkosten. Die twee routes blijven daardoor
-- "Offerte op aanvraag", precies zoals nu.
--
-- ROLLBACK (forward-only; dit project heeft geen PITR):
--   delete from public.pricing_airport_arrival_surcharge;
--   drop table public.pricing_airport_arrival_surcharge;
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door de eigenaar, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

create table if not exists public.pricing_airport_arrival_surcharge (
  id uuid primary key default gen_random_uuid(),
  airport_location_id uuid not null references public.locations (id),
  surcharge_cents integer not null,
  active boolean not null default true,
  valid_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_airport_arrival_surcharge_cents_check
    check (surcharge_cents >= 0 and surcharge_cents <= 10000)
);

-- Hoogstens één actieve configuratie per luchthaven. Partial unique index,
-- zodat een historische (active = false) rij bewaard kan blijven.
create unique index if not exists pricing_airport_arrival_surcharge_airport_active_unique
  on public.pricing_airport_arrival_surcharge (airport_location_id)
  where active;

-- Dekkende index voor de foreign key. De partiële unique index hierboven dekt
-- hem NIET (hij geldt alleen voor active-rijen), en zonder deze index verschijnt
-- de tabel in de Supabase-advisor `unindexed_foreign_keys`.
create index if not exists pricing_airport_arrival_surcharge_airport_location_id_idx
  on public.pricing_airport_arrival_surcharge (airport_location_id);

comment on table public.pricing_airport_arrival_surcharge is
  'Vaste aankomsttoeslag per luchthaven, toegepast wanneer een rit OP die luchthaven begint. Eenmaal per rit, ook bij retour. Zie lib/pricing/airport-arrival-surcharge.ts.';
comment on column public.pricing_airport_arrival_surcharge.surcharge_cents is
  'Vast bedrag in hele centen, bovenop de gespiegelde heenprijs. Valt buiten de nachttoeslagbasis.';

alter table public.pricing_airport_arrival_surcharge enable row level security;

-- GEEN publieke policy: uitsluitend service_role leest deze tabel, net als bij
-- pricing_approach_fee_config. De prijsbepaling draait altijd server-side.
revoke all on public.pricing_airport_arrival_surcharge from anon, authenticated;
grant select on public.pricing_airport_arrival_surcharge to service_role;

-- ── Seed: bedragen per luchthaven ────────────────────────────────────────────
--   Schiphol                    €15,00  (hoogste opstel-/parkeerkosten, grootste
--                                        vertragingsspreiding, grootste volume)
--   Rotterdam The Hague Airport €10,00
--   Eindhoven Airport           €10,00
--   Antwerpen / Brussel         geen rij — blijft "Offerte op aanvraag"

do $$
declare
  seed record;
  bestaand integer;
begin
  for seed in
    select * from (values
      ('schiphol-airport',   1500),
      ('rotterdam-airport',  1000),
      ('eindhoven-airport',  1000)
    ) as s(airport_slug, surcharge_cents)
  loop
    select a.surcharge_cents into bestaand
    from public.pricing_airport_arrival_surcharge a
    join public.locations l on l.id = a.airport_location_id
    where l.slug = seed.airport_slug and a.active;

    if bestaand is null then
      insert into public.pricing_airport_arrival_surcharge (airport_location_id, surcharge_cents)
      select l.id, seed.surcharge_cents
      from public.locations l
      where l.slug = seed.airport_slug and l.location_type = 'airport';

      if not found then
        raise exception 'Luchthaven % niet gevonden in locations (of niet van het type airport)', seed.airport_slug;
      end if;

    elsif bestaand <> seed.surcharge_cents then
      raise exception 'Aankomsttoeslag voor % staat al op % cent, seed verwacht % cent — handmatig beoordelen',
        seed.airport_slug, bestaand, seed.surcharge_cents;
    end if;
  end loop;
end $$;

COMMIT;
