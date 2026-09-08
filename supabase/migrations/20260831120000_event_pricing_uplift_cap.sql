-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: hybride uplift-cap voor het evenemententarief (Phase 6.3.2)
-- Datum: 2026-08-31
--
-- FORWARD-ONLY. De migraties 20260827120000 en 20260828130000 zijn op staging
-- toegepast en daarmee bevroren; deze migratie voegt uitsluitend toe.
--
-- WAAROM
--   Phase 6.3 legde bloot dat een VLAK tarief zich onevenredig gedraagt op
--   korte ritten: €40 op een subtotaal van €57 is een opslag van 70%. Phase
--   6.3.1 heeft caps van 30–50% doorgerekend op de bestaande observaties en
--   40% als beleid bevestigd. Het model wordt daarmee:
--
--       effectief tarief = min(geconfigureerd tarief, round(subtotaal × cap))
--
--   Bewust GEEN ondergrens: laat een korte rit maar een klein bedrag toe, dan
--   is dat informatie over die rit — geen probleem dat je met een kunstmatig
--   minimum moet verbergen.
--
-- 1. CONFIGURATIE, GEEN CONSTANTE
--   `max_uplift_pct` komt per impactniveau uit pricing_event_fee_rules, zodat
--   'extreme' later een eigen cap kan krijgen zonder enginewijziging. Vandaag
--   krijgt elk betalend niveau 40%; voor 'extreme' is dat een bewuste keuze om
--   NU niet vooruit te lopen op NYE-schaarste waarvoor nog geen bewijs is.
--
-- 2. HISTORIE BLIJFT HISTORIE
--   De twee nieuwe observatiekolommen zijn NULLABLE en worden NIET gebackfild.
--   De 13 bestaande observaties zijn ontstaan onder het vlakke model; daar
--   achteraf €40/€25 in schrijven zou suggereren dat die waarde destijds
--   expliciet is vastgelegd. Dat was niet zo. NULL is het eerlijke antwoord.
--
--   Daarmee is de policy-cohort ook zonder extra versiekolom af te lezen:
--     configured_fee_cents IS NULL      → vlakke policy (t/m 2026-08-30)
--     configured_fee_cents IS NOT NULL  → cap-policy (vanaf deze migratie)
--   Poort 9 rapporteert voor de oude cohort "niet meetbaar", nooit FAIL.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door de eigenaar, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Configuratie: cap per impactniveau ───────────────────────────────────

alter table public.pricing_event_fee_rules
  add column if not exists max_uplift_pct numeric(5, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pricing_event_fee_rules_max_uplift_pct_check'
      and conrelid = 'public.pricing_event_fee_rules'::regclass
  ) then
    alter table public.pricing_event_fee_rules
      add constraint pricing_event_fee_rules_max_uplift_pct_check
      check (max_uplift_pct is null or (max_uplift_pct > 0 and max_uplift_pct <= 100));
  end if;
end $$;

comment on column public.pricing_event_fee_rules.max_uplift_pct is
  'Bovengrens van het tarief als percentage van het ritsubtotaal. NULL = geen cap (vlak tarief). Per niveau instelbaar zodat differentiatie later geen enginewijziging vergt.';

-- ── 2. Observability: geconfigureerd naast effectief ────────────────────────

alter table public.pricing_event_shadow_logs
  add column if not exists configured_fee_cents integer,
  add column if not exists max_uplift_pct numeric(5, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pricing_event_shadow_logs_configured_fee_cents_check'
      and conrelid = 'public.pricing_event_shadow_logs'::regclass
  ) then
    alter table public.pricing_event_shadow_logs
      add constraint pricing_event_shadow_logs_configured_fee_cents_check
      check (configured_fee_cents is null or configured_fee_cents >= 0);
  end if;
end $$;

comment on column public.pricing_event_shadow_logs.configured_fee_cents is
  'Het tarief zoals het op het moment van evalueren geconfigureerd stond, VOOR de cap. NULL voor observaties van voor de cap-policy — die rijen worden bewust niet gebackfild.';
comment on column public.pricing_event_shadow_logs.max_uplift_pct is
  'De cap die op dit ritdeel is toegepast. NULL = geen cap actief (vlakke policy of niveau zonder cap).';

-- ── 3. Beleid vastleggen: 40% op elk betalend niveau ────────────────────────
-- Idempotent en conflictveilig, zelfde patroon als de bestaande seeds: een
-- afwijkende, al gekalibreerde waarde wordt nooit stilzwijgend overschreven.

do $$
declare
  seed record;
  existing record;
begin
  for seed in
    select * from (values
      ('elevated', 40.00),
      ('high', 40.00),
      ('very_high', 40.00),
      ('extreme', 40.00)
    ) as s(impact_level, cap)
  loop
    select * into existing
      from public.pricing_event_fee_rules
      where impact_level = seed.impact_level and active
      limit 1;
    if not found then
      raise exception
        'pricing_event_fee_rules: niveau "%" bestaat niet — pas eerst 20260827120000 toe', seed.impact_level;
    elsif existing.max_uplift_pct is null then
      update public.pricing_event_fee_rules
      set max_uplift_pct = seed.cap, updated_at = now()
      where id = existing.id;
    elsif existing.max_uplift_pct = seed.cap then
      null; -- identiek: veilige no-op
    else
      raise exception
        'pricing_event_fee_rules: niveau "%" heeft al een cap van %%% terwijl de seed %%% verwacht — pas die handmatig aan in plaats van een gekalibreerde waarde te overschrijven',
        seed.impact_level, existing.max_uplift_pct, seed.cap;
    end if;
  end loop;
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTROLE NA TOEPASSING
--
--   select impact_level, amount_cents, max_uplift_pct
--   from public.pricing_event_fee_rules where active order by amount_cents;
--
--   -- oude cohort (vlak) versus nieuwe cohort (cap):
--   select configured_fee_cents is null as vlakke_policy, count(*)
--   from public.pricing_event_shadow_logs group by 1;
-- ═══════════════════════════════════════════════════════════════════════════
