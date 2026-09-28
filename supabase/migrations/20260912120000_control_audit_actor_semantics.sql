-- Gate C — audit actor semantics.
--
-- The audit trail gains three distinct facts per event instead of one blurred
-- pointer:
--
--   actor_kind = 'user'
--     actor_control_identity_id  the Control operator, or null  (optional)
--     actor_auth_user_id         which auth account at the time (snapshot)
--
--   actor_kind = 'system'
--     all three null
--
-- A denied access by an authenticated non-operator therefore records a real
-- actor with no Control identity — exactly the information that was missing.
--
-- No existing row is modified. The rename is a catalog operation, the new
-- columns are additive, the dropped foreign key touches no data, and the
-- history is separated from the new semantics by its own actor kind rather
-- than by an invariant that can never be validated.
--
-- Why rename rather than repurpose: the old `actor_identity_id` was provably
-- always a control_identities.id — the foreign key said so and all six
-- producers wrote one without exception — while its name promised something
-- generic. Keeping the generic name for the specific concept would be the
-- semantic corruption this migration exists to remove.
begin;

alter table public.control_audit_events
  rename column actor_identity_id to actor_control_identity_id;
alter index control_audit_events_actor_time_idx
  rename to control_audit_events_control_actor_time_idx;

alter table public.control_audit_events
  add column actor_identity_id uuid references public.identities(id) on delete restrict;

-- Existing rows become 'legacy', which is the truthful description: they were
-- written before a platform identity existed to attribute them to. They acquire
-- the value through the column default, and adding a column with a non-volatile
-- default neither rewrites the table nor runs an UPDATE, so every stored row
-- survives exactly as it was recorded.
alter table public.control_audit_events
  add column actor_kind text not null default 'legacy';

alter table public.control_audit_events
  add constraint control_audit_actor_kind_known
  check (actor_kind in ('legacy', 'user', 'system'));

-- No default from here on: every new row states its own kind. An omission is a
-- not-null violation rather than a silent mislabelling.
alter table public.control_audit_events
  alter column actor_kind drop default;

-- 'legacy' is a statement about the past, so no new row may claim it. This is a
-- trigger and not a check constraint on purpose: a check cannot tell an existing
-- row from a new one, which is precisely why the earlier shape of this migration
-- was stuck at NOT VALID for good. No runtime writer can route around it —
-- `authenticated` holds no insert privilege on the trail at all, `service_role`
-- is limited to select and insert with update, delete and truncate revoked, and
-- the Control RPCs are security definer functions that name their actor kind
-- explicitly. A trigger fires for every one of them.
create or replace function public.control_audit_reject_legacy_write()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.actor_kind = 'legacy' then
    raise exception 'control_audit_legacy_kind_reserved' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function public.control_audit_reject_legacy_write()
  from public, anon, authenticated, service_role;

create trigger control_audit_reject_legacy_write
  before insert on public.control_audit_events
  for each row execute function public.control_audit_reject_legacy_write();

-- Valid from the moment it is created, and it stays that way: every historical
-- row is 'legacy', every new user event carries a platform actor, and a system
-- event may carry none.
alter table public.control_audit_events
  add constraint control_audit_user_has_platform_actor
  check (actor_kind <> 'user' or actor_identity_id is not null);

-- The audit trail must never block removal of an auth account. The column stays
-- as an immutable snapshot for forensic readability; only the reference goes.
alter table public.control_audit_events
  drop constraint control_audit_events_actor_auth_user_id_fkey;

create index control_audit_events_platform_actor_time_idx
  on public.control_audit_events (actor_identity_id, occurred_at desc);

comment on column public.control_audit_events.actor_identity_id is
  'The platform person who acted. Required for actor_kind = user, null for system events.';
comment on column public.control_audit_events.actor_control_identity_id is
  'The Control operator who acted, when the actor had one. Null for an authenticated user who is not a Control operator, which is itself the point of the field.';
comment on column public.control_audit_events.actor_auth_user_id is
  'Which auth account was used at the time. An immutable snapshot, deliberately not a foreign key: removing an auth account may never be blocked by, or damage, the audit trail.';
comment on column public.control_audit_events.actor_kind is
  'legacy = recorded before platform identities existed and never rewritten; user = attributed to an authenticated person, who must resolve to a platform identity; system = performed by the platform itself with no authenticated actor.';

commit;
