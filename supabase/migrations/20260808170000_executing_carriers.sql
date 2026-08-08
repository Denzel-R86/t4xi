BEGIN;

create table if not exists public.executing_carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  onboarding_completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) between 2 and 120)
);

create unique index if not exists executing_carriers_name_unique
  on public.executing_carriers (lower(trim(name)));

alter table public.executing_carriers enable row level security;
revoke all on table public.executing_carriers from public, anon, authenticated;
grant all on table public.executing_carriers to service_role;

alter table public.booking_invoice_details
  add column if not exists executing_carrier_id uuid
    references public.executing_carriers(id) on delete restrict;

create index if not exists booking_invoice_details_carrier_idx
  on public.booking_invoice_details (executing_carrier_id);

-- Bestaande factuurgegevens behouden hun oorspronkelijke bedrijfsnaam als
-- momentopname, maar krijgen daarnaast een vaste vervoerders-ID.
insert into public.executing_carriers (name)
select distinct trim(d.executing_carrier_name)
from public.booking_invoice_details d
where length(trim(d.executing_carrier_name)) >= 2
on conflict do nothing;

update public.booking_invoice_details d
set executing_carrier_id = c.id
from public.executing_carriers c
where d.executing_carrier_id is null
  and lower(trim(d.executing_carrier_name)) = lower(trim(c.name));

create or replace function public.save_booking_invoice_details_v2(
  p_booking_id uuid,
  p_billing_name text,
  p_billing_address text,
  p_billing_postal_code text,
  p_billing_city text,
  p_billing_country text,
  p_executing_carrier_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice_number text;
  v_carrier_name text;
begin
  if length(trim(coalesce(p_billing_name, ''))) < 2
     or length(trim(coalesce(p_billing_address, ''))) < 3
     or length(trim(coalesce(p_billing_postal_code, ''))) < 4
     or length(trim(coalesce(p_billing_city, ''))) < 2
     or length(trim(coalesce(p_billing_country, ''))) < 2 then
    return 'invalid_input';
  end if;

  select c.name into v_carrier_name
  from public.executing_carriers c
  where c.id = p_executing_carrier_id and c.active = true;
  if v_carrier_name is null then return 'invalid_carrier'; end if;

  if not exists (select 1 from public.bookings where id = p_booking_id) then
    return 'not_found';
  end if;

  select d.invoice_number into v_invoice_number
  from public.booking_invoice_details d
  where d.booking_id = p_booking_id
  for update;
  if v_invoice_number is not null then return 'invoice_locked'; end if;

  insert into public.booking_invoice_details (
    booking_id, billing_name, billing_address, billing_postal_code, billing_city,
    billing_country, executing_carrier_id, executing_carrier_name, updated_at
  ) values (
    p_booking_id, trim(p_billing_name), trim(p_billing_address),
    upper(replace(trim(p_billing_postal_code), ' ', '')), trim(p_billing_city),
    trim(p_billing_country), p_executing_carrier_id, trim(v_carrier_name), now()
  )
  on conflict (booking_id) do update set
    billing_name = excluded.billing_name,
    billing_address = excluded.billing_address,
    billing_postal_code = excluded.billing_postal_code,
    billing_city = excluded.billing_city,
    billing_country = excluded.billing_country,
    executing_carrier_id = excluded.executing_carrier_id,
    executing_carrier_name = excluded.executing_carrier_name,
    updated_at = now();

  return 'saved';
end;
$function$;

revoke all on function public.save_booking_invoice_details_v2(uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.save_booking_invoice_details_v2(uuid, text, text, text, text, text, uuid)
  to service_role;

COMMIT;
