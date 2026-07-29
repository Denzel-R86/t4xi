-- Migratie: address-system BASELINE (Sprint 7.5 — reproduceerbaarheids-fix)
-- ───────────────────────────────────────────────────────────────────────────
-- WAAROM DEZE MIGRATIE BESTAAT
--   De oudste bestaande migratie (20260705114630_fix_addresses_rls) en de
--   pricing-/bookings-migraties veronderstellen een reeds bestaande
--   "address-system"-fundering (public.addresses e.a.) die ooit los in het
--   productieproject t4xi-address-system is opgezet en NOOIT als migratie is
--   vastgelegd. Een verse (staging) database miste die objecten, waardoor
--   `supabase db push` faalde op:
--       ERROR: relation "public.addresses" does not exist (42P01)
--
--   Deze migratie reconstrueert UITSLUITEND die ontbrekende fundering, zodat de
--   volledige database vanaf een lege Supabase-DB reproduceerbaar is. De inhoud
--   is READ-ONLY afgeleid uit het productie-schema (information_schema/pg_catalog);
--   er is GEEN data, GEEN PII en GEEN productie-ID overgenomen.
--
-- SCOPE (bewust beperkt — niet het volledige public-schema gekopieerd):
--   • enums   : address_source, address_type
--   • tabellen: addresses, address_search_cache, popular_locations
--   • functies: update_updated_at, update_address_location,
--               update_address_search_vector, increment_address_usage,
--               find_nearest_addresses
--   • triggers, indexes, constraints en RLS-policies op bovenstaande tabellen
--   Alle overige productie-tabellen (cities, locations, bookings, brain_*, …)
--   worden door de LATERE migraties aangemaakt en horen NIET hier.
--
-- VEILIGHEID
--   • Draait vóór 20260705114630_fix_addresses_rls; die migratie voert daarna nog
--     steeds haar hardening uit (idempotent: drop-if-exists + recreate).
--   • De policies hieronder reproduceren de HUIDIGE (reeds geharde) productiestaat:
--     geen open anon-UPDATE/INSERT; anon-insert is bron-gevalideerd.
--   • Niet-destructief en zoveel mogelijk idempotent.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extensions (productie heeft postgis/pg_trgm/unaccent in schema public)
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists postgis  with schema public;       -- geography + spatial_ref_sys
create extension if not exists pg_trgm  with schema public;       -- gin_trgm_ops
create extension if not exists unaccent with schema public;       -- unaccent() in search-vector

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Enums
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'address_source') then
    create type public.address_source as enum
      ('bag_pdok', 'google_places', 'manual', 'reverse_geocode', 'pre_seeded');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'address_type') then
    create type public.address_type as enum
      ('street_address', 'airport', 'train_station', 'hotel', 'business',
       'tourist_attraction', 'port', 'other');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tabellen
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.addresses (
  id                    uuid primary key default gen_random_uuid(),
  street                text not null,
  house_number          text,
  house_number_ext      text,
  postal_code           text,
  city                  text not null,
  province              text,
  country_code          char(2) not null default 'NL',
  country_name          text not null default 'Nederland',
  display_name          text not null,
  full_address          text not null,
  latitude              double precision not null,
  longitude             double precision not null,
  location              geography,
  bag_id                text,
  bag_openbareruimte_id text,
  gemeente_code         text,
  gemeente_naam         text,
  source                public.address_source not null default 'manual',
  address_type          public.address_type   not null default 'street_address',
  normalized_key        text not null,
  search_vector         tsvector,
  booking_count         integer not null default 0,
  last_used_at          timestamptz,
  is_validated          boolean not null default false,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint addresses_bag_id_key unique (bag_id)
);

create table if not exists public.address_search_cache (
  id            uuid primary key default gen_random_uuid(),
  query         text not null,
  query_hash    text not null,
  country_hint  char(2),
  source        public.address_source not null,
  response_data jsonb not null,
  result_count  integer not null default 0,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '24 hours')
);

create table if not exists public.popular_locations (
  id         uuid primary key default gen_random_uuid(),
  address_id uuid references public.addresses(id) on delete cascade,
  category   text not null,
  aliases    text[] not null default '{}'::text[],
  priority   integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
create unique index if not exists idx_addresses_normalized_key
  on public.addresses using btree (normalized_key);
create index if not exists idx_addresses_bag_id
  on public.addresses using btree (bag_id) where (bag_id is not null);
create index if not exists idx_addresses_booking_count
  on public.addresses using btree (booking_count desc, last_used_at desc) where (is_active = true);
create index if not exists idx_addresses_display_trgm
  on public.addresses using gin (display_name gin_trgm_ops);
create index if not exists idx_addresses_location
  on public.addresses using gist (location);
create index if not exists idx_addresses_search_vector
  on public.addresses using gin (search_vector);

create index if not exists idx_cache_expires_at
  on public.address_search_cache using btree (expires_at);
create unique index if not exists idx_cache_query_hash_source
  on public.address_search_cache using btree (query_hash, source);

create index if not exists idx_popular_category
  on public.popular_locations using btree (category, priority desc) where (is_active = true);
create index if not exists idx_popular_locations_address_id
  on public.popular_locations using btree (address_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Functies (definities exact zoals in productie)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.update_updated_at()
  returns trigger language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

create or replace function public.update_address_location()
  returns trigger language plpgsql as $fn$
begin
  if new.latitude is not null and new.longitude is not null then
    new.location := ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::geography;
  end if;
  return new;
end;
$fn$;

create or replace function public.update_address_search_vector()
  returns trigger language plpgsql as $fn$
begin
  new.search_vector :=
    setweight(to_tsvector('dutch', unaccent(coalesce(new.city, ''))), 'A') ||
    setweight(to_tsvector('dutch', unaccent(coalesce(new.street, ''))), 'B') ||
    setweight(to_tsvector('dutch', unaccent(coalesce(new.postal_code, ''))), 'C') ||
    setweight(to_tsvector('dutch', unaccent(coalesce(new.display_name, ''))), 'D');
  return new;
end;
$fn$;

-- SECURITY DEFINER met vastgezette search_path — gecontroleerde stat-bump i.p.v.
-- een open anon-UPDATE-policy (zie 20260705114630_fix_addresses_rls). Reproduceert
-- de bestaande productiestaat; de latere hardening-migratie her-ALTERt dit idempotent.
create or replace function public.increment_address_usage(p_address_id uuid)
  returns void language plpgsql
  security definer set search_path to 'public' as $fn$
begin
  update addresses
  set booking_count = booking_count + 1, last_used_at = now()
  where id = p_address_id;
end;
$fn$;

create or replace function public.find_nearest_addresses(
  p_lat double precision, p_lon double precision,
  p_radius_meters integer default 100, p_limit integer default 5)
  returns table(id uuid, full_address text, distance_m double precision)
  language plpgsql as $fn$
begin
  return query
  select a.id, a.full_address,
    ST_Distance(a.location, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography) as distance_m
  from addresses a
  where ST_DWithin(a.location, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography, p_radius_meters)
    and a.is_active = true
  order by distance_m asc
  limit p_limit;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Triggers (drop-if-exists → idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_address_updated_at on public.addresses;
create trigger trg_address_updated_at
  before update on public.addresses
  for each row execute function public.update_updated_at();

drop trigger if exists trg_address_location on public.addresses;
create trigger trg_address_location
  before insert or update on public.addresses
  for each row execute function public.update_address_location();

drop trigger if exists trg_address_search_vector on public.addresses;
create trigger trg_address_search_vector
  before insert or update on public.addresses
  for each row execute function public.update_address_search_vector();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS + policies (reproduceert de HUIDIGE, reeds geharde productiestaat)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.addresses            enable row level security;
alter table public.address_search_cache enable row level security;
alter table public.popular_locations    enable row level security;

-- addresses
drop policy if exists addresses_read_public on public.addresses;
create policy addresses_read_public
  on public.addresses for select to public
  using (is_active = true);

drop policy if exists addresses_insert_validated_anon on public.addresses;
create policy addresses_insert_validated_anon
  on public.addresses for insert to anon, authenticated
  with check (
    is_active = true
    and (
      (source = 'bag_pdok' and bag_id is not null)
      or source in ('google_places', 'reverse_geocode')
    )
  );

drop policy if exists addresses_service_role on public.addresses;
create policy addresses_service_role
  on public.addresses for all to service_role
  using (true);

-- address_search_cache
drop policy if exists cache_read_public on public.address_search_cache;
create policy cache_read_public
  on public.address_search_cache for select to public
  using (expires_at > now());

drop policy if exists cache_write_service on public.address_search_cache;
create policy cache_write_service
  on public.address_search_cache for insert to authenticated, service_role
  with check (true);

drop policy if exists cache_upsert_service on public.address_search_cache;
create policy cache_upsert_service
  on public.address_search_cache for update to authenticated, service_role
  using (true);

drop policy if exists cache_delete_service on public.address_search_cache;
create policy cache_delete_service
  on public.address_search_cache for delete to service_role
  using (true);

-- popular_locations
drop policy if exists popular_read_public on public.popular_locations;
create policy popular_read_public
  on public.popular_locations for select to public
  using (is_active = true);

drop policy if exists popular_service_role on public.popular_locations;
create policy popular_service_role
  on public.popular_locations for all to service_role
  using (true);

COMMIT;
