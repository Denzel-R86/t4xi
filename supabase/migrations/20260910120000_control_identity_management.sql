-- T4XI Control Sprint 2A — Identity Management.
--
-- Closes Sprint-1 residual risk F: identity.read and identity.manage existed
-- as permissions but control_identities carried only a self-read policy, so no
-- administrator could read or manage another identity and the only way to
-- onboard an operator was raw SQL with the service role.
--
-- It also establishes the canonical Control write pattern: one purpose-built
-- command per mutation, which resolves the actor from auth.uid(), re-checks the
-- permission in PostgreSQL, validates the target, enforces the escalation
-- rules, mutates, and writes the required audit row **in the same
-- transaction**. If the audit insert fails, the mutation rolls back with it.
--
-- Append-only: no Sprint-1 migration is rewritten. control_authorize is
-- replaced in place because active-grant semantics change (soft revoke).
begin;

-- ── 1. identity.grant_admin ───────────────────────────────────────────────
-- Granting or revoking control_admin needs a second, separate permission, so
-- identity.manage alone can never mint an administrator.
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
-- A revoked grant must stay visible instead of disappearing. The composite
-- primary key is kept, so re-granting the same role reactivates the row; the
-- grant/revoke sequence itself lives in control_audit_events, which is the
-- authoritative history.
alter table public.control_identity_roles
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.control_identities(id) on delete set null;

create index if not exists control_identity_roles_active_idx
  on public.control_identity_roles (identity_id) where revoked_at is null;

comment on column public.control_identity_roles.revoked_at is
  'Soft revoke. A grant only counts for authorization while this is null.';

-- ── 3. One authorization implementation ───────────────────────────────────
-- SECURITY DEFINER, because an RLS policy on control_identities cannot call a
-- function that reads control_identities under RLS — PostgreSQL would detect
-- infinite recursion. It is safe: the function takes no identity argument and
-- always resolves the actor from auth.uid(), so a caller cannot ask about
-- anyone but themselves.
create or replace function public.control_permission_check(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.control_identities identity
    join public.control_identity_roles identity_role on identity_role.identity_id = identity.id
    join public.control_role_permissions role_permission on role_permission.role_id = identity_role.role_id
    join public.control_permissions permission on permission.id = role_permission.permission_id
    where identity.auth_user_id = (select auth.uid())
      and identity.status = 'active'
      and identity.disabled_at is null
      and identity_role.revoked_at is null
      and (identity_role.expires_at is null or identity_role.expires_at > now())
      and permission.permission_key = required_permission
  )
$$;
revoke all on function public.control_permission_check(text) from public, anon;
grant execute on function public.control_permission_check(text) to authenticated;

-- control_authorize keeps its name and contract for existing policies and for
-- the application, and now delegates so there is a single implementation of
-- the rule. Revoked grants no longer count.
create or replace function public.control_authorize(required_permission text)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select public.control_permission_check(required_permission)
$$;

-- ── 4. Internal helpers, not callable from a client ───────────────────────
create or replace function public.control_actor_identity()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select id from public.control_identities
   where auth_user_id = (select auth.uid())
     and status = 'active'
     and disabled_at is null
$$;
revoke all on function public.control_actor_identity() from public, anon, authenticated;

-- The last-admin invariant. Counted after the mutation, inside the same
-- transaction, so a concurrent change cannot slip between check and write.
create or replace function public.control_effective_admin_count()
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(distinct identity.id)::int
  from public.control_identities identity
  join public.control_identity_roles identity_role on identity_role.identity_id = identity.id
  join public.control_roles role on role.id = identity_role.role_id
  where identity.status = 'active'
    and identity.disabled_at is null
    and identity_role.revoked_at is null
    and (identity_role.expires_at is null or identity_role.expires_at > now())
    and role.role_key = 'control_admin'
$$;
revoke all on function public.control_effective_admin_count() from public, anon, authenticated;

-- ── 5. Additive read policies ─────────────────────────────────────────────
-- The Sprint-1 self-read policies stay exactly as they are; these are extra
-- SELECT policies, so an ordinary identity is unaffected and a reader without
-- identity.read gains nothing.
create policy control_identities_manager_read on public.control_identities
  for select to authenticated
  using (public.control_permission_check('identity.read'));

create policy control_identity_roles_manager_read on public.control_identity_roles
  for select to authenticated
  using (public.control_permission_check('identity.read'));

-- No write policy is added anywhere: the commands below are the only write
-- path, and browser roles still hold no insert/update/delete grant.

-- ── 6. Command: change an identity's status ───────────────────────────────
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
  actor_auth uuid := (select auth.uid());
  previous_status text;
begin
  if new_status not in ('invited', 'active', 'suspended', 'disabled') then
    raise exception 'control_invalid_status' using errcode = '22023';
  end if;

  actor_id := public.control_actor_identity();
  if actor_id is null then
    raise exception 'control_actor_not_active' using errcode = '42501';
  end if;
  if not public.control_permission_check('identity.manage') then
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

  update public.control_identities
     set status = new_status,
         disabled_at = case when new_status = 'disabled' then coalesce(disabled_at, now()) else null end,
         updated_at = now()
   where id = target_identity_id;

  if public.control_effective_admin_count() = 0 then
    raise exception 'control_last_admin_protected' using errcode = '42501';
  end if;

  insert into public.control_audit_events
    (actor_identity_id, actor_auth_user_id, action, resource_type, resource_id, outcome,
     request_id, metadata, processing_purpose, classification, retention_until)
  values
    (actor_id, actor_auth, 'identity.status_changed', 'control_identity',
     target_identity_id::text, 'success', correlation_id,
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
  actor_auth uuid := (select auth.uid());
  target_role_id uuid;
  reactivated boolean;
begin
  actor_id := public.control_actor_identity();
  if actor_id is null then
    raise exception 'control_actor_not_active' using errcode = '42501';
  end if;
  if not public.control_permission_check('identity.manage') then
    raise exception 'control_permission_denied' using errcode = '42501';
  end if;
  if target_identity_id = actor_id then
    raise exception 'control_self_mutation_denied' using errcode = '42501';
  end if;
  if target_role_key = 'control_admin'
     and not public.control_permission_check('identity.grant_admin') then
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

  insert into public.control_audit_events
    (actor_identity_id, actor_auth_user_id, action, resource_type, resource_id, outcome,
     request_id, metadata, processing_purpose, classification, retention_until)
  values
    (actor_id, actor_auth, 'identity.role_granted', 'control_identity',
     target_identity_id::text, 'success', correlation_id,
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
  actor_auth uuid := (select auth.uid());
  target_role_id uuid;
  affected int;
begin
  actor_id := public.control_actor_identity();
  if actor_id is null then
    raise exception 'control_actor_not_active' using errcode = '42501';
  end if;
  if not public.control_permission_check('identity.manage') then
    raise exception 'control_permission_denied' using errcode = '42501';
  end if;
  if target_identity_id = actor_id then
    raise exception 'control_self_mutation_denied' using errcode = '42501';
  end if;
  if target_role_key = 'control_admin'
     and not public.control_permission_check('identity.grant_admin') then
    raise exception 'control_admin_revoke_denied' using errcode = '42501';
  end if;

  select id into target_role_id from public.control_roles where role_key = target_role_key;
  if target_role_id is null then
    raise exception 'control_role_not_found' using errcode = '42704';
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

  insert into public.control_audit_events
    (actor_identity_id, actor_auth_user_id, action, resource_type, resource_id, outcome,
     request_id, metadata, processing_purpose, classification, retention_until)
  values
    (actor_id, actor_auth, 'identity.role_revoked', 'control_identity',
     target_identity_id::text, 'success', correlation_id,
     jsonb_build_object('role_key', target_role_key),
     'Least-privilege access control and accountability', 'restricted', now() + interval '730 days');

  return jsonb_build_object('identity_id', target_identity_id, 'role_key', target_role_key);
end
$$;
revoke all on function public.control_revoke_role(uuid, text, uuid) from public, anon;
grant execute on function public.control_revoke_role(uuid, text, uuid) to authenticated;

comment on function public.control_set_identity_status(uuid, text, uuid) is
  'Control command: authorize, validate, mutate and audit in one transaction. Audit failure rolls the mutation back.';

commit;
