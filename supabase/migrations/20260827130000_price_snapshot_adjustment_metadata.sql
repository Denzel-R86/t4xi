-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: onveranderlijke verklaring per adjustment (Event Pricing, Phase 4)
-- Datum: 2026-08-27
--
-- WAAROM
--   Een toegepast evenemententarief moet later exact te verklaren zijn: welk
--   evenement, welk tijdvenster, welke zone, welk impactniveau en welke kant
--   van de rit. Die verklaring hoort BIJ de snapshot-regel die het bedrag
--   draagt — niet in een aparte auditdatabase, en niet in een tabel die
--   losraakt van de prijs waar ze over gaat.
--
-- SCOPE
--   Puur additief en achterwaarts compatibel:
--     • één nullable jsonb-kolom op de bestaande adjustments-tabel;
--     • create_price_snapshot() krijgt exact DEZELFDE signatuur en schrijft de
--       kolom mee wanneer de aangeleverde adjustment een `metadata`-object
--       bevat. Bestaande aanroepen zonder metadata blijven ongewijzigd werken
--       en schrijven NULL.
--   GEEN wijziging aan price_snapshots, aan de financiële invariant, aan de
--   quote-lock of aan bestaande rijen. Snapshots blijven immutabel: de functie
--   doet uitsluitend inserts.
--
--   De kolom is BEWUST vrij van persoonsgegevens: er komen uitsluitend
--   evenement-, venster- en zone-identifiers in — nooit een adres, naam of
--   andere klantgegevens.
--
-- ROLLBACK:
--   begin;
--     alter table public.price_snapshot_adjustments drop column if exists metadata;
--     -- en herstel create_price_snapshot uit 20260730130000.
--   commit;
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door de eigenaar, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table public.price_snapshot_adjustments
  add column if not exists metadata jsonb;

-- Alleen een object of NULL — nooit een losse string/array, zodat lezers altijd
-- op sleutels kunnen indexeren zonder typecontrole per rij.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'price_snapshot_adjustments_metadata_object_check'
      and conrelid = 'public.price_snapshot_adjustments'::regclass
  ) then
    alter table public.price_snapshot_adjustments
      add constraint price_snapshot_adjustments_metadata_object_check
      check (metadata is null or jsonb_typeof(metadata) = 'object');
  end if;
end $$;

comment on column public.price_snapshot_adjustments.metadata is
  'Onveranderlijke verklaring van deze prijsregel (bv. welk evenement/venster/zone het evenemententarief veroorzaakte). Uitsluitend interne identifiers — nooit adres-, naam- of andere persoonsgegevens. NULL voor regels die geen verklaring dragen.';

-- Identieke signatuur als 20260730130000 — `metadata` reist mee in het
-- bestaande p_adjustments-jsonb, dus geen nieuwe parameter, geen overload en
-- geen aanpassing aan grants/revokes.
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
      quote_id, code, label, amount_cents, taxable, vat_rate, sort_order, metadata
    )
    values (
      p_quote_id,
      v_adj ->> 'code',
      v_adj ->> 'label',
      (v_adj ->> 'amountCents')::integer,
      coalesce((v_adj ->> 'taxable')::boolean, true),
      nullif(v_adj ->> 'vatRate', '')::numeric,
      coalesce((v_adj ->> 'sortOrder')::integer, 0),
      -- Alleen een echt object wordt opgeslagen; ontbrekend/null/onjuist getypeerd
      -- levert NULL op in plaats van een insert-fout op de CHECK.
      case when jsonb_typeof(v_adj -> 'metadata') = 'object' then v_adj -> 'metadata' else null end
    );
  end loop;

  return p_quote_id;
end;
$$;

comment on function public.create_price_snapshot(
  uuid, text, text, text, integer, integer, jsonb, timestamptz, timestamptz, timestamptz, jsonb
) is 'Slaat een prijs-snapshot (parent) + adjustments (children, incl. optionele metadata-verklaring) ATOMAIR op in één transactie. Server-only (service_role). Alleen inserts → immutabel.';

commit;
