-- ───────────────────────────────────────────────────────────────────────────
-- Migratie: create_price_snapshot() RPC — atomaire snapshot-opslag (PR 7.6.3C)
-- ───────────────────────────────────────────────────────────────────────────
-- WAAROM
--   De prijs-snapshot (parent) en al zijn adjustments (children) moeten ATOMAIR
--   worden opgeslagen. Twee losse inserts vanuit TypeScript zijn niet atomair:
--   bij een fout op de tweede insert zou een onvolledige snapshot achterblijven.
--   Deze SECURITY DEFINER-functie schrijft parent + children in ÉÉN transactie
--   (de functiebody), zodat een gedeeltelijke snapshot onmogelijk is.
--
-- SCOPE & VEILIGHEID
--   PUUR ADDITIEF: alleen een nieuwe functie; geen wijziging aan bestaande tabellen,
--   data of aan migratie 20260730120000. SECURITY DEFINER + search_path='' (alle
--   objectrefs schema-gekwalificeerd), EXECUTE uitsluitend voor service_role
--   (server-only), ingetrokken voor public/anon/authenticated — zelfde patroon als
--   link_booking_payment / process_stripe_payment_event.
--
--   De functie doet UITSLUITEND INSERTS (geen UPDATE) → snapshots blijven immutabel.
--   De DB oordeelt niet inhoudelijk over de prijs; de financiële invariant
--   (total = subtotal + Σ adjustments) is al in de applicatielaag gevalideerd.
--
-- ROLLBACK:
--   begin;
--     drop function if exists public.create_price_snapshot(
--       uuid, text, text, text, integer, integer, jsonb,
--       timestamptz, timestamptz, timestamptz, jsonb);
--   commit;
--
-- VALIDATIE: eerst op staging toepassen en de atomiciteit bewijzen; productie
--   nooit blind muteren.
-- ───────────────────────────────────────────────────────────────────────────

begin;

create or replace function public.create_price_snapshot(
  p_quote_id        uuid,
  p_pricing_version text,
  p_pricing_source  text,
  p_currency        text,
  p_subtotal_cents  integer,
  p_total_cents     integer,
  p_route_snapshot  jsonb,
  p_calculated_at   timestamptz,
  p_expires_at      timestamptz,
  p_created_at      timestamptz,
  p_adjustments     jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adj jsonb;
begin
  -- Parent. Een dubbele quote_id → unique_violation → de hele functie rolt terug.
  insert into public.price_snapshots (
    quote_id, pricing_version, pricing_source, currency,
    subtotal_cents, total_cents, route_snapshot,
    calculated_at, expires_at, created_at
  )
  values (
    p_quote_id, p_pricing_version, p_pricing_source, p_currency,
    p_subtotal_cents, p_total_cents, p_route_snapshot,
    p_calculated_at, p_expires_at, p_created_at
  );

  -- Children. Faalt er één, dan rolt de parent-insert mee terug (atomair).
  for v_adj in
    select value from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb)) as t(value)
  loop
    insert into public.price_snapshot_adjustments (
      quote_id, code, label, amount_cents, taxable, vat_rate, sort_order
    )
    values (
      p_quote_id,
      v_adj ->> 'code',
      v_adj ->> 'label',
      (v_adj ->> 'amountCents')::integer,
      coalesce((v_adj ->> 'taxable')::boolean, true),
      nullif(v_adj ->> 'vatRate', '')::numeric,
      coalesce((v_adj ->> 'sortOrder')::integer, 0)
    );
  end loop;

  return p_quote_id;
end;
$$;

comment on function public.create_price_snapshot(
  uuid, text, text, text, integer, integer, jsonb, timestamptz, timestamptz, timestamptz, jsonb
) is 'Slaat een prijs-snapshot (parent) + adjustments (children) ATOMAIR op in één transactie. Server-only (service_role). Alleen inserts → immutabel. Zie docs/architecture/price-snapshot-contract.md (PR 7.6.3C).';

revoke execute on function public.create_price_snapshot(
  uuid, text, text, text, integer, integer, jsonb, timestamptz, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;

grant execute on function public.create_price_snapshot(
  uuid, text, text, text, integer, integer, jsonb, timestamptz, timestamptz, timestamptz, jsonb
) to service_role;

commit;
