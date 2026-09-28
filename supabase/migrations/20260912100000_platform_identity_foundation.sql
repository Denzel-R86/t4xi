-- Gate A — platform identity foundation (ADR-015, invariant I1).
--
-- One indirection layer between Supabase Auth and the domain. From here on
-- `public.identities` is the only table in `public` that may hold a foreign key
-- into the `auth` schema; every domain that needs to know who someone is points
-- at an identity instead.
--
-- Deliberately NOT in this migration:
--   * `identity_roles` — Control has its own RBAC in `control_identity_roles`,
--     and a generic role table with no current consumer would add a second
--     authorization concept that can later collide with I3.
--   * any operational status. `identities` represents the platform person and
--     the link to authentication, nothing more. Whether someone may act stays a
--     domain question, so `control_identities.status` remains the only
--     operational access lifecycle for Control.
--
-- This migration is additive and changes no behaviour: Control keeps resolving
-- through `auth_user_id` until Gate B switches it over.
begin;

create table public.identities (
  id uuid primary key default gen_random_uuid(),
  -- Nullable on purpose. Removing the auth account must not break the domain
  -- or the audit trail; it must only remove the authentication path.
  auth_user_id uuid unique references auth.users(id) on delete set null,
  erased_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- An erased identity may not keep a way back in.
  constraint identities_erased_has_no_auth
    check (erased_at is null or auth_user_id is null)
);

comment on table public.identities is
  'The platform person. Only table in public with a foreign key into auth (ADR-015 I1). Holds no PII and no operational status.';
comment on column public.identities.auth_user_id is
  'Nullable link to Supabase Auth. Null means there is no authentication path to this identity, either because the account was never linked or because it was removed.';
comment on column public.identities.erased_at is
  'Set when the person exercised erasure. An erased identity keeps its row so the audit trail stays referentially intact, but can hold no auth_user_id.';

alter table public.identities enable row level security;
revoke all on table public.identities from public, anon, authenticated;
grant select, insert, update on table public.identities to service_role;

-- No policy is created. Nothing reads this table as `authenticated`: Gate B
-- resolves through SECURITY DEFINER helpers, so a client never touches it
-- directly and RLS denies everything by default.

-- ── Every auth account gets an identity ───────────────────────────────────
-- Without this, an authenticated visitor who is not a Control operator has no
-- stable actor, and a denied-access event could not be attributed at all.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.identities (auth_user_id)
  values (new.id)
  on conflict (auth_user_id) do nothing;
  return new;
end
$$;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ── Backfill, driven by auth.users ────────────────────────────────────────
-- Driven by auth.users and not by control_identities on purpose: an account
-- without Control operatorship still needs an identity, for exactly the denied
-- event described above.
insert into public.identities (auth_user_id)
select u.id
from auth.users u
where not exists (
  select 1 from public.identities i where i.auth_user_id = u.id
);

-- ── Control bridge ────────────────────────────────────────────────────────
alter table public.control_identities
  add column if not exists identity_id uuid references public.identities(id) on delete restrict;

update public.control_identities ci
   set identity_id = i.id,
       updated_at = now()
  from public.identities i
 where i.auth_user_id = ci.auth_user_id
   and ci.identity_id is null;

-- Coverage proof inside the transaction: if a single Control identity failed to
-- map, the whole migration rolls back rather than leaving an operator who can
-- no longer be resolved after Gate B.
do $$
declare unmapped int;
begin
  select count(*) into unmapped from public.control_identities where identity_id is null;
  if unmapped > 0 then
    raise exception 'gate_a_incomplete_bridge: % control identities without identity_id', unmapped;
  end if;
end
$$;

alter table public.control_identities alter column identity_id set not null;
alter table public.control_identities
  add constraint control_identities_identity_id_key unique (identity_id);

comment on column public.control_identities.identity_id is
  'The platform identity this operator is. Authoritative from Gate B onward; auth_user_id is legacy and retires in Gate E.';

commit;
