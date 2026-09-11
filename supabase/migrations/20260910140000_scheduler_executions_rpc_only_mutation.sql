-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: scheduler_executions — muteren uitsluitend via de RPC's
-- Datum: 2026-09-10 (Phase 3, ticket 1 — reparatie op 20260910120000)
--
-- WAAROM DEZE REPARATIE BESTAAT
--   20260910120000 gaf `service_role` bewust alleen SELECT op
--   `scheduler_executions`, zodat de statusmachine ook tegen de applicatie zelf
--   is afgedwongen. Dat werkte niet: Supabase kent ALTER DEFAULT PRIVILEGES op
--   schema `public` die bij CREATE TABLE automatisch INSERT/UPDATE/DELETE/
--   TRUNCATE aan service_role toekennen. Een `grant select` voegt daar alleen
--   iets aan toe; het neemt niets weg.
--
--   Empirisch aangetoond op staging: een `completed` execution werd met een
--   rechtstreekse UPDATE door service_role teruggezet naar `running` — precies
--   wat `start_execution()` weigert met 'already_terminal'. De CHECK-constraint
--   ving dat niet, en kán dat ook niet: "running mét tellers" is een geldige
--   vorm. De constraint begrenst de schade, maar voorkomt de bypass niet.
--
--   Dit is geen theoretisch risico: de applicatie draait ónder service_role.
--   "De aanroeper hoort de RPC te gebruiken" is daarom geen beveiliging.
--
-- WAT DEZE MIGRATIE DOET
--   Trekt elke muteerrechten-vorm op de tabel in bij service_role en laat
--   uitsluitend SELECT staan. Schrijven kan daarna alleen nog via de vier
--   SECURITY DEFINER-RPC's, die eigendom zijn van `postgres` en dus niet van de
--   tabelrechten van de aanroeper afhangen.
--
--   Ook PUBLIC, anon en authenticated worden expliciet ingetrokken. Die hadden
--   al niets (geverifieerd), maar een expliciete revoke maakt de bedoeling
--   leesbaar en beschermt tegen een latere default-privileges-wijziging.
--
-- WAAROM ADDITIEF EN NIET IN-PLACE
--   20260910120000 is al op staging toegepast en hoort vanaf dat moment tot de
--   onveranderlijke migratiehistorie. Repareren gebeurt met een nieuwe migratie.
--
-- LET OP BIJ TOEKOMSTIGE TABELLEN
--   Dezelfde valkuil geldt voor elke nieuwe tabel in schema `public`: een
--   `grant` alleen is niet genoeg, de default privileges moeten expliciet
--   worden ingetrokken. `pricing_event_shadow_logs` doet dat al met
--   `revoke update, delete, truncate ... from service_role`.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door de eigenaar, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- Muteren van de tabel kan hierna niet meer rechtstreeks. REFERENCES en TRIGGER
-- gaan mee: beide laten een aanroeper structuur aan de tabel hangen die de
-- statusmachine kan omzeilen of blokkeren.
revoke insert, update, delete, truncate, references, trigger
  on public.scheduler_executions from service_role;

-- Lezen blijft nodig: het log is bedoeld om geraadpleegd te worden.
grant select on public.scheduler_executions to service_role;

-- Expliciet dicht voor de publieke rollen. RLS staat al aan en er is geen
-- policy, maar zonder tabelrechten is de tabel ook zonder RLS onbereikbaar.
revoke all on public.scheduler_executions from public, anon, authenticated;

commit;

-- Controlequeries (ná toepassen):
--
--   Effectieve rechten van service_role — verwacht: alleen SELECT true.
--     select
--       has_table_privilege('service_role','public.scheduler_executions','SELECT')   as sel,
--       has_table_privilege('service_role','public.scheduler_executions','INSERT')   as ins,
--       has_table_privilege('service_role','public.scheduler_executions','UPDATE')   as upd,
--       has_table_privilege('service_role','public.scheduler_executions','DELETE')   as del,
--       has_table_privilege('service_role','public.scheduler_executions','TRUNCATE') as trunc;
--
--   De RPC's horen ongewijzigd te werken (SECURITY DEFINER, eigenaar postgres):
--     select public.schedule_execution('flight-monitor');
