-- Gate A probes — platform identity foundation.
--
-- Run against a database where 20260912100000 has been applied and Gate B has
-- NOT. The whole script is one statement that raises at the end on purpose, so
-- every row it creates is rolled back; it leaves nothing behind.
--
-- Results arrive in the raised message as JSON.
do $probe$
declare
  results jsonb := '[]'::jsonb;
  n int; m int; probe_auth uuid; probe_identity uuid; msg text;
begin
  -- 1. Coverage: every auth account has exactly one identity.
  select count(*) into n from auth.users;
  select count(*) into m from public.identities where auth_user_id is not null;
  results := results || jsonb_build_object('probe', '1 every auth account has an identity',
    'expected', n, 'actual', m);

  select count(*) into n from auth.users u
   where not exists (select 1 from public.identities i where i.auth_user_id = u.id);
  results := results || jsonb_build_object('probe', '2 no auth account without identity',
    'expected', 0, 'actual', n);

  -- 3. Unique mapping, enforced rather than assumed.
  select count(*) into n from (
    select auth_user_id from public.identities
     where auth_user_id is not null group by auth_user_id having count(*) > 1
  ) dup;
  results := results || jsonb_build_object('probe', '3 mapping is unique',
    'expected', 0, 'actual', n);

  begin
    insert into public.identities (auth_user_id)
    select auth_user_id from public.identities where auth_user_id is not null limit 1;
    results := results || jsonb_build_object('probe', '4 duplicate link refused',
      'expected', 'denied', 'actual', 'ALLOWED');
  exception when unique_violation then
    results := results || jsonb_build_object('probe', '4 duplicate link refused',
      'expected', 'denied', 'actual', 'denied');
  end;

  -- 5. No Control identity without a platform identity.
  select count(*) into n from public.control_identities where identity_id is null;
  results := results || jsonb_build_object('probe', '5 no control identity unmapped',
    'expected', 0, 'actual', n);

  begin
    insert into public.control_identities (auth_user_id, display_name, email, status)
    select auth_user_id, 'Probe no bridge', 'probe-nobridge@example.test', 'invited'
      from public.identities where auth_user_id is not null limit 1;
    results := results || jsonb_build_object('probe', '6 control identity without identity_id refused',
      'expected', 'denied', 'actual', 'ALLOWED');
  exception when others then
    results := results || jsonb_build_object('probe', '6 control identity without identity_id refused',
      'expected', 'denied', 'actual', 'denied: ' || sqlstate);
  end;

  -- 7. One platform identity maps to at most one operator.
  begin
    insert into public.control_identities (identity_id, auth_user_id, display_name, email, status)
    select ci.identity_id, ci.auth_user_id, 'Probe second operator',
           'probe-second@example.test', 'invited'
      from public.control_identities ci limit 1;
    results := results || jsonb_build_object('probe', '7 two operators per identity refused',
      'expected', 'denied', 'actual', 'ALLOWED');
  exception when unique_violation then
    results := results || jsonb_build_object('probe', '7 two operators per identity refused',
      'expected', 'denied', 'actual', 'denied');
  end;

  -- 8. The auth trigger covers a new account.
  probe_auth := gen_random_uuid();
  begin
    insert into auth.users (id, instance_id, aud, role, email)
    values (probe_auth, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'probe-trigger@example.test');
    select count(*) into n from public.identities where auth_user_id = probe_auth;
    results := results || jsonb_build_object('probe', '8 auth trigger creates an identity',
      'expected', 1, 'actual', n);
  exception when others then
    results := results || jsonb_build_object('probe', '8 auth trigger creates an identity',
      'expected', 1, 'actual', 'could not insert auth user: ' || sqlstate ||
      ' (run this probe as a role that may write auth.users)');
  end;

  -- 9. Unlinking: removing the auth account must not be blocked and must not
  --    remove the identity.
  begin
    delete from auth.users where id = probe_auth;
    select count(*) into n from public.identities where auth_user_id = probe_auth;
    select count(*) into m from public.identities where auth_user_id is null;
    results := results || jsonb_build_object('probe', '9 auth delete leaves the identity',
      'expected', 'link null, row kept', 'actual',
      format('linked=%s, unlinked rows=%s', n, m));
  exception when others then
    results := results || jsonb_build_object('probe', '9 auth delete leaves the identity',
      'expected', 'allowed', 'actual', 'BLOCKED: ' || sqlerrm);
  end;

  -- 10. Erasure invariant: an erased identity may hold no auth link.
  begin
    update public.identities set erased_at = now()
     where auth_user_id is not null
     and id = (select id from public.identities where auth_user_id is not null limit 1);
    results := results || jsonb_build_object('probe', '10 erased identity keeping auth link refused',
      'expected', 'denied', 'actual', 'ALLOWED');
  exception when check_violation then
    results := results || jsonb_build_object('probe', '10 erased identity keeping auth link refused',
      'expected', 'denied', 'actual', 'denied');
  end;

  -- 11. No client role can read identities.
  execute 'set local role authenticated';
  begin
    select count(*) into n from public.identities;
    results := results || jsonb_build_object('probe', '11 authenticated cannot read identities',
      'expected', 0, 'actual', n);
  exception when insufficient_privilege then
    results := results || jsonb_build_object('probe', '11 authenticated cannot read identities',
      'expected', 0, 'actual', 'denied (insufficient_privilege)');
  end;
  execute 'reset role';

  raise exception 'PROBE_RESULTS:%', results::text;
end
$probe$;
