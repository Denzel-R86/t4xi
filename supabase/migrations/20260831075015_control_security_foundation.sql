-- T4XI Control Sprint 1 — Security & Privacy Foundation.
-- Append-only and isolated: this migration does not alter booking, pricing,
-- event, communication or Sanity objects and does not redefine existing RPCs.
begin;

create table public.control_identities (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text not null check (char_length(trim(display_name)) between 2 and 120),
  email text not null,
  status text not null default 'invited'
    check (status in ('invited', 'active', 'suspended', 'disabled')),
  last_authenticated_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint control_identities_email_normalized check (email = lower(trim(email)))
);
create unique index control_identities_email_key on public.control_identities (lower(email));

create table public.control_roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique check (role_key ~ '^[a-z][a-z0-9_.-]{1,63}$'),
  name text not null,
  description text,
  system_role boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.control_permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique check (permission_key ~ '^[a-z][a-z0-9_.-]{2,95}$'),
  description text not null,
  risk_level text not null default 'standard'
    check (risk_level in ('standard', 'sensitive', 'critical')),
  created_at timestamptz not null default now()
);

create table public.control_role_permissions (
  role_id uuid not null references public.control_roles(id) on delete cascade,
  permission_id uuid not null references public.control_permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.control_identity_roles (
  identity_id uuid not null references public.control_identities(id) on delete cascade,
  role_id uuid not null references public.control_roles(id) on delete restrict,
  granted_by uuid references public.control_identities(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (identity_id, role_id)
);
create index control_identity_roles_identity_expiry_idx
  on public.control_identity_roles (identity_id, expires_at);

create table public.control_audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_identity_id uuid references public.control_identities(id) on delete restrict,
  actor_auth_user_id uuid references auth.users(id) on delete restrict,
  action text not null check (action ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  resource_type text not null check (char_length(resource_type) between 2 and 80),
  resource_id text,
  outcome text not null check (outcome in ('success', 'denied', 'failure')),
  request_id uuid,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  processing_purpose text not null,
  classification text not null
    check (classification in ('internal', 'confidential', 'restricted')),
  retention_until timestamptz not null,
  constraint control_audit_metadata_object check (jsonb_typeof(metadata) = 'object')
);
create index control_audit_events_actor_time_idx
  on public.control_audit_events (actor_identity_id, occurred_at desc);
create index control_audit_events_resource_idx
  on public.control_audit_events (resource_type, resource_id, occurred_at desc);
create index control_audit_events_retention_idx
  on public.control_audit_events (retention_until);

create table public.control_data_catalog (
  resource_key text primary key,
  classification text not null
    check (classification in ('public', 'internal', 'confidential', 'restricted')),
  contains_personal_data boolean not null default false,
  processing_purpose text not null,
  lawful_basis text not null,
  data_owner text not null,
  default_retention_days integer not null check (default_retention_days between 1 and 3650),
  notes text,
  reviewed_at timestamptz not null default now()
);

create table public.control_retention_rules (
  id uuid primary key default gen_random_uuid(),
  resource_key text not null references public.control_data_catalog(resource_key) on delete restrict,
  record_state text not null default 'default',
  retention_days integer not null check (retention_days between 1 and 3650),
  deletion_mode text not null
    check (deletion_mode in ('delete', 'anonymize', 'legal_hold_review')),
  processing_purpose text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (resource_key, record_state)
);

insert into public.control_permissions (permission_key, description, risk_level) values
  ('control.access', 'Open the T4XI Control shell', 'standard'),
  ('identity.read', 'Read Control identities and role assignments', 'sensitive'),
  ('identity.manage', 'Invite, suspend and assign Control identities', 'critical'),
  ('audit.read', 'Read the Control audit trail', 'sensitive'),
  ('privacy.read', 'Read data classification and retention configuration', 'sensitive'),
  ('privacy.manage', 'Change privacy and retention configuration', 'critical')
on conflict (permission_key) do nothing;

insert into public.control_roles (role_key, name, description, system_role) values
  ('control_admin', 'Control administrator', 'Sprint-1 security administration role', true),
  ('control_auditor', 'Control auditor', 'Read-only security, audit and privacy role', true)
on conflict (role_key) do nothing;

insert into public.control_role_permissions (role_id, permission_id)
select role.id, permission.id
from public.control_roles role cross join public.control_permissions permission
where role.role_key = 'control_admin'
on conflict do nothing;

insert into public.control_role_permissions (role_id, permission_id)
select role.id, permission.id
from public.control_roles role
join public.control_permissions permission
  on permission.permission_key in ('control.access', 'identity.read', 'audit.read', 'privacy.read')
where role.role_key = 'control_auditor'
on conflict do nothing;

insert into public.control_data_catalog
  (resource_key, classification, contains_personal_data, processing_purpose,
   lawful_basis, data_owner, default_retention_days, notes)
values
  ('control_identities', 'restricted', true, 'Access control and accountability',
   'legitimate_interest', 'Security', 730,
   'Minimise profile data; authentication secrets remain in Supabase Auth.'),
  ('control_audit_events', 'restricted', true, 'Security, fraud prevention and accountability',
   'legitimate_interest', 'Security', 730,
   'Metadata must not contain raw payloads, secrets or unnecessary personal data.'),
  ('control_authorization', 'confidential', false, 'Least-privilege access control',
   'legitimate_interest', 'Security', 730, 'Roles, permissions and grants.')
on conflict (resource_key) do nothing;

insert into public.control_retention_rules
  (resource_key, record_state, retention_days, deletion_mode, processing_purpose)
select resource_key, 'default', default_retention_days,
  case when resource_key = 'control_audit_events' then 'legal_hold_review' else 'anonymize' end,
  processing_purpose
from public.control_data_catalog
on conflict (resource_key, record_state) do nothing;

alter table public.control_identities enable row level security;
alter table public.control_roles enable row level security;
alter table public.control_permissions enable row level security;
alter table public.control_role_permissions enable row level security;
alter table public.control_identity_roles enable row level security;
alter table public.control_audit_events enable row level security;
alter table public.control_data_catalog enable row level security;
alter table public.control_retention_rules enable row level security;

-- An authenticated user can only see their own active identity and grants.
create policy control_identity_self_read on public.control_identities
  for select to authenticated
  using (auth_user_id = (select auth.uid()) and status = 'active' and disabled_at is null);
create policy control_identity_roles_self_read on public.control_identity_roles
  for select to authenticated
  using (identity_id in (
    select id from public.control_identities
    where auth_user_id = (select auth.uid()) and status = 'active' and disabled_at is null
  ));

-- Role definitions contain no personal data. Only an active Control identity can
-- read them; this enables an invoker-rights authorization function without RLS bypass.
create policy control_roles_active_identity_read on public.control_roles
  for select to authenticated using (exists (
    select 1 from public.control_identities
    where auth_user_id = (select auth.uid()) and status = 'active' and disabled_at is null
  ));
create policy control_permissions_active_identity_read on public.control_permissions
  for select to authenticated using (exists (
    select 1 from public.control_identities
    where auth_user_id = (select auth.uid()) and status = 'active' and disabled_at is null
  ));
create policy control_role_permissions_active_identity_read on public.control_role_permissions
  for select to authenticated using (exists (
    select 1 from public.control_identities
    where auth_user_id = (select auth.uid()) and status = 'active' and disabled_at is null
  ));

-- SECURITY INVOKER is deliberate: RLS remains the final authorization layer.
create or replace function public.control_authorize(required_permission text)
returns boolean
language sql
stable
security invoker
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
      and (identity_role.expires_at is null or identity_role.expires_at > now())
      and permission.permission_key = required_permission
  )
$$;

revoke all on function public.control_authorize(text) from public, anon;
grant execute on function public.control_authorize(text) to authenticated;

-- Governance data is permission-gated through the same invoker/RLS boundary.
create policy control_audit_read on public.control_audit_events
  for select to authenticated using (public.control_authorize('audit.read'));
create policy control_data_catalog_read on public.control_data_catalog
  for select to authenticated using (public.control_authorize('privacy.read'));
create policy control_retention_rules_read on public.control_retention_rules
  for select to authenticated using (public.control_authorize('privacy.read'));

grant select on public.control_identities, public.control_roles, public.control_permissions,
  public.control_role_permissions, public.control_identity_roles, public.control_audit_events,
  public.control_data_catalog, public.control_retention_rules to authenticated;
revoke insert, update, delete, truncate on public.control_identities, public.control_roles,
  public.control_permissions, public.control_role_permissions, public.control_identity_roles,
  public.control_audit_events, public.control_data_catalog, public.control_retention_rules
  from anon, authenticated;

-- Audit writes are intentionally server-only in Sprint 1. The service role bypasses
-- RLS, but application code must first establish an individual principal, permission
-- and processing purpose. There is no browser mutation policy and no update/delete path.
grant select, insert on public.control_audit_events to service_role;
revoke update, delete, truncate on public.control_audit_events from service_role;

comment on table public.control_audit_events is
  'Append-only Control audit trail. Never store secrets, credentials or raw request payloads.';
comment on function public.control_authorize(text) is
  'SECURITY INVOKER permission check; active identity RLS remains authoritative.';

commit;
