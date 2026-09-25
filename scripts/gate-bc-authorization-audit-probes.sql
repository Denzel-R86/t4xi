-- Gate B and C probes — authorization cutover and audit actor semantics.
--
-- Run against a database where 20260912110000 and 20260912120000 have been
-- applied. One statement, raises at the end on purpose, so everything it
-- changes is rolled back.
--
-- Gate B's whole point is that access is decided in the `authenticated` role,
-- so these probes switch role deliberately. Running them as the owner would
-- prove nothing, because the owner bypasses RLS.
do $probe$
declare
  results jsonb := '[]'::jsonb;
  operator_auth uuid; operator_identity uuid; operator_control uuid;
  plain_auth uuid; plain_identity uuid;
  n int; flag boolean; before_hash text; after_hash text;
begin
  -- Existing operator, and an authenticated user who is not one.
  select ci.id, ci.identity_id, i.auth_user_id
    into operator_control, operator_identity, operator_auth
    from public.control_identities ci
    join public.identities i on i.id = ci.identity_id
   where ci.status = 'active' and ci.disabled_at is null
   limit 1;
  if operator_control is null then
    raise exception 'PROBE_PRECONDITION: no active Control operator to verify against';
  end if;

  select i.id, i.auth_user_id into plain_identity, plain_auth
    from public.identities i
   where i.auth_user_id is not null
     and not exists (select 1 from public.control_identities ci where ci.identity_id = i.id)
   limit 1;
  if plain_identity is null then
    raise exception 'PROBE_PRECONDITION: no authenticated non-operator to verify against. Create a second auth account first.';
  end if;

  -- ── Gate B ─────────────────────────────────────────────────────────────
  -- 1. The existing operator keeps exactly the access they had.
  perform set_config('request.jwt.claims',
    json_build_object('sub', operator_auth::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.control_identity_for_current_user() into operator_control;
  select count(*) into n from public.control_identities;
  execute 'reset role';
  results := results || jsonb_build_object('probe', 'B1 operator still resolves',
      'expected', 'not null', 'actual', coalesce(operator_control::text, 'NULL'))
    || jsonb_build_object('probe', 'B2 operator still sees own identity',
      'expected', 'at least 1', 'actual', n);

  -- 3. An authenticated user who is not an operator gains nothing.
  perform set_config('request.jwt.claims',
    json_build_object('sub', plain_auth::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.control_identity_for_current_user() into operator_control;
  select public.control_authorize('control.access') into flag;
  select count(*) into n from public.control_identities;
  execute 'reset role';
  results := results || jsonb_build_object('probe', 'B3 non-operator resolves to nothing',
      'expected', 'NULL', 'actual', coalesce(operator_control::text, 'NULL'))
    || jsonb_build_object('probe', 'B4 non-operator has no permission',
      'expected', false, 'actual', flag)
    || jsonb_build_object('probe', 'B5 non-operator sees no Control identity',
      'expected', 0, 'actual', n);

  -- 6. An unlinked identity has no authentication path at all.
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.control_authorize('control.access') into flag;
  execute 'reset role';
  results := results || jsonb_build_object('probe', 'B6 unknown auth subject denied',
    'expected', false, 'actual', flag);

  -- ── Gate C ─────────────────────────────────────────────────────────────
  -- 7. The historical rows are unchanged in content.
  select md5(string_agg(
           coalesce(actor_control_identity_id::text,'-') || '|' ||
           coalesce(actor_auth_user_id::text,'-') || '|' || action || '|' ||
           outcome || '|' || occurred_at::text, E'\n' order by occurred_at))
    into before_hash from public.control_audit_events;
  results := results || jsonb_build_object('probe', 'C7 historical content fingerprint',
    'expected', 'record this value and compare after any later gate', 'actual', before_hash);

  select count(*) into n from public.control_audit_events
   where actor_kind = 'user' and actor_identity_id is null;
  results := results || jsonb_build_object('probe', 'C8 historical rows keep no platform actor',
    'expected', 'equal to the pre-Gate-C row count; NOT VALID leaves them alone',
    'actual', n);

  -- 9. A new user event must carry a platform actor.
  begin
    insert into public.control_audit_events
      (actor_kind, actor_identity_id, actor_control_identity_id, actor_auth_user_id,
       action, resource_type, outcome, processing_purpose, classification, retention_until)
    values ('user', null, null, plain_auth, 'probe.user_without_actor', 'probe', 'denied',
            'Security verification', 'restricted', now() + interval '1 day');
    results := results || jsonb_build_object('probe', 'C9 user event without platform actor refused',
      'expected', 'denied', 'actual', 'ALLOWED');
  exception when check_violation then
    results := results || jsonb_build_object('probe', 'C9 user event without platform actor refused',
      'expected', 'denied', 'actual', 'denied');
  end;

  -- 10. A system event may legitimately have no actor at all.
  begin
    insert into public.control_audit_events
      (actor_kind, action, resource_type, outcome, processing_purpose, classification, retention_until)
    values ('system', 'probe.system_event', 'probe', 'success',
            'Security verification', 'restricted', now() + interval '1 day');
    results := results || jsonb_build_object('probe', 'C10 system event without actor allowed',
      'expected', 'allowed', 'actual', 'allowed');
  exception when others then
    results := results || jsonb_build_object('probe', 'C10 system event without actor allowed',
      'expected', 'allowed', 'actual', 'REFUSED: ' || sqlerrm);
  end;

  -- 11. A denied non-operator gets a real actor and no Control identity.
  begin
    insert into public.control_audit_events
      (actor_kind, actor_identity_id, actor_control_identity_id, actor_auth_user_id,
       action, resource_type, outcome, processing_purpose, classification, retention_until)
    values ('user', plain_identity, null, plain_auth, 'control.access', 'control_shell', 'denied',
            'Security verification', 'restricted', now() + interval '1 day');
    results := results || jsonb_build_object('probe', 'C11 denied non-operator event accepted',
      'expected', 'allowed with platform actor and no Control actor', 'actual', 'allowed');
  exception when others then
    results := results || jsonb_build_object('probe', 'C11 denied non-operator event accepted',
      'expected', 'allowed', 'actual', 'REFUSED: ' || sqlerrm);
  end;

  -- 12. Removing an auth account must no longer be blocked by the trail.
  select count(*) into n from pg_constraint
   where conname = 'control_audit_events_actor_auth_user_id_fkey';
  results := results || jsonb_build_object('probe', 'C12 audit no longer references auth.users',
    'expected', 0, 'actual', n);

  -- 13. Content fingerprint must be identical after all the inserts above.
  select md5(string_agg(
           coalesce(actor_control_identity_id::text,'-') || '|' ||
           coalesce(actor_auth_user_id::text,'-') || '|' || action || '|' ||
           outcome || '|' || occurred_at::text, E'\n' order by occurred_at))
    into after_hash from public.control_audit_events
   where action not like 'probe.%' and action <> 'control.access';
  results := results || jsonb_build_object('probe', 'C13 pre-existing rows untouched',
    'expected', 'see C7 for the comparable subset', 'actual', after_hash);

  raise exception 'PROBE_RESULTS:%', results::text;
end
$probe$;
