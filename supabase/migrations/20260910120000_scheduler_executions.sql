-- ═══════════════════════════════════════════════════════════════════════════
-- Migratie: scheduler_executions — observability voor geplande runs
-- Datum: 2026-09-10 (Phase 3, ticket 1 — vóór pg_cron/pg_net)
--
-- WAAROM DEZE TABEL BESTAAT
--   De vluchtmonitor heeft vandaag geen duurzaam run-record. `PollSummary`
--   wordt door /api/flights/monitor alleen in de HTTP-response teruggegeven en
--   nergens opgeslagen. Daardoor zijn drie situaties niet te onderscheiden:
--     A. de scheduler plande een run maar de applicatie werd nooit bereikt;
--     B. de run startte en crashte vóór afronding;
--     C. de run rondde af en de uitkomst is bekend.
--
--   `flight_monitoring` kan die rol niet vervullen. `claim_flights_for_monitoring`
--   zet `last_checked_at` en schuift `next_check_at` vooruit AL TIJDENS het
--   claimen. Crasht de run daarna, dan zien die rijen eruit alsof ze net
--   gecontroleerd zijn terwijl `current_status` oud blijft. `last_checked_at` is
--   dus feitelijk "last claimed at" en kan nooit de detector zijn voor
--   niet-verwerkte claims. Het run-record moet daar onafhankelijk van staan.
--
-- WAAROM NIET pricing_event_sync_log UITBREIDEN
--   Die tabel is een AFGERONDE-run-log: `checked_at`, tellers, `error_summary`,
--   `duration_ms`. Er is geen scheduled-toestand en geen started/completed-paar,
--   dus ze kan per definitie geen gecrashte of nooit-gestarte run detecteren —
--   exact de zwakte die hier wordt opgelost. Bovendien is ze pricing-specifiek;
--   uitbreiden zou haar naar scheduling trekken.
--
-- EIGENAARSCHAP VAN HET ONTSTAAN
--   De scheduler/databasezijde maakt de execution aan, niet de applicatie. Een
--   record dat de app zelf zou schrijven kan een MISLUKTE TRIGGER namelijk niet
--   vastleggen: bereikt pg_net het endpoint niet, dan draait de app nooit en
--   wordt er niets geschreven. Door `schedule_execution()` vóór de HTTP-call te
--   laten draaien blijft er in dat geval een rij op `scheduled` achter — het
--   enige bewijs dat er iets gepland wás.
--
-- STATUSMODEL
--   scheduled → running → completed | failed
--
--   Stale/abandoned is BEWUST AFGELEID en geen opgeslagen status: `started_at`
--   gezet, `completed_at` leeg, ouder dan de maximale looptijd. Een persistente
--   stale-status zou een sweeper vereisen die hem schrijft, en die sweeper is
--   zelf een geplande taak — faalt díe, dan ontstaat exact dezelfde blinde vlek
--   een laag hoger. Een afgeleide toestand heeft geen schrijver nodig en kan
--   dus niet zelf omvallen.
--
-- BEVEILIGING
--   Afwijkend van de append-only logtabellen in dit project: `service_role`
--   krijgt hier ALLEEN SELECT. Alle mutaties lopen via SECURITY DEFINER-RPC's,
--   zodat ook de applicatie zelf de statusmachine niet kan omzeilen. De
--   applicatie draait immers ónder service_role; zou die rechtstreeks mogen
--   schrijven, dan zat de garantie in de aanroeper in plaats van in de database.
--
-- NIET AUTOMATISCH TOEGEPAST — eerst review door de eigenaar, daarna pas:
--   supabase db push   (of via MCP apply_migration)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.scheduler_executions (
  id uuid primary key default gen_random_uuid(),
  -- Correlatie-id. Ontstaat database-side en gaat mee in de scheduler-call;
  -- de applicatie genereert er voor een scheduler-run nooit zelf een.
  trace_id uuid not null unique default gen_random_uuid(),
  job_type text not null check (length(trim(job_type)) between 1 and 60),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'running', 'completed', 'failed')),
  -- Pogingnummer binnen één logische taak; de scheduler zet dit bij herplannen.
  attempt integer not null default 1 check (attempt >= 1),

  scheduled_at timestamptz not null default now(),
  started_at   timestamptz,
  completed_at timestamptz,

  -- Uitkomst van de run. Blijft null zolang er niets is afgerond.
  claimed_count   integer check (claimed_count   is null or claimed_count   >= 0),
  processed_count integer check (processed_count is null or processed_count >= 0),
  failed_count    integer check (failed_count    is null or failed_count    >= 0),
  http_status     integer check (http_status     is null or http_status between 100 and 599),
  error_code      text,
  error_message   text,

  created_at timestamptz not null default now(),

  -- Statusmachine als constraint, niet alleen als afspraak in de RPC's. Ook een
  -- rechtstreekse UPDATE kan hiermee geen onmogelijke combinatie achterlaten,
  -- en de afleiding van stale/abandoned blijft betrouwbaar.
  constraint scheduler_executions_state_consistent check (
    (status = 'scheduled'
      and started_at is null and completed_at is null)
    or (status = 'running'
      and started_at is not null and completed_at is null)
    or (status in ('completed', 'failed')
      and started_at is not null and completed_at is not null)
  ),
  constraint scheduler_executions_completed_after_started check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

-- Openstaande runs opzoeken (scheduled én running) — voedt de stale-afleiding.
create index if not exists scheduler_executions_open_idx
  on public.scheduler_executions (status, scheduled_at desc)
  where completed_at is null;

create index if not exists scheduler_executions_job_scheduled_idx
  on public.scheduler_executions (job_type, scheduled_at desc);

alter table public.scheduler_executions enable row level security;

-- Geen policy voor anon/authenticated: zonder policy staat RLS alles dicht.
revoke all on public.scheduler_executions from public, anon, authenticated;
-- Bewust ALLEEN select: schrijven loopt uitsluitend via de RPC's hieronder.
grant select on public.scheduler_executions to service_role;

-- ── RPC's ───────────────────────────────────────────────────────────────────

-- Maakt een geplande execution en geeft de database-side trace_id terug. Dit is
-- de ENIGE plek waar een execution ontstaat.
create or replace function public.schedule_execution(
  p_job_type text,
  p_attempt integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job     text;
  v_attempt integer;
  v_id      uuid;
  v_trace   uuid;
begin
  v_job := nullif(trim(coalesce(p_job_type, '')), '');
  if v_job is null or length(v_job) > 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_job_type');
  end if;

  v_attempt := greatest(coalesce(p_attempt, 1), 1);

  insert into public.scheduler_executions (job_type, attempt)
    values (v_job, v_attempt)
    returning id, trace_id into v_id, v_trace;

  return jsonb_build_object('ok', true, 'id', v_id, 'trace_id', v_trace, 'status', 'scheduled');
end;
$function$;

-- Zet een geplande execution op running. Nooit een insert: een onbekende
-- trace_id levert een expliciete fout op, zodat een verzonnen of verlopen id
-- geen nieuwe run kan laten ontstaan.
create or replace function public.start_execution(p_trace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_id     uuid;
begin
  if p_trace_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_trace_id');
  end if;

  -- Eén atomaire overgang. Twee gelijktijdige pogingen: de tweede evalueert het
  -- statuspredicaat opnieuw ná de commit van de eerste en raakt 0 rijen.
  update public.scheduler_executions
     set status = 'running',
         started_at = pg_catalog.now()
   where trace_id = p_trace_id
     and status = 'scheduled'
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object('ok', true, 'changed', true, 'id', v_id, 'status', 'running');
  end if;

  select e.status into v_status
    from public.scheduler_executions e
    where e.trace_id = p_trace_id;

  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_trace_id');
  end if;

  -- Bestaat wel, maar stond niet op 'scheduled': al gestart of al afgerond.
  return jsonb_build_object(
    'ok', false,
    'error', case when v_status = 'running' then 'already_running' else 'already_terminal' end,
    'status', v_status
  );
end;
$function$;

-- Rondt een lopende execution af. Een tweede completion op een al terminale rij
-- is een geslaagde no-op (changed:false) en overschrijft de uitkomst niet.
create or replace function public.complete_execution(
  p_trace_id uuid,
  p_status text,
  p_claimed_count integer default null,
  p_processed_count integer default null,
  p_failed_count integer default null,
  p_http_status integer default null,
  p_error_code text default null,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_id     uuid;
begin
  if p_trace_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_trace_id');
  end if;
  if p_status is null or p_status not in ('completed', 'failed') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  update public.scheduler_executions
     set status = p_status,
         completed_at = pg_catalog.now(),
         claimed_count = p_claimed_count,
         processed_count = p_processed_count,
         failed_count = p_failed_count,
         http_status = p_http_status,
         error_code = nullif(trim(coalesce(p_error_code, '')), ''),
         error_message = nullif(trim(coalesce(p_error_message, '')), '')
   where trace_id = p_trace_id
     and status = 'running'
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object('ok', true, 'changed', true, 'id', v_id, 'status', p_status);
  end if;

  select e.status into v_status
    from public.scheduler_executions e
    where e.trace_id = p_trace_id;

  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_trace_id');
  end if;

  if v_status in ('completed', 'failed') then
    -- Idempotent: de eerste uitkomst blijft staan.
    return jsonb_build_object('ok', true, 'changed', false, 'status', v_status);
  end if;

  -- Stond nog op 'scheduled': afronden zonder ooit gestart te zijn mag niet,
  -- anders verdwijnt het onderscheid tussen "nooit bereikt" en "gedraaid".
  return jsonb_build_object('ok', false, 'error', 'not_running', 'status', v_status);
end;
$function$;

-- Afgeleide stale/abandoned-detectie. Read-only en zonder schrijver, zodat de
-- detectie niet zelf kan omvallen.
create or replace function public.list_stale_executions(
  p_max_runtime_seconds integer default 900
)
returns table (
  id uuid,
  trace_id uuid,
  job_type text,
  attempt integer,
  scheduled_at timestamptz,
  started_at timestamptz,
  seconds_running numeric
)
language sql
security definer
set search_path = ''
as $function$
  select e.id, e.trace_id, e.job_type, e.attempt, e.scheduled_at, e.started_at,
         round(extract(epoch from (pg_catalog.now() - e.started_at))::numeric, 0)
    from public.scheduler_executions e
   where e.status = 'running'
     and e.started_at is not null
     and e.completed_at is null
     and e.started_at < pg_catalog.now()
         - make_interval(secs => greatest(coalesce(p_max_runtime_seconds, 900), 1))
   order by e.started_at asc;
$function$;

-- ── GRANTS (functies) — server-only ─────────────────────────────────────────
revoke all on function public.schedule_execution(text, integer)          from public, anon, authenticated;
revoke all on function public.start_execution(uuid)                      from public, anon, authenticated;
revoke all on function public.complete_execution(uuid, text, integer, integer, integer, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.list_stale_executions(integer)             from public, anon, authenticated;

grant execute on function public.schedule_execution(text, integer)       to service_role;
grant execute on function public.start_execution(uuid)                   to service_role;
grant execute on function public.complete_execution(uuid, text, integer, integer, integer, integer, text, text)
  to service_role;
grant execute on function public.list_stale_executions(integer)          to service_role;

commit;

-- Controlequeries (ná toepassen):
--
--   Openstaande runs per soort:
--     select job_type, status, count(*)
--       from public.scheduler_executions
--      where completed_at is null
--      group by job_type, status;
--
--   Vastgelopen runs (afgeleid, geen opgeslagen status):
--     select * from public.list_stale_executions(900);
--
--   Nooit bereikt door de applicatie (trigger of endpoint faalde):
--     select trace_id, job_type, scheduled_at
--       from public.scheduler_executions
--      where status = 'scheduled'
--        and scheduled_at < now() - interval '15 minutes';
