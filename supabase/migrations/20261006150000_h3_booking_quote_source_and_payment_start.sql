-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: quote-attributie + betaalstart-tijdstempel op bookings (H-3)
-- Versie: 20261006150000
--
-- STATUS: VOORSTEL — VEREIST AKKOORD EIGENAAR. Niet automatisch pushen.
--
-- Doel (Experience 2.0, findings F-04): de funnel quote → booking → betaalstart
-- → betaald server-side meetbaar maken.
--
--   1. bookings.source_quote_id  — de quote (price_snapshots.quote_id) die de
--      klant zag toen hij boekte. Pure attributie: GEEN unieke index, GEEN
--      lock-semantiek. `bookings.quote_id` blijft exclusief van de quote-lock
--      (create_booking_from_snapshot + unieke index bookings_quote_id_key) en
--      wordt hier niet aangeraakt. Gevuld door de app (lib/bookings/quote-link.ts),
--      óók op het aanvraagpad (handmatige bagagereview na een getoonde prijs).
--   2. bookings.payment_started_at — moment waarop deze boeking voor het eerst een
--      PaymentIntent kreeg via link_booking_payment ('linked' terwijl er nog geen PI
--      op stond). Herkoppeling van dezelfde PI verandert het niet. Historische
--      boekingen die al een PI hadden vóór deze migratie houden NULL: een herhaalde
--      koppeling legt dan géén "nu" als historisch startmoment vast.
--   3. link_booking_payment: identiek aan 20260724120000, met als ENIGE wijziging
--      `payment_started_at = case when v_existing_pi is null then coalesce(...)
--      else payment_started_at end` in de bestaande UPDATE. Signature, return-codes,
--      statusovergang (unpaid → pending), guards
--      (already_paid / no_price / pi_conflict), search_path en rechten: ongewijzigd.
--
-- ADDITIEF + IDEMPOTENT: opnieuw uitvoeren is een no-op. Beide kolommen zijn
-- nullable zonder default; bestaande rijen en bestaande code blijven geldig.
--
-- De app werkt ook ZONDER deze migratie: de source_quote_id-update degradeert
-- naar één PII-vrije waarschuwing en link_booking_payment blijft de oude versie.
--
-- BACKFILL:
--   · source_quote_id := quote_id waar een lock-koppeling bestaat (zelfde quote).
--   · payment_started_at: GEEN backfill. Het historische moment is niet uit de
--     database af te leiden (bookings heeft geen updated_at); oude rijen met een
--     PaymentIntent blijven null. 0.4a telt die via stripe_payment_intent_id.
--
-- ROLLBACK (forward-only voorkeur — de kolommen zijn onschadelijk):
--   · functie terug: de create-or-replace uit 20260724120000 (sectie 3) opnieuw
--     uitvoeren — dezelfde signature, dus de rechten blijven staan;
--   · kolommen weg (verliest de meetdata):
--       drop index if exists public.bookings_source_quote_id_idx;
--       alter table public.bookings
--         drop constraint if exists bookings_source_quote_id_fkey,
--         drop column if exists source_quote_id,
--         drop column if exists payment_started_at;
--   · eerst de app-code terugdraaien is NIET nodig: die verdraagt een
--     ontbrekende kolom.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Kolommen ──────────────────────────────────────────────────────────────
alter table public.bookings
  add column if not exists source_quote_id uuid,
  add column if not exists payment_started_at timestamptz;

comment on column public.bookings.source_quote_id is
  'Quote (price_snapshots.quote_id) die de klant zag bij het boeken. Attributie, geen lock; zie quote_id voor de bindende prijs-lock.';
comment on column public.bookings.payment_started_at is
  'Eerste nieuwe koppeling van een PaymentIntent (link_booking_payment, nog geen PI aanwezig). NULL bij boekingen die hun PI vóór deze kolom kregen.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_source_quote_id_fkey') then
    alter table public.bookings
      add constraint bookings_source_quote_id_fkey
      foreign key (source_quote_id) references public.price_snapshots(quote_id) on delete set null;
  end if;
end $$;

-- Invariant: als beide gevuld zijn, wijzen lock en attributie naar dezelfde quote.
-- source_quote_id MAG ontbreken (best-effort attributie; ontbrekende attributie wordt
-- gerapporteerd, niet afgedwongen). Let op NULL-semantiek: een CHECK slaagt bij NULL,
-- daarom staan beide NULL-gevallen expliciet in de expressie.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_source_quote_matches_lock') then
    alter table public.bookings
      add constraint bookings_source_quote_matches_lock
      check (quote_id is null or source_quote_id is null or source_quote_id = quote_id);
  end if;
end $$;

-- FK-index (partieel: de meeste aanvraagboekingen hebben geen quote).
create index if not exists bookings_source_quote_id_idx
  on public.bookings (source_quote_id)
  where source_quote_id is not null;

-- ── 2. Backfill (alleen afleidbaar: lock-koppelingen) ────────────────────────
update public.bookings
   set source_quote_id = quote_id
 where quote_id is not null
   and source_quote_id is null;

-- ── 3. link_booking_payment + betaalstart ────────────────────────────────────
create or replace function public.link_booking_payment(
  p_booking_id uuid,
  p_payment_intent_id text,
  p_amount_due_cents integer,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_existing_pi text;
  v_price numeric;
begin
  if p_amount_due_cents is null or p_amount_due_cents <= 0 then
    raise exception 'Ongeldig bedrag';
  end if;
  if lower(coalesce(p_currency, '')) <> 'eur' then
    raise exception 'Ongeldige currency';
  end if;
  if p_payment_intent_id is null or p_payment_intent_id = '' then
    raise exception 'Ongeldige payment intent';
  end if;

  select b.payment_status, b.stripe_payment_intent_id, b.price_euros
    into v_status, v_existing_pi, v_price
    from public.bookings b
   where b.id = p_booking_id
   for update;

  if not found then return 'not_found'; end if;
  if v_status = 'paid' then return 'already_paid'; end if;
  if v_price is null then return 'no_price'; end if;
  if v_existing_pi is not null and v_existing_pi <> p_payment_intent_id then
    return 'pi_conflict';
  end if;

  update public.bookings
     set stripe_payment_intent_id = p_payment_intent_id,
         amount_due_cents = p_amount_due_cents,
         payment_currency = lower(p_currency),
         payment_status = case when payment_status = 'unpaid' then 'pending' else payment_status end,
         payment_started_at = case
                                when v_existing_pi is null then coalesce(payment_started_at, pg_catalog.now())
                                else payment_started_at
                              end
   where id = p_booking_id;

  return 'linked';
end;
$function$;

revoke execute on function public.link_booking_payment(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.link_booking_payment(uuid, text, integer, text) to service_role;

commit;
