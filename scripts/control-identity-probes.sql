-- T4XI Control Sprint 2A — behavioural probes for identity management.
--
-- Read this before running it. The entire script is one statement that raises
-- on purpose at the end, so everything it creates or changes is rolled back:
-- no identity, grant, audit row, temporary role or constraint survives. It is
-- therefore safe to run against a staging database that holds real Control
-- state.
--
-- Precondition: at least two auth users must exist. This script never creates
-- auth accounts; that stays a deliberate operator action in Supabase Auth.
--
-- Results come back inside the raised error message as JSON. Each entry names
-- the probe, what was expected and what actually happened.
do $probe$
declare
  results jsonb := '[]'::jsonb;
  auth_a uuid; auth_b uuid;
  id_a uuid; id_b uuid;
  role_admin uuid; role_auditor uuid; role_probe uuid;
  perm_manage uuid; perm_grant_admin uuid; perm_read uuid;
  n int; flag boolean; status_after text; audit_shape jsonb;
begin
  select count(*) into n from auth.users;
  if n < 2 then
    raise exception 'PROBE_PRECONDITION: two auth users required, found %. Create a second test account in Supabase Auth first.', n;
  end if;
  select id into auth_a from auth.users order by created_at limit 1;
  select id into auth_b from auth.users where id <> auth_a order by created_at limit 1;

  select id into role_admin from public.control_roles where role_key = 'control_admin';
  select id into role_auditor from public.control_roles where role_key = 'control_auditor';
  select id into perm_manage from public.control_permissions where permission_key = 'identity.manage';
  select id into perm_grant_admin from public.control_permissions where permission_key = 'identity.grant_admin';
  select id into perm_read from public.control_permissions where permission_key = 'identity.read';

  -- A is administrator, B starts as read-only auditor.
  insert into public.control_identities (auth_user_id, display_name, email, status)
  select auth_a, 'Probe A admin', lower(u.email), 'active' from auth.users u where u.id = auth_a
  on conflict (auth_user_id) do update set status = 'active', disabled_at = null
  returning id into id_a;
  insert into public.control_identities (auth_user_id, display_name, email, status)
  select auth_b, 'Probe B auditor', lower(u.email), 'active' from auth.users u where u.id = auth_b
  on conflict (auth_user_id) do update set status = 'active', disabled_at = null
  returning id into id_b;

  insert into public.control_identity_roles (identity_id, role_id, granted_by)
  values (id_a, role_admin, id_a)
  on conflict (identity_id, role_id) do update set revoked_at = null, expires_at = null;
  insert into public.control_identity_roles (identity_id, role_id, granted_by)
  values (id_b, role_auditor, id_a)
  on conflict (identity_id, role_id) do update set revoked_at = null, expires_at = null;

  -- ── 1-3. reads ──────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', auth_b::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.control_identities where id = id_b;
  execute 'reset role';
  results := results || jsonb_build_object('probe', '1 self-read still works',
    'expected', 1, 'actual', n);

  perform set_config('request.jwt.claims',
    json_build_object('sub', auth_a::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.control_identities;
  execute 'reset role';
  results := results || jsonb_build_object('probe', '2 identity.read reads other identities',
    'expected', 'at least 2', 'actual', n);

  update public.control_identity_roles set revoked_at = now() where identity_id = id_b;
  perform set_config('request.jwt.claims',
    json_build_object('sub', auth_b::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.control_identities;
  execute 'reset role';
  results := results || jsonb_build_object('probe', '3 no identity.read means own row only',
    'expected', 1, 'actual', n);
  update public.control_identity_roles set revoked_at = null
   where identity_id = id_b and role_id = role_auditor;

  -- ── 4-7. status mutations, as administrator A ───────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', auth_a::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.control_set_identity_status(id_b, 'suspended');
    select status into status_after from public.control_identities where id = id_b;
    results := results || jsonb_build_object('probe', '4 authorized status mutation',
      'expected', 'suspended', 'actual', status_after);
  exception when others then
    results := results || jsonb_build_object('probe', '4 authorized status mutation',
      'expected', 'suspended', 'actual', 'REFUSED: ' || sqlerrm);
  end;

  begin
    perform public.control_set_identity_status(id_a, 'suspended');
    results := results || jsonb_build_object('probe', '5 self status mutation',
      'expected', 'denied', 'actual', 'ALLOWED');
  exception when others then
    results := results || jsonb_build_object('probe', '5 self status mutation',
      'expected', 'denied', 'actual', sqlerrm);
  end;

  begin
    perform public.control_set_identity_status(gen_random_uuid(), 'active');
    results := results || jsonb_build_object('probe', '6 unknown target',
      'expected', 'denied', 'actual', 'ALLOWED');
  exception when others then
    results := results || jsonb_build_object('probe', '6 unknown target',
      'expected', 'denied', 'actual', sqlerrm);
  end;

  begin
    perform public.control_set_identity_status(id_b, 'owner');
    results := results || jsonb_build_object('probe', '7 invented status',
      'expected', 'denied', 'actual', 'ALLOWED');
  exception when others then
    results := results || jsonb_build_object('probe', '7 invented status',
      'expected', 'denied', 'actual', sqlerrm);
  end;
  execute 'reset role';
  update public.control_identities set status = 'active', disabled_at = null where id = id_b;

  -- ── 8-9. role grant and revoke ──────────────────────────────────────────
  execute 'set local role authenticated';
  begin
    perform public.control_revoke_role(id_b, 'control_auditor');
    select count(*) into n from public.control_identity_roles
     where identity_id = id_b and role_id = role_auditor and revoked_at is not null;
    results := results || jsonb_build_object('probe', '8 authorized revoke is soft',
      'expected', 1, 'actual', n);
  exception when others then
    results := results || jsonb_build_object('probe', '8 authorized revoke is soft',
      'expected', 1, 'actual', 'REFUSED: ' || sqlerrm);
  end;

  begin
    perform public.control_grant_role(id_b, 'control_auditor');
    select count(*) into n from public.control_identity_roles
     where identity_id = id_b and role_id = role_auditor and revoked_at is null;
    results := results || jsonb_build_object('probe', '9 authorized grant reactivates',
      'expected', 1, 'actual', n);
  exception when others then
    results := results || jsonb_build_object('probe', '9 authorized grant reactivates',
      'expected', 1, 'actual', 'REFUSED: ' || sqlerrm);
  end;

  begin
    perform public.control_grant_role(id_a, 'control_auditor');
    results := results || jsonb_build_object('probe', '10 self role grant',
      'expected', 'denied', 'actual', 'ALLOWED');
  exception when others then
    results := results || jsonb_build_object('probe', '10 self role grant',
      'expected', 'denied', 'actual', sqlerrm);
  end;
  execute 'reset role';

  -- ── 11-12. control_admin needs the second permission ────────────────────
  delete from public.control_role_permissions
   where role_id = role_admin and permission_id = perm_grant_admin;
  execute 'set local role authenticated';
  begin
    perform public.control_grant_role(id_b, 'control_admin');
    results := results || jsonb_build_object('probe', '11 admin grant without identity.grant_admin',
      'expected', 'denied', 'actual', 'ALLOWED');
  exception when others then
    results := results || jsonb_build_object('probe', '11 admin grant without identity.grant_admin',
      'expected', 'denied', 'actual', sqlerrm);
  end;
  execute 'reset role';
  insert into public.control_role_permissions (role_id, permission_id)
  values (role_admin, perm_grant_admin) on conflict do nothing;

  execute 'set local role authenticated';
  begin
    perform public.control_grant_role(id_b, 'control_admin');
    select count(*) into n from public.control_identity_roles
     where identity_id = id_b and role_id = role_admin and revoked_at is null;
    results := results || jsonb_build_object('probe', '12 admin grant with both permissions',
      'expected', 1, 'actual', n);
  exception when others then
    results := results || jsonb_build_object('probe', '12 admin grant with both permissions',
      'expected', 1, 'actual', 'REFUSED: ' || sqlerrm);
  end;
  execute 'reset role';

  -- ── 13. the last effective administrator is protected ───────────────────
  -- B gets a manager role that can touch admin grants but is not itself an
  -- administrator, and A is left as the only effective admin.
  insert into public.control_roles (role_key, name, description, system_role)
  values ('probe_identity_manager', 'Probe identity manager', 'temporary, rolled back', false)
  returning id into role_probe;
  insert into public.control_role_permissions (role_id, permission_id)
  values (role_probe, perm_manage), (role_probe, perm_grant_admin), (role_probe, perm_read);
  update public.control_identity_roles set revoked_at = now()
   where identity_id = id_b and role_id = role_admin;
  insert into public.control_identity_roles (identity_id, role_id, granted_by)
  values (id_b, role_probe, id_a) on conflict (identity_id, role_id)
  do update set revoked_at = null;

  perform set_config('request.jwt.claims',
    json_build_object('sub', auth_b::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.control_revoke_role(id_a, 'control_admin');
    results := results || jsonb_build_object('probe', '13 revoking the last admin',
      'expected', 'denied', 'actual', 'ALLOWED — invariant broken');
  exception when others then
    results := results || jsonb_build_object('probe', '13 revoking the last admin',
      'expected', 'denied', 'actual', sqlerrm);
  end;
  begin
    perform public.control_set_identity_status(id_a, 'disabled');
    results := results || jsonb_build_object('probe', '14 disabling the last admin',
      'expected', 'denied', 'actual', 'ALLOWED — invariant broken');
  exception when others then
    results := results || jsonb_build_object('probe', '14 disabling the last admin',
      'expected', 'denied', 'actual', sqlerrm);
  end;
  select status into status_after from public.control_identities where id = id_a;
  execute 'reset role';
  results := results || jsonb_build_object('probe', '15 last admin left untouched after refusal',
    'expected', 'active', 'actual', status_after);

  -- ── 16. a suspended actor cannot command ────────────────────────────────
  update public.control_identities set status = 'suspended' where id = id_b;
  execute 'set local role authenticated';
  begin
    perform public.control_grant_role(id_a, 'control_auditor');
    results := results || jsonb_build_object('probe', '16 suspended actor',
      'expected', 'denied', 'actual', 'ALLOWED');
  exception when others then
    results := results || jsonb_build_object('probe', '16 suspended actor',
      'expected', 'denied', 'actual', sqlerrm);
  end;
  execute 'reset role';
  update public.control_identities set status = 'active' where id = id_b;

  -- ── 17. expired and revoked grants do not authorize ─────────────────────
  update public.control_identity_roles set expires_at = now() - interval '1 day'
   where identity_id = id_b and role_id = role_probe;
  perform set_config('request.jwt.claims',
    json_build_object('sub', auth_b::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.control_authorize('identity.manage') into flag;
  execute 'reset role';
  results := results || jsonb_build_object('probe', '17 expired grant does not authorize',
    'expected', false, 'actual', flag);

  update public.control_identity_roles set expires_at = null, revoked_at = now()
   where identity_id = id_b and role_id = role_probe;
  execute 'set local role authenticated';
  select public.control_authorize('identity.manage') into flag;
  execute 'reset role';
  results := results || jsonb_build_object('probe', '18 revoked grant does not authorize',
    'expected', false, 'actual', flag);
  update public.control_identity_roles set revoked_at = null
   where identity_id = id_b and role_id = role_probe;

  -- ── 19. audit failure rolls the business write back ─────────────────────
  -- The only honest way to prove fail-closed: make the audit insert impossible
  -- and check the mutation does not survive.
  select status into status_after from public.control_identities where id = id_b;
  alter table public.control_audit_events
    add constraint probe_block_audit check (false) not valid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', auth_a::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.control_set_identity_status(id_b, 'disabled');
    results := results || jsonb_build_object('probe', '19 audit failure',
      'expected', 'mutation rolled back', 'actual', 'COMMAND SUCCEEDED');
  exception when others then
    results := results || jsonb_build_object('probe', '19 audit failure',
      'expected', 'mutation rolled back', 'actual', 'command refused: ' || sqlstate);
  end;
  execute 'reset role';
  alter table public.control_audit_events drop constraint probe_block_audit;
  results := results || jsonb_build_object('probe', '20 status unchanged after audit failure',
    'expected', status_after,
    'actual', (select status from public.control_identities where id = id_b));

  -- ── 21. audit metadata carries nothing sensitive ────────────────────────
  select count(*) into n from public.control_audit_events
   where action like 'identity.%'
     and (metadata::text ~* '(password|secret|token|@|authorization|cookie)');
  results := results || jsonb_build_object('probe', '21 no sensitive data in audit metadata',
    'expected', 0, 'actual', n);

  -- ── 23-27. onboarding an existing Auth account ─────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', auth_a::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.control_create_identity('nobody.' || gen_random_uuid()::text || '@example.invalid', 'Onbekend account');
    results := results || jsonb_build_object('probe', '23 unknown auth account',
      'expected', 'denied', 'actual', 'ALLOWED');
  exception when others then
    results := results || jsonb_build_object('probe', '23 unknown auth account',
      'expected', 'denied', 'actual', sqlerrm);
  end;

  begin
    perform public.control_create_identity(
      (select email from auth.users where id = auth_a), 'Zelf toevoegen');
    results := results || jsonb_build_object('probe', '24 self onboarding',
      'expected', 'denied', 'actual', 'ALLOWED');
  exception when others then
    results := results || jsonb_build_object('probe', '24 self onboarding',
      'expected', 'denied', 'actual', sqlerrm);
  end;

  begin
    perform public.control_create_identity(
      (select email from auth.users where id = auth_b), 'Dubbele identiteit');
    results := results || jsonb_build_object('probe', '25 duplicate identity',
      'expected', 'denied', 'actual', 'ALLOWED');
  exception when others then
    results := results || jsonb_build_object('probe', '25 duplicate identity',
      'expected', 'denied', 'actual', sqlerrm);
  end;
  execute 'reset role';

  -- Free B up so a real onboarding can be exercised. All of this rolls back.
  delete from public.control_audit_events where actor_identity_id = id_b;
  delete from public.control_identity_roles where identity_id = id_b;
  delete from public.control_identities where id = id_b;

  execute 'set local role authenticated';
  begin
    perform public.control_create_identity(
      (select email from auth.users where id = auth_b), 'Nieuwe operator', 'control_auditor');
    select status into status_after from public.control_identities where auth_user_id = auth_b;
    results := results || jsonb_build_object('probe', '26 onboarding starts without access',
      'expected', 'invited', 'actual', status_after);
  exception when others then
    results := results || jsonb_build_object('probe', '26 onboarding starts without access',
      'expected', 'invited', 'actual', 'REFUSED: ' || sqlerrm);
  end;
  execute 'reset role';

  -- The invited identity may not authorize anything yet.
  perform set_config('request.jwt.claims',
    json_build_object('sub', auth_b::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.control_authorize('control.access') into flag;
  execute 'reset role';
  results := results || jsonb_build_object('probe', '27 invited identity authorizes nothing',
    'expected', false, 'actual', flag);

  -- An admin starting role still needs the second permission.
  delete from public.control_audit_events where resource_id = (select id::text from public.control_identities where auth_user_id = auth_b);
  delete from public.control_identity_roles where identity_id = (select id from public.control_identities where auth_user_id = auth_b);
  delete from public.control_identities where auth_user_id = auth_b;
  delete from public.control_role_permissions
   where role_id = role_admin and permission_id = perm_grant_admin;
  perform set_config('request.jwt.claims',
    json_build_object('sub', auth_a::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.control_create_identity(
      (select email from auth.users where id = auth_b), 'Nieuwe admin', 'control_admin');
    results := results || jsonb_build_object('probe', '28 admin starting role without identity.grant_admin',
      'expected', 'denied', 'actual', 'ALLOWED');
  exception when others then
    results := results || jsonb_build_object('probe', '28 admin starting role without identity.grant_admin',
      'expected', 'denied', 'actual', sqlerrm);
  end;
  execute 'reset role';

  -- What the identity commands actually wrote, so the shape can be reviewed
  -- rather than assumed.
  select coalesce(jsonb_agg(entry), '[]'::jsonb) into audit_shape
  from (
    select distinct jsonb_build_object(
             'action', action,
             'outcome', outcome,
             'resource_type', resource_type,
             'metadata_keys', (select jsonb_agg(k order by k)
                                 from jsonb_object_keys(metadata) k)) as entry
      from public.control_audit_events
     where action like 'identity.%'
  ) shaped;
  results := results || jsonb_build_object('probe', '22 audit rows written by the commands',
    'expected', 'action/outcome/resource_type plus minimal metadata keys',
    'actual', audit_shape);

  raise exception 'PROBE_RESULTS:%', results::text;
end
$probe$;
