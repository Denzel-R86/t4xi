-- Gate D — Control identity management, on the platform identity.
--
-- Rewrite of the Sprint 2A migration that was never applied anywhere, so it
-- lands correct rather than needing a correction afterwards. Everything the
-- earlier version proved is kept: the advisory lock on the admin invariant,
-- hard self-mutation refusal, soft revoke, the second permission for
-- control_admin, and required audit inside the same transaction as the write.
--
-- Two functions from the earlier draft are gone, not lost. Gate B made
-- `control_authorize` itself SECURITY DEFINER, so the separate
-- `control_permission_check` it needed is redundant, and
-- `control_identity_for_current_user()` already resolves the actor. One
-- authorization function, one resolver.
begin;

-- ── 1. identity.grant_admin ───────────────────────────────────────────────
insert into public.control_permissions (permission_key, description, risk_level) values
  ('identity.grant_admin', 'Grant or revoke the Control administrator role', 'critical')
on conflict (permission_key) do nothing;

insert into public.control_role_permissions (role_id, permission_id)
select role.id, permission.id
from public.control_roles role
join public.control_permissions permission on permission.permission_key = 'identity.grant_admin'
where role.role_key = 'control_admin'
on conflict do nothing;

-- ── 2. Soft revoke ────────────────────────────────────────────────────────
alter table public.control_identity_roles
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.control_identities(id) on delete set null;

create index if not exists control_identity_roles_active_idx
  on public.control_identity_roles (identity_id) where revoked_at is null;

comment on column public.control_identity_roles.revoked_at is
  'Soft revoke. A grant only counts for authorization while this is null; the grant/revoke sequence itself lives in control_audit_events.';

-- ── 3. Only active grants authorize ───────────────────────────────────────
create or replace function public.control_authorize(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.control_identities control_identity
      join public.identities identity on identity.id = control_identity.identity_id
      join public.control_identity_roles identity_role
        on identity_role.identity_id = control_identity.id
      join public.control_role_permissions role_permission
        on role_permission.role_id = identity_role.role_id
      join public.control_permissions permission
        on permission.id = role_permission.permission_id
     where identity.auth_user_id = (select auth.uid())
       and identity.erased_at is null
       and control_identity.status = 'active'
       and control_identity.disabled_at is null
       and identity_role.revoked_at is null
       and (identity_role.expires_at is null or identity_role.expires_at > now())
       and permission.permission_key = required_permission
  )
$$;
revoke all on function public.control_authorize(text) from public, anon;
grant execute on function public.control_authorize(text) to authenticated;

-- ── 4. Internal helpers ───────────────────────────────────────────────────
-- Only operations that can lower the effective-admin count take this lock:
-- changing the status of an identity that holds an active control_admin grant,
-- and revoking such a grant. Granting only ever raises the count.
--
-- Why a status change on a non-admin needs no lock: the invariant guarantees at
-- least one effective admin existed before the transaction, that admin is a
-- different identity, and this transaction does not touch it. A concurrent
-- grant that turns the target into an admin only adds to the count.
create or replace function public.control_admin_invariant_lock()
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  select pg_advisory_xact_lock(hashtext('t4xi_control_admin_invariant')::bigint)
$$;
revoke all on function public.control_admin_invariant_lock() from public, anon, authenticated;

create or replace function public.control_effective_admin_count()
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(distinct control_identity.id)::int
  from public.control_identities control_identity
  join public.identities identity on identity.id = control_identity.identity_id
  join public.control_identity_roles identity_role
    on identity_role.identity_id = control_identity.id
  join public.control_roles role on role.id = identity_role.role_id
  where control_identity.status = 'active'
    and control_identity.disabled_at is null
    and identity.erased_at is null
    and identity_role.revoked_at is null
    and (identity_role.expires_at is null or identity_role.expires_at > now())
    and role.role_key = 'control_admin'
$$;
revoke all on function public.control_effective_admin_count() from public, anon, authenticated;

-- ── 5. Additive read policies for identity.read ───────────────────────────
-- The Sprint-1 self-read policies stay untouched; these are extra SELECT
-- policies, so an ordinary identity is unaffected and a reader without
-- identity.read gains nothing.
create policy control_identities_manager_read on public.control_identities
  for select to authenticated
  using (public.control_authorize('identity.read'));

create policy control_identity_roles_manager_read on public.control_identity_roles
  for select to authenticated
  using (public.control_authorize('identity.read'));

-- ── 6. Command: change an identity status ─────────────────────────────────
create or replace function public.control_set_identity_status(
  target_identity_id uuid,
  new_status text,
  correlation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid;
  actor_platform_id uuid;
  actor_auth uuid := (select auth.uid());
  previous_status text;
begin
  if new_status not in ('invited', 'active', 'suspended', 'disabled') then
    raise exception 'control_invalid_status' using errcode = '22023';
  end if;

  actor_id := public.control_identity_for_current_user();
  if actor_id is null then
    raise exception 'control_actor_not_active' using errcode = '42501';
  end if;
  if not public.control_authorize('identity.manage') then
    raise exception 'control_permission_denied' using errcode = '42501';
  end if;
  if target_identity_id = actor_id then
    raise exception 'control_self_mutation_denied' using errcode = '42501';
  end if;

  select status into previous_status from public.control_identities
   where id = target_identity_id for update;
  if previous_status is null then
    raise exception 'control_target_not_found' using errcode = '42704';
  end if;

  if exists (
    select 1 from public.control_identity_roles identity_role
    join public.control_roles role on role.id = identity_role.role_id
    where identity_role.identity_id = target_identity_id
      and role.role_key = 'control_admin'
      and identity_role.revoked_at is null
      and (identity_role.expires_at is null or identity_role.expires_at > now())
  ) then
    perform public.control_admin_invariant_lock();
  end if;

  update public.control_identities
     set status = new_status,
         disabled_at = case when new_status = 'disabled' then coalesce(disabled_at, now()) else null end,
         updated_at = now()
   where id = target_identity_id;

  if public.control_effective_admin_count() = 0 then
    raise exception 'control_last_admin_protected' using errcode = '42501';
  end if;

  select identity_id into actor_platform_id
    from public.control_identities where id = actor_id;

  insert into public.control_audit_events
    (actor_kind, actor_identity_id, actor_control_identity_id, actor_auth_user_id,
     action, resource_type, resource_id, outcome, request_id, metadata,
     processing_purpose, classification, retention_until)
  values
    ('user', actor_platform_id, actor_id, actor_auth,
     'identity.status_changed', 'control_identity', target_identity_id::text, 'success',
     correlation_id,
     jsonb_build_object('previous_status', previous_status, 'new_status', new_status),
     'Access control and accountability', 'restricted', now() + interval '730 days');

  return jsonb_build_object('identity_id', target_identity_id,
                            'previous_status', previous_status, 'status', new_status);
end
$$;
revoke all on function public.control_set_identity_status(uuid, text, uuid) from public, anon;
grant execute on function public.control_set_identity_status(uuid, text, uuid) to authenticated;

-- ── 7. Command: grant a role ──────────────────────────────────────────────
create or replace function public.control_grant_role(
  target_identity_id uuid,
  target_role_key text,
  correlation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid;
  actor_platform_id uuid;
  actor_auth uuid := (select auth.uid());
  target_role_id uuid;
  reactivated boolean;
begin
  actor_id := public.control_identity_for_current_user();
  if actor_id is null then
    raise exception 'control_actor_not_active' using errcode = '42501';
  end if;
  if not public.control_authorize('identity.manage') then
    raise exception 'control_permission_denied' using errcode = '42501';
  end if;
  if target_identity_id = actor_id then
    raise exception 'control_self_mutation_denied' using errcode = '42501';
  end if;
  if target_role_key = 'control_admin'
     and not public.control_authorize('identity.grant_admin') then
    raise exception 'control_admin_grant_denied' using errcode = '42501';
  end if;

  select id into target_role_id from public.control_roles where role_key = target_role_key;
  if target_role_id is null then
    raise exception 'control_role_not_found' using errcode = '42704';
  end if;
  if not exists (select 1 from public.control_identities where id = target_identity_id) then
    raise exception 'control_target_not_found' using errcode = '42704';
  end if;

  insert into public.control_identity_roles (identity_id, role_id, granted_by, granted_at)
  values (target_identity_id, target_role_id, actor_id, now())
  on conflict (identity_id, role_id) do update
     set revoked_at = null, revoked_by = null, granted_by = actor_id, granted_at = now(),
         expires_at = null
  returning (xmax <> 0) into reactivated;

  select identity_id into actor_platform_id
    from public.control_identities where id = actor_id;

  insert into public.control_audit_events
    (actor_kind, actor_identity_id, actor_control_identity_id, actor_auth_user_id,
     action, resource_type, resource_id, outcome, request_id, metadata,
     processing_purpose, classification, retention_until)
  values
    ('user', actor_platform_id, actor_id, actor_auth,
     'identity.role_granted', 'control_identity', target_identity_id::text, 'success',
     correlation_id,
     jsonb_build_object('role_key', target_role_key, 'reactivated', coalesce(reactivated, false)),
     'Least-privilege access control and accountability', 'restricted', now() + interval '730 days');

  return jsonb_build_object('identity_id', target_identity_id, 'role_key', target_role_key,
                            'reactivated', coalesce(reactivated, false));
end
$$;
revoke all on function public.control_grant_role(uuid, text, uuid) from public, anon;
grant execute on function public.control_grant_role(uuid, text, uuid) to authenticated;

-- ── 8. Command: revoke a role ─────────────────────────────────────────────
create or replace function public.control_revoke_role(
  target_identity_id uuid,
  target_role_key text,
  correlation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid;
  actor_platform_id uuid;
  actor_auth uuid := (select auth.uid());
  target_role_id uuid;
  affected int;
begin
  actor_id := public.control_identity_for_current_user();
  if actor_id is null then
    raise exception 'control_actor_not_active' using errcode = '42501';
  end if;
  if not public.control_authorize('identity.manage') then
    raise exception 'control_permission_denied' using errcode = '42501';
  end if;
  if target_identity_id = actor_id then
    raise exception 'control_self_mutation_denied' using errcode = '42501';
  end if;
  if target_role_key = 'control_admin'
     and not public.control_authorize('identity.grant_admin') then
    raise exception 'control_admin_revoke_denied' using errcode = '42501';
  end if;

  select id into target_role_id from public.control_roles where role_key = target_role_key;
  if target_role_id is null then
    raise exception 'control_role_not_found' using errcode = '42704';
  end if;

  if target_role_key = 'control_admin' then
    perform public.control_admin_invariant_lock();
  end if;

  update public.control_identity_roles
     set revoked_at = now(), revoked_by = actor_id
   where identity_id = target_identity_id
     and role_id = target_role_id
     and revoked_at is null;
  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'control_grant_not_active' using errcode = '42704';
  end if;

  if public.control_effective_admin_count() = 0 then
    raise exception 'control_last_admin_protected' using errcode = '42501';
  end if;

  select identity_id into actor_platform_id
    from public.control_identities where id = actor_id;

  insert into public.control_audit_events
    (actor_kind, actor_identity_id, actor_control_identity_id, actor_auth_user_id,
     action, resource_type, resource_id, outcome, request_id, metadata,
     processing_purpose, classification, retention_until)
  values
    ('user', actor_platform_id, actor_id, actor_auth,
     'identity.role_revoked', 'control_identity', target_identity_id::text, 'success',
     correlation_id,
     jsonb_build_object('role_key', target_role_key),
     'Least-privilege access control and accountability', 'restricted', now() + interval '730 days');

  return jsonb_build_object('identity_id', target_identity_id, 'role_key', target_role_key);
end
$$;
revoke all on function public.control_revoke_role(uuid, text, uuid) from public, anon;
grant execute on function public.control_revoke_role(uuid, text, uuid) to authenticated;

-- ── 9. Command: onboard an existing Supabase Auth account ─────────────────
-- Supabase Auth stays the owner of the account: nothing here creates, invites
-- or resets one. auth.users is resolved inside this definer function precisely
-- so no client role ever needs a grant on it. The function reveals whether an
-- address has an account, but only to a caller who already holds
-- identity.manage, which is a critical permission.
--
-- The operator is attached to the platform identity that the auth trigger and
-- the Gate A backfill guarantee. A missing platform identity is a real data
-- problem and is raised rather than silently repaired.
--
-- A new Control identity starts as 'invited', so creating one grants no access
-- on its own: activation is a second, separately audited decision.
create or replace function public.control_create_identity(
  target_email text,
  target_display_name text,
  initial_role_key text default null,
  correlation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid;
  actor_platform_id uuid;
  actor_auth uuid := (select auth.uid());
  normalised_email text := lower(trim(target_email));
  trimmed_name text := trim(target_display_name);
  target_auth uuid;
  target_platform_id uuid;
  matches int;
  new_identity_id uuid;
  target_role_id uuid;
begin
  actor_id := public.control_identity_for_current_user();
  if actor_id is null then
    raise exception 'control_actor_not_active' using errcode = '42501';
  end if;
  if not public.control_authorize('identity.manage') then
    raise exception 'control_permission_denied' using errcode = '42501';
  end if;
  if char_length(trimmed_name) < 2 or char_length(trimmed_name) > 120 then
    raise exception 'control_invalid_display_name' using errcode = '22023';
  end if;

  select count(*) into matches from auth.users where lower(email) = normalised_email;
  if matches = 0 then
    raise exception 'control_auth_user_not_found' using errcode = '42704';
  end if;
  if matches > 1 then
    raise exception 'control_auth_user_ambiguous' using errcode = '42704';
  end if;
  select id into target_auth from auth.users where lower(email) = normalised_email;

  if target_auth = actor_auth then
    raise exception 'control_self_onboarding_denied' using errcode = '42501';
  end if;

  select id into target_platform_id from public.identities
   where auth_user_id = target_auth and erased_at is null;
  if target_platform_id is null then
    raise exception 'control_platform_identity_missing' using errcode = '42704';
  end if;

  if exists (select 1 from public.control_identities
              where identity_id = target_platform_id or lower(email) = normalised_email) then
    raise exception 'control_identity_exists' using errcode = '23505';
  end if;

  insert into public.control_identities
    (identity_id, auth_user_id, display_name, email, status)
  values (target_platform_id, target_auth, trimmed_name, normalised_email, 'invited')
  returning id into new_identity_id;

  if initial_role_key is not null then
    if initial_role_key = 'control_admin'
       and not public.control_authorize('identity.grant_admin') then
      raise exception 'control_admin_grant_denied' using errcode = '42501';
    end if;
    select id into target_role_id from public.control_roles where role_key = initial_role_key;
    if target_role_id is null then
      raise exception 'control_role_not_found' using errcode = '42704';
    end if;
    insert into public.control_identity_roles (identity_id, role_id, granted_by)
    values (new_identity_id, target_role_id, actor_id);
  end if;

  select identity_id into actor_platform_id
    from public.control_identities where id = actor_id;

  -- No email in the metadata: the address lives on the identity row, which is
  -- classified and retained; repeating it here would be unnecessary.
  insert into public.control_audit_events
    (actor_kind, actor_identity_id, actor_control_identity_id, actor_auth_user_id,
     action, resource_type, resource_id, outcome, request_id, metadata,
     processing_purpose, classification, retention_until)
  values
    ('user', actor_platform_id, actor_id, actor_auth,
     'identity.created', 'control_identity', new_identity_id::text, 'success',
     correlation_id,
     jsonb_build_object('status', 'invited',
                        'initial_role', coalesce(initial_role_key, 'none')),
     'Access control and accountability', 'restricted', now() + interval '730 days');

  return jsonb_build_object('identity_id', new_identity_id, 'status', 'invited',
                            'initial_role', coalesce(initial_role_key, 'none'));
end
$$;
revoke all on function public.control_create_identity(text, text, text, uuid) from public, anon;
grant execute on function public.control_create_identity(text, text, text, uuid) to authenticated;

comment on function public.control_set_identity_status(uuid, text, uuid) is
  'Control command: authorize, validate, mutate and audit in one transaction. Audit failure rolls the mutation back.';
comment on function public.control_create_identity(text, text, text, uuid) is
  'Onboards an existing Supabase Auth account as an invited Control identity, attached to its platform identity. Resolves auth.users inside the function so no client role needs a grant on it.';

commit;
