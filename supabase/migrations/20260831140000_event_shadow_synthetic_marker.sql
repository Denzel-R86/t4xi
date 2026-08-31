-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: synthetische observaties markeren (Phase 6.4, meetintegriteit)
-- Datum: 2026-08-31
--
-- FORWARD-ONLY. 20260828130000 en 20260831120000 zijn toegepast en bevroren.
--
-- WAAROM
--   De bewijsdrempel van 6.4 (200 geëvalueerde ritdelen, 30 matches, 14 dagen)
--   is alleen betekenisvol als hij ECHT klantverkeer telt. Zonder markering
--   berust dat op de afspraak dat niemand tijdens de meetperiode een testquote
--   draait — te fragiel voor een formele periode. Deze kolom maakt het
--   structureel: diagnostische flows zetten expliciet `true`, normaal verkeer
--   blijft op de default `false`.
--
--   Bewust een BOOLEAN en geen bron-enum. Het probleem dat opgelost moet worden
--   is governance ("telt dit mee?"), niet herkomstclassificatie. Een enum kan
--   later additief volgen als daar een concrete vraag onder ligt.
--
-- GEEN BACKFILL
--   De bestaande rijen krijgen de default `false`. Twee ervan zijn feitelijk
--   synthetisch (verificatiequotes uit Phase 6.3.2), maar ze vallen sowieso
--   vóór de meetgrens van 6.4 en tellen dus niet mee. Ze achteraf op `true`
--   zetten zou suggereren dat die markering destijds is vastgelegd; dat was
--   niet zo. De grens doet het werk, niet een herschreven verleden.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door de eigenaar, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

alter table public.pricing_event_shadow_logs
  add column if not exists is_synthetic boolean not null default false;

comment on column public.pricing_event_shadow_logs.is_synthetic is
  'True voor observaties uit test-, verificatie- of diagnostische flows. Die tellen NOOIT mee voor de bewijsdrempels van de meetperiode; ze blijven wel zichtbaar voor debugging. Normaal klantverkeer laat dit op false.';

-- De formele beslispopulatie filtert hierop, dus het is het enige veld naast
-- created_at dat bij elke telling wordt geraadpleegd.
create index if not exists pricing_event_shadow_logs_real_created_at_idx
  on public.pricing_event_shadow_logs (created_at)
  where not is_synthetic;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTROLE NA TOEPASSING
--
--   select is_synthetic, count(*) from public.pricing_event_shadow_logs group by 1;
--
--   -- de formele 6.4-populatie:
--   select count(*) from public.pricing_event_shadow_logs
--   where configured_fee_cents is not null
--     and created_at >= '2026-08-31T22:00:00Z'   -- middernacht Europe/Amsterdam
--     and not is_synthetic;
-- ═══════════════════════════════════════════════════════════════════════════
