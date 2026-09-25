-- Gate B — authorization cutover to the platform identity.
--
-- After this migration the only route to Control access is
--   auth.uid() -> identities -> control_identities -> roles -> permissions
-- and `control_identities.auth_user_id` no longer decides anything. There is
-- deliberately no dual authority: the old inline predicates are replaced, not
-- supplemented, so no second path can grant access on its own.
--
-- Everything here happens in one transaction. A policy cannot exist twice under
-- the same name, so each one is dropped and recreated; inside a transaction no
-- other session observes the moment in between.
--
-- Note on `revoked_at`: soft revoke arrives in Gate D. This migration must not
-- reference that column, because it does not exist yet.
--
-- Note on SECURITY DEFINER: Sprint 1 made `control_authorize` INVOKER so RLS
-- stayed the final layer. It now has to read `identities`, which no client role
-- can see, and an RLS policy on `control_identities` cannot call a function
-- that reads `control_identities` under RLS without recursing. Both resolvers
-- are therefore DEFINER. That is safe because neither takes an identity
-- argument: they resolve the caller from auth.uid() and nothing else, so a
-- caller cannot ask about anyone but themselves.
begin;

-- Which Control identity is the caller, if any. Null for an authenticated user
-- who is not an operator, for a suspended or disabled operator, and for an
-- erased identity.
create or replace function public.control_identity_for_current_user()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select control_identity.id
    from public.control_identities control_identity
    join public.identities identity on identity.id = control_identity.identity_id
   where identity.auth_user_id = (select auth.uid())
     and identity.erased_at is null
     and control_identity.status = 'active'
     and control_identity.disabled_at is null
$$;
revoke all on function public.control_identity_for_current_user() from public, anon;
grant execute on function public.control_identity_for_current_user() to authenticated;

comment on function public.control_identity_for_current_user() is
  'Resolves the caller to an active Control identity through the platform identity. Takes no argument: the caller can only ever resolve themselves.';

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
       and (identity_role.expires_at is null or identity_role.expires_at > now())
       and permission.permission_key = required_permission
  )
$$;
revoke all on function public.control_authorize(text) from public, anon;
grant execute on function public.control_authorize(text) to authenticated;

comment on function public.control_authorize(text) is
  'Permission check through the platform identity. SECURITY DEFINER because it reads identities, which no client role may see; resolves the caller from auth.uid() only.';

-- ── The five Sprint-1 policies, rebuilt on the new resolver ───────────────
drop policy control_identity_self_read on public.control_identities;
create policy control_identity_self_read on public.control_identities
  for select to authenticated
  using (id = public.control_identity_for_current_user());

drop policy control_identity_roles_self_read on public.control_identity_roles;
create policy control_identity_roles_self_read on public.control_identity_roles
  for select to authenticated
  using (identity_id = public.control_identity_for_current_user());

drop policy control_roles_active_identity_read on public.control_roles;
create policy control_roles_active_identity_read on public.control_roles
  for select to authenticated
  using (public.control_identity_for_current_user() is not null);

drop policy control_permissions_active_identity_read on public.control_permissions;
create policy control_permissions_active_identity_read on public.control_permissions
  for select to authenticated
  using (public.control_identity_for_current_user() is not null);

drop policy control_role_permissions_active_identity_read on public.control_role_permissions;
create policy control_role_permissions_active_identity_read on public.control_role_permissions
  for select to authenticated
  using (public.control_identity_for_current_user() is not null);

-- No write policy is added anywhere, and no grant changes: browser roles still
-- hold select only, so the command RPCs remain the sole write path.

commit;
