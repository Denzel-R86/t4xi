-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: Pricing Brain v1 — seed factorconfig (Stap 8a-B)
-- Datum: 2026-07-06
--
-- Seedt brain_factor_config versie 1: de v1-actieve/estimated factoren met
-- echte gewichten, plus de stub-factoren (weight 0, max_confidence 0) die
-- 'enabled' zijn maar NIETS bijdragen tot er databronnen zijn. Zo is de
-- factorlijst identiek in v1..v3; alleen de data groeit.
--
-- Idempotent: on conflict (factor_key, config_version) do update.
-- NIET automatisch toegepast — eerst review + dry-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

insert into public.brain_factor_config
  (factor_key, display_name, category, weight, max_confidence, enabled, data_status, config_version, notes)
values
  -- Structureel (actief, echte data)
  ('base',               'Base fare',            'structural', 1.0000, 1.000, true, 'active',    1, 'Vaste instapcomponent'),
  ('distance',           'Distance score',       'structural', 1.0000, 1.000, true, 'active',    1, 'distance_km'),
  ('duration',           'Duration score',       'structural', 0.8000, 1.000, true, 'active',    1, 'estimated_duration_min'),
  ('airport',            'Airport score',        'structural', 1.0000, 1.000, true, 'active',    1, 'Luchthaven-eindpunt'),
  ('city',               'City score',           'structural', 0.6000, 0.900, true, 'active',    1, 'Stadniveau'),
  ('district',           'District score',       'structural', 0.6000, 0.900, true, 'active',    1, 'Stadsdeelniveau'),
  ('vehicle',            'Vehicle score',        'structural', 1.0000, 1.000, true, 'active',    1, 'vehicle_class multiplier'),
  -- Kosten & markt (schatting)
  ('cost_floor',         'Cost floor',           'cost',       1.0000, 0.700, true, 'estimated', 1, 'Kostmodel — schatting'),
  ('competitor',         'Competitor position',  'market',     0.9000, 0.600, true, 'estimated', 1, 'brain_market_observations / placeholder'),
  -- Merk & gedrag (actief/schatting)
  ('premium_brand',      'Premium brand',        'brand',      0.5000, 1.000, true, 'active',    1, 'Merkopslag T4XI'),
  ('psychological',      'Psychological price',  'behavioural',0.3000, 1.000, true, 'active',    1, 'Charm-afronding (5/9)'),
  ('return_probability', 'Return probability',   'behavioural',0.4000, 0.400, true, 'estimated', 1, 'Heuristiek per service_type'),
  -- Stubs — enabled maar dragen niets bij tot er data is (weight 0, conf 0)
  ('demand',             'Demand score',         'market',     0.0000, 0.000, true, 'stub',      1, 'Wacht op vraagsignaal'),
  ('supply',             'Supply score',         'market',     0.0000, 0.000, true, 'stub',      1, 'Wacht op aanbodsignaal'),
  ('driver_availability','Driver availability',  'market',     0.0000, 0.000, true, 'stub',      1, 'Wacht op chauffeurstelemetrie'),
  ('traffic',            'Traffic score',        'external',   0.0000, 0.000, true, 'stub',      1, 'Wacht op verkeersfeed'),
  ('weather',            'Weather score',        'external',   0.0000, 0.000, true, 'stub',      1, 'Wacht op weerfeed'),
  ('holiday',            'Holiday score',        'external',   0.0000, 0.000, true, 'stub',      1, 'Wacht op feestdagen-tabel'),
  ('event',             'Event score',          'external',   0.0000, 0.000, true, 'stub',      1, 'Wacht op eventfeed'),
  ('hist_acceptance',    'Historical acceptance','behavioural',0.0000, 0.000, true, 'stub',      1, 'Wacht op pricing_quote_logs'),
  ('hist_conversion',    'Historical conversion','behavioural',0.0000, 0.000, true, 'stub',      1, 'Wacht op conversiedata'),
  ('hist_margin',        'Historical margin',    'behavioural',0.0000, 0.000, true, 'stub',      1, 'Wacht op werkelijke kosten'),
  ('clv',                'Customer lifetime value','behavioural',0.0000, 0.000, true, 'stub',    1, 'Wacht op klanthistorie'),
  ('elasticity',         'Price elasticity',     'behavioural',0.0000, 0.000, true, 'stub',      1, 'Wacht op A/B-experimenten')
on conflict (factor_key, config_version) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  weight = excluded.weight,
  max_confidence = excluded.max_confidence,
  enabled = excluded.enabled,
  data_status = excluded.data_status,
  notes = excluded.notes;

COMMIT;
