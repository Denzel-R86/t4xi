-- Audit-hardening 2026-08-20
--
-- De publieke website gebruikt increment_address_usage niet meer. De legacy
-- RPC was echter SECURITY DEFINER en standaard uitvoerbaar door browserrollen,
-- waardoor RLS kon worden omzeild om usage-statistieken te muteren.
--
-- Maak de functie daarom een gewone invoker-functie, kwalificeer de gemuteerde
-- tabel en beperk EXECUTE tot de server-side service-role. De vaste search_path
-- bevat public omdat bestaande addresses-triggers daar PostGIS en unaccent
-- aanroepen; browserrollen hebben geen CREATE-recht op dit schema.

begin;

create or replace function public.increment_address_usage(p_address_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  update public.addresses as address
  set booking_count = address.booking_count + 1,
      last_used_at = pg_catalog.now()
  where address.id = p_address_id;
end;
$function$;

revoke all on function public.increment_address_usage(uuid)
  from public, anon, authenticated;
grant execute on function public.increment_address_usage(uuid)
  to service_role;

commit;
