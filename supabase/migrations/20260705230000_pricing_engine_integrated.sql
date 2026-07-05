-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: T4XI Pricing Engine — geïntegreerd schema (Stap 1)
-- Datum: 2026-07-05
--
-- Doel: de pricing-engine tabellen veilig naast de bestaande
--       addresses/RLS-setup zetten in het huidige Supabase-project.
--       GEEN parallel project, GEEN dubbele schema's, GEEN conflicten.
--
-- Bestaande remote tabellen (NIET aangeraakt):
--   addresses, address_search_cache, popular_locations, bookings, spatial_ref_sys
--   → 'bookings' bestaat al, daarom logt deze engine naar 'pricing_quote_logs'.
--
-- Nieuwe tabellen (10):
--   cities, districts, locations, airports, vehicle_classes, vehicles,
--   pricing_rules, fixed_route_prices, price_adjustments, pricing_quote_logs
--
-- Bron seed: de huidige GEPUBLICEERDE T4XI-tarieven
--   (components/sections/PriceTables.tsx — tabbladen Amsterdam/Rotterdam/Overig).
--   Retourprijs = round(enkel × 1,8); voor elke route expliciet opgeslagen
--   in fixed_route_prices.return_price zodat de website exact matcht.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door owner, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

create extension if not exists "pgcrypto";

-- Eigen trigger-functie met unieke naam, zodat een eventuele bestaande
-- public.set_updated_at() (van de addresses-setup) niet wordt overschreven.
create or replace function public.pricing_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. TABELLEN
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  country_code text not null default 'NL',
  province text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.districts (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  name text not null,
  slug text not null,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, slug)
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities(id) on delete set null,
  district_id uuid references public.districts(id) on delete set null,
  name text not null,
  slug text not null unique,
  location_type text not null default 'city'
    check (location_type in ('city', 'district', 'airport', 'address', 'landmark')),
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.airports (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  city_id uuid references public.cities(id) on delete set null,
  name text not null,
  iata_code text not null unique,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_classes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_multiplier numeric(8, 4) not null default 1,
  fixed_surcharge numeric(10, 2) not null default 0,
  max_passengers integer not null,
  max_luggage integer not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  vehicle_class_id uuid not null references public.vehicle_classes(id) on delete restrict,
  name text not null,
  make text,
  model text,
  fuel_type text not null default 'electric'
    check (fuel_type in ('electric', 'hybrid', 'petrol', 'diesel')),
  max_passengers integer not null,
  max_luggage integer not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  currency text not null default 'EUR',
  base_fare numeric(10, 2) not null,
  price_per_km numeric(10, 2) not null,
  price_per_minute numeric(10, 2) not null,
  vat_rate numeric(5, 2) not null default 9,
  minimum_fare numeric(10, 2) not null default 0,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, version)
);

-- fixed_route_prices krijgt t.o.v. het pricing-engine-schema een expliciete
-- return_price kolom. Reden: de website publiceert per route een vaste
-- retourprijs; die hier opslaan garandeert exacte match en ontkoppelt van het
-- (afwijkende) −10% retourmodel van de losse engine. Zie rapport / open vragen.
create table if not exists public.fixed_route_prices (
  id uuid primary key default gen_random_uuid(),
  pickup_location_id uuid not null references public.locations(id) on delete restrict,
  dropoff_location_id uuid not null references public.locations(id) on delete restrict,
  vehicle_class_id uuid not null references public.vehicle_classes(id) on delete restrict,
  price numeric(10, 2) not null,               -- enkele rit (all-in, incl. btw)
  return_price numeric(10, 2),                  -- gepubliceerde retourprijs (all-in)
  currency text not null default 'EUR',
  distance_km numeric(10, 2) not null,
  estimated_duration_min integer not null,      -- schatting; beïnvloedt vaste prijs niet
  vat_rate numeric(5, 2) not null default 9,
  source_label text,
  active boolean not null default true,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pickup_location_id, dropoff_location_id, vehicle_class_id, valid_from)
);

create table if not exists public.price_adjustments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  adjustment_type text not null check (
    adjustment_type in (
      'airport_surcharge',
      'night_surcharge',
      'weekend_surcharge',
      'holiday_surcharge',
      'return_discount',
      'commercial_rounding'
    )
  ),
  amount_type text not null check (amount_type in ('fixed', 'percentage')),
  amount numeric(10, 2) not null,
  applies_to text not null default 'all'
    check (applies_to in ('all', 'pickup', 'dropoff', 'route_total')),
  airport_id uuid references public.airports(id) on delete cascade,
  day_of_week integer check (day_of_week between 1 and 7),
  holiday_date date,
  start_time time,
  end_time time,
  priority integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

-- Audit-/analyticslog van elke prijsofferte (vervangt 'bookings' voor dit doel,
-- omdat bookings al bestaat). Bevat requestgegevens → alleen server (service_role).
create table if not exists public.pricing_quote_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pickup_location_id uuid references public.locations(id) on delete set null,
  dropoff_location_id uuid references public.locations(id) on delete set null,
  pickup_input text,
  dropoff_input text,
  vehicle_class_code text,
  passengers integer,
  luggage integer,
  is_return boolean not null default false,
  distance_km numeric(10, 2),
  estimated_duration_min integer,
  quoted_price numeric(10, 2),
  currency text not null default 'EUR',
  price_source text check (price_source in ('fixed_route_prices', 'pricing_rules')),
  data_source text check (data_source in ('supabase', 'fallback')),
  price_breakdown jsonb,
  request_payload jsonb,
  error_code text
);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. INDEXES
-- ─────────────────────────────────────────────────────────────────────────

create index if not exists districts_city_id_idx on public.districts(city_id);
create index if not exists locations_city_id_idx on public.locations(city_id);
create index if not exists locations_district_id_idx on public.locations(district_id);
create index if not exists locations_slug_active_idx on public.locations(slug, active);
create index if not exists airports_location_id_idx on public.airports(location_id);
create index if not exists vehicles_vehicle_class_id_idx on public.vehicles(vehicle_class_id);
create index if not exists fixed_route_lookup_idx
  on public.fixed_route_prices(pickup_location_id, dropoff_location_id, vehicle_class_id, active);
create index if not exists fixed_route_prices_pickup_idx on public.fixed_route_prices(pickup_location_id);
create index if not exists fixed_route_prices_dropoff_idx on public.fixed_route_prices(dropoff_location_id);
create index if not exists price_adjustments_type_active_idx
  on public.price_adjustments(adjustment_type, active);
create index if not exists pricing_quote_logs_created_at_idx on public.pricing_quote_logs(created_at);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. updated_at TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────

drop trigger if exists set_cities_updated_at on public.cities;
create trigger set_cities_updated_at before update on public.cities
  for each row execute function public.pricing_set_updated_at();

drop trigger if exists set_districts_updated_at on public.districts;
create trigger set_districts_updated_at before update on public.districts
  for each row execute function public.pricing_set_updated_at();

drop trigger if exists set_locations_updated_at on public.locations;
create trigger set_locations_updated_at before update on public.locations
  for each row execute function public.pricing_set_updated_at();

drop trigger if exists set_airports_updated_at on public.airports;
create trigger set_airports_updated_at before update on public.airports
  for each row execute function public.pricing_set_updated_at();

drop trigger if exists set_vehicle_classes_updated_at on public.vehicle_classes;
create trigger set_vehicle_classes_updated_at before update on public.vehicle_classes
  for each row execute function public.pricing_set_updated_at();

drop trigger if exists set_vehicles_updated_at on public.vehicles;
create trigger set_vehicles_updated_at before update on public.vehicles
  for each row execute function public.pricing_set_updated_at();

drop trigger if exists set_pricing_rules_updated_at on public.pricing_rules;
create trigger set_pricing_rules_updated_at before update on public.pricing_rules
  for each row execute function public.pricing_set_updated_at();

drop trigger if exists set_fixed_route_prices_updated_at on public.fixed_route_prices;
create trigger set_fixed_route_prices_updated_at before update on public.fixed_route_prices
  for each row execute function public.pricing_set_updated_at();

drop trigger if exists set_price_adjustments_updated_at on public.price_adjustments;
create trigger set_price_adjustments_updated_at before update on public.price_adjustments
  for each row execute function public.pricing_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
--    Referentie-/prijsdata: publiek leesbaar mits active = true (anon key).
--    Schrijven: geen anon/authenticated policy → alleen service_role (admin).
--    pricing_quote_logs: RLS aan, GEEN policies → uitsluitend service_role.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.cities             enable row level security;
alter table public.districts          enable row level security;
alter table public.locations          enable row level security;
alter table public.airports           enable row level security;
alter table public.vehicle_classes    enable row level security;
alter table public.vehicles           enable row level security;
alter table public.pricing_rules      enable row level security;
alter table public.fixed_route_prices enable row level security;
alter table public.price_adjustments  enable row level security;
alter table public.pricing_quote_logs enable row level security;

drop policy if exists "pricing_read_active_cities" on public.cities;
create policy "pricing_read_active_cities" on public.cities
  for select to anon, authenticated using (active = true);

drop policy if exists "pricing_read_active_districts" on public.districts;
create policy "pricing_read_active_districts" on public.districts
  for select to anon, authenticated using (active = true);

drop policy if exists "pricing_read_active_locations" on public.locations;
create policy "pricing_read_active_locations" on public.locations
  for select to anon, authenticated using (active = true);

drop policy if exists "pricing_read_active_airports" on public.airports;
create policy "pricing_read_active_airports" on public.airports
  for select to anon, authenticated using (active = true);

drop policy if exists "pricing_read_active_vehicle_classes" on public.vehicle_classes;
create policy "pricing_read_active_vehicle_classes" on public.vehicle_classes
  for select to anon, authenticated using (active = true);

drop policy if exists "pricing_read_active_vehicles" on public.vehicles;
create policy "pricing_read_active_vehicles" on public.vehicles
  for select to anon, authenticated using (active = true);

drop policy if exists "pricing_read_active_pricing_rules" on public.pricing_rules;
create policy "pricing_read_active_pricing_rules" on public.pricing_rules
  for select to anon, authenticated using (active = true);

drop policy if exists "pricing_read_active_fixed_route_prices" on public.fixed_route_prices;
create policy "pricing_read_active_fixed_route_prices" on public.fixed_route_prices
  for select to anon, authenticated using (active = true);

drop policy if exists "pricing_read_active_price_adjustments" on public.price_adjustments;
create policy "pricing_read_active_price_adjustments" on public.price_adjustments
  for select to anon, authenticated using (active = true);

-- pricing_quote_logs: bewust GEEN anon/authenticated policy (deny-by-default).

-- ─────────────────────────────────────────────────────────────────────────
-- 5. SEED — steden
-- ─────────────────────────────────────────────────────────────────────────

insert into public.cities (name, slug, country_code, province, latitude, longitude) values
  ('Amsterdam', 'amsterdam', 'NL', 'Noord-Holland', 52.3676000, 4.9041000),
  ('Rotterdam', 'rotterdam', 'NL', 'Zuid-Holland',   51.9244000, 4.4777000),
  ('Den Haag',  'den-haag',  'NL', 'Zuid-Holland',   52.0705000, 4.3007000),
  ('Utrecht',   'utrecht',   'NL', 'Utrecht',        52.0907000, 5.1214000),
  ('Almere',    'almere',    'NL', 'Flevoland',      52.3508000, 5.2647000),
  ('Eindhoven', 'eindhoven', 'NL', 'Noord-Brabant',  51.4416000, 5.4697000),
  ('Schiphol',  'schiphol',  'NL', 'Noord-Holland',  52.3105000, 4.7683000)
on conflict (slug) do update set
  name = excluded.name, province = excluded.province,
  latitude = excluded.latitude, longitude = excluded.longitude, active = true;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. SEED — districts (stadsdelen/wijken)
-- ─────────────────────────────────────────────────────────────────────────

insert into public.districts (city_id, name, slug)
select c.id, d.name, d.slug
from (values
  ('almere',    'Almere Poort',                 'almere-poort'),
  ('almere',    'Almere Stad Centrum',          'almere-stad-centrum'),
  ('almere',    'Almere Haven',                 'almere-haven'),
  ('almere',    'Almere Muziekwijk',            'almere-muziekwijk'),
  ('almere',    'Almere Buiten',                'almere-buiten'),
  ('almere',    'Almere Hout',                  'almere-hout'),
  ('almere',    'Almere Oostvaarders',          'almere-oostvaarders'),
  ('amsterdam', 'Amsterdam Zuidas',             'amsterdam-zuidas'),
  ('amsterdam', 'Amsterdam Centrum',            'amsterdam-centrum'),
  ('amsterdam', 'Amsterdam Oud-Zuid / De Pijp', 'amsterdam-oud-zuid-de-pijp'),
  ('amsterdam', 'Amsterdam Oost',               'amsterdam-oost'),
  ('amsterdam', 'Amsterdam Zuidoost / Bijlmer', 'amsterdam-zuidoost-bijlmer'),
  ('amsterdam', 'Amsterdam Noord',              'amsterdam-noord'),
  ('utrecht',   'Leidsche Rijn',                'leidsche-rijn'),
  ('utrecht',   'Utrecht Centrum',              'utrecht-centrum'),
  ('utrecht',   'De Uithof / Science Park',     'de-uithof-science-park')
) as d(city_slug, name, slug)
join public.cities c on c.slug = d.city_slug
on conflict (city_id, slug) do update set name = excluded.name, active = true;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. SEED — locations (city-level, district-level, airports)
-- ─────────────────────────────────────────────────────────────────────────

-- 7a. City-level locations
insert into public.locations (city_id, name, slug, location_type, latitude, longitude)
select c.id, c.name, c.slug, 'city', c.latitude, c.longitude
from public.cities c
where c.slug in ('amsterdam','rotterdam','den-haag','utrecht','almere','eindhoven')
on conflict (slug) do update set
  name = excluded.name, city_id = excluded.city_id,
  location_type = excluded.location_type, active = true;

-- 7b. District-level locations
insert into public.locations (city_id, district_id, name, slug, location_type)
select d.city_id, d.id, d.name, d.slug, 'district'
from public.districts d
on conflict (slug) do update set
  name = excluded.name, city_id = excluded.city_id,
  district_id = excluded.district_id, location_type = excluded.location_type, active = true;

-- 7c. Airport locations
insert into public.locations (city_id, name, slug, location_type, latitude, longitude)
select c.id, x.name, x.slug, 'airport', x.lat, x.lng
from (values
  ('schiphol', 'Schiphol Airport',                'schiphol-airport',  52.3105000, 4.7683000),
  ('rotterdam','Rotterdam The Hague Airport',     'rotterdam-airport', 51.9569000, 4.4372000)
) as x(city_slug, name, slug, lat, lng)
join public.cities c on c.slug = x.city_slug
on conflict (slug) do update set
  name = excluded.name, city_id = excluded.city_id,
  location_type = excluded.location_type,
  latitude = excluded.latitude, longitude = excluded.longitude, active = true;

-- 7d. Airports
insert into public.airports (location_id, city_id, name, iata_code, latitude, longitude)
select l.id, l.city_id, x.name, x.iata, l.latitude, l.longitude
from (values
  ('schiphol-airport',  'Schiphol Airport',            'AMS'),
  ('rotterdam-airport', 'Rotterdam The Hague Airport', 'RTM')
) as x(slug, name, iata)
join public.locations l on l.slug = x.slug
on conflict (iata_code) do update set
  name = excluded.name, location_id = excluded.location_id,
  city_id = excluded.city_id, active = true;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. SEED — voertuigklassen + voertuigen (concept: Tesla Model Y, Lynk & Co 01)
--    Multiplier 1.0: de huidige gepubliceerde prijzen zijn klasse-onafhankelijk.
-- ─────────────────────────────────────────────────────────────────────────

insert into public.vehicle_classes (code, name, description, price_multiplier, fixed_surcharge, max_passengers, max_luggage, sort_order) values
  ('executive-ev', 'Executive EV', 'Tesla Model Y — 100% elektrisch, premium interieur', 1.0000, 0, 4, 3, 10),
  ('business',     'Business',     'Lynk & Co 01 — plug-in hybrid SUV, representatief',  1.0000, 0, 4, 3, 20)
on conflict (code) do update set
  name = excluded.name, description = excluded.description,
  price_multiplier = excluded.price_multiplier, fixed_surcharge = excluded.fixed_surcharge,
  max_passengers = excluded.max_passengers, max_luggage = excluded.max_luggage,
  sort_order = excluded.sort_order, active = true;

insert into public.vehicles (vehicle_class_id, name, make, model, fuel_type, max_passengers, max_luggage, sort_order)
select vc.id, x.name, x.make, x.model, x.fuel, x.pax, x.lug, x.sort
from (values
  ('executive-ev', 'Tesla Model Y', 'Tesla',      'Model Y', 'electric', 4, 3, 10),
  ('business',     'Lynk & Co 01',  'Lynk & Co',  '01',      'hybrid',   4, 3, 20)
) as x(class_code, name, make, model, fuel, pax, lug, sort)
join public.vehicle_classes vc on vc.code = x.class_code
on conflict (name) do update set
  vehicle_class_id = excluded.vehicle_class_id, make = excluded.make,
  model = excluded.model, fuel_type = excluded.fuel_type,
  max_passengers = excluded.max_passengers, max_luggage = excluded.max_luggage,
  sort_order = excluded.sort_order, active = true;

-- ─────────────────────────────────────────────────────────────────────────
-- 9. SEED — pricing_rules (regel-gebaseerde FALLBACK voor routes zonder vaste prijs)
--    LET OP: nog niet gekalibreerd op de website. De gepubliceerde prijzen komen
--    uit fixed_route_prices; deze regel is alleen voor onbekende routes (Stap 2).
-- ─────────────────────────────────────────────────────────────────────────

insert into public.pricing_rules (name, version, currency, base_fare, price_per_km, price_per_minute, vat_rate, minimum_fare, active) values
  ('T4XI basisregel (fallback, ongekalibreerd)', '2026-07-v1', 'EUR', 25, 2.00, 0.50, 9, 45, true)
on conflict (name, version) do update set
  base_fare = excluded.base_fare, price_per_km = excluded.price_per_km,
  price_per_minute = excluded.price_per_minute, vat_rate = excluded.vat_rate,
  minimum_fare = excluded.minimum_fare, active = excluded.active;

-- ─────────────────────────────────────────────────────────────────────────
-- 10. SEED — price_adjustments
--     Alleen de door de website expliciet benoemde regel is 'active':
--       nachttarief 23:00–06:00 = +15%.
--     De overige zijn INACTIVE placeholders voor de regel-gebaseerde route
--     (Stap 2, kalibratie). Toegepast op fixed_route_prices worden ze NIET —
--     die prijzen zijn all-in en definitief.
-- ─────────────────────────────────────────────────────────────────────────

insert into public.price_adjustments (name, adjustment_type, amount_type, amount, applies_to, start_time, end_time, priority, active) values
  ('Nachttarief 23:00-06:00',        'night_surcharge',   'percentage',  15, 'route_total', '23:00', '06:00', 20, true),
  ('Weekendtoeslag (fallback)',      'weekend_surcharge', 'percentage',  10, 'route_total', null,    null,    30, false),
  ('Retour (fallback, zie return_price)', 'return_discount','percentage', -10, 'route_total', null,   null,    40, false)
on conflict (name) do update set
  adjustment_type = excluded.adjustment_type, amount_type = excluded.amount_type,
  amount = excluded.amount, applies_to = excluded.applies_to,
  start_time = excluded.start_time, end_time = excluded.end_time,
  priority = excluded.priority, active = excluded.active;

-- ─────────────────────────────────────────────────────────────────────────
-- 11. SEED — fixed_route_prices (huidige GEPUBLICEERDE tarieven)
--     price = enkele rit (all-in), return_price = gepubliceerde retour.
--     Retour = round(enkel × 1,8) — voor élke route hieronder geverifieerd.
--     Vaste valid_from-constante zodat de seed idempotent is.
--     Gekoppeld aan klasse 'executive-ev' (huidige prijzen zijn klasse-agnostisch).
-- ─────────────────────────────────────────────────────────────────────────

insert into public.fixed_route_prices
  (pickup_location_id, dropoff_location_id, vehicle_class_id,
   price, return_price, distance_km, estimated_duration_min, vat_rate, source_label, valid_from, active)
select p.id, d.id, vc.id,
       x.price, x.return_price, x.km, x.duration, 9, x.label,
       timestamptz '2026-07-05 00:00:00+00', true
from (values
  -- Vanuit Amsterdam (city-level)
  ('amsterdam',                  'schiphol-airport',  69,  124,  22, 30, 'Amsterdam → Schiphol'),
  ('amsterdam',                  'rotterdam-airport', 119, 214,  85, 70, 'Amsterdam → Rotterdam Airport'),
  ('amsterdam',                  'rotterdam',         109, 196,  78, 65, 'Amsterdam → Rotterdam'),
  ('amsterdam',                  'den-haag',          85,  153,  65, 55, 'Amsterdam → Den Haag'),
  ('amsterdam',                  'utrecht',           69,  124,  40, 35, 'Amsterdam → Utrecht'),
  ('amsterdam',                  'eindhoven',         139, 250, 120, 90, 'Amsterdam → Eindhoven'),
  -- Vanuit Rotterdam (city-level)
  ('rotterdam',                  'schiphol-airport',  119, 214,  80, 65, 'Rotterdam → Schiphol'),
  ('rotterdam',                  'rotterdam-airport', 39,  70,   12, 20, 'Rotterdam → Rotterdam Airport'),
  ('rotterdam',                  'amsterdam',         109, 196,  78, 65, 'Rotterdam → Amsterdam'),
  ('rotterdam',                  'den-haag',          49,  88,   25, 30, 'Rotterdam → Den Haag'),
  ('rotterdam',                  'utrecht',           79,  142,  55, 50, 'Rotterdam → Utrecht'),
  -- Almere per stadsdeel → Schiphol
  ('almere-poort',               'schiphol-airport',  102, 184,  39, 40, 'Almere Poort → Schiphol'),
  ('almere-stad-centrum',        'schiphol-airport',  104, 187,  40, 40, 'Almere Stad Centrum → Schiphol'),
  ('almere-haven',               'schiphol-airport',  103, 185,  40, 40, 'Almere Haven → Schiphol'),
  ('almere-muziekwijk',          'schiphol-airport',  105, 189,  41, 42, 'Almere Muziekwijk → Schiphol'),
  ('almere-buiten',              'schiphol-airport',  110, 198,  44, 45, 'Almere Buiten → Schiphol'),
  ('almere-hout',                'schiphol-airport',  113, 203,  45, 46, 'Almere Hout → Schiphol'),
  ('almere-oostvaarders',        'schiphol-airport',  116, 209,  47, 48, 'Almere Oostvaarders → Schiphol'),
  -- Amsterdam per wijk → Schiphol
  ('amsterdam-zuidas',           'schiphol-airport',  50,  90,   10, 20, 'Amsterdam Zuidas → Schiphol'),
  ('amsterdam-centrum',          'schiphol-airport',  57,  103,  14, 25, 'Amsterdam Centrum → Schiphol'),
  ('amsterdam-oud-zuid-de-pijp', 'schiphol-airport',  55,  99,   13, 24, 'Amsterdam Oud-Zuid / De Pijp → Schiphol'),
  ('amsterdam-oost',             'schiphol-airport',  60,  108,  16, 28, 'Amsterdam Oost → Schiphol'),
  ('amsterdam-zuidoost-bijlmer', 'schiphol-airport',  60,  108,  16, 28, 'Amsterdam Zuidoost / Bijlmer → Schiphol'),
  ('amsterdam-noord',            'schiphol-airport',  65,  117,  20, 30, 'Amsterdam Noord → Schiphol'),
  -- Utrecht per wijk → Schiphol
  ('leidsche-rijn',              'schiphol-airport',  104, 187,  40, 40, 'Leidsche Rijn → Schiphol'),
  ('utrecht-centrum',            'schiphol-airport',  110, 198,  44, 44, 'Utrecht Centrum → Schiphol'),
  ('de-uithof-science-park',     'schiphol-airport',  117, 211,  48, 48, 'De Uithof / Science Park → Schiphol'),
  -- Intercity
  ('almere',                     'amsterdam',         45,  81,   35, 35, 'Almere → Amsterdam'),
  ('almere',                     'utrecht',           65,  117,  42, 42, 'Almere → Utrecht'),
  ('utrecht',                    'amsterdam',         69,  124,  40, 40, 'Utrecht → Amsterdam'),
  ('den-haag',                   'schiphol-airport',  107, 193,  43, 45, 'Den Haag → Schiphol')
) as x(pickup_slug, dropoff_slug, price, return_price, km, duration, label)
join public.locations p on p.slug = x.pickup_slug
join public.locations d on d.slug = x.dropoff_slug
cross join (select id from public.vehicle_classes where code = 'executive-ev') vc
on conflict (pickup_location_id, dropoff_location_id, vehicle_class_id, valid_from) do update set
  price = excluded.price, return_price = excluded.return_price,
  distance_km = excluded.distance_km, estimated_duration_min = excluded.estimated_duration_min,
  source_label = excluded.source_label, active = true;

COMMIT;
