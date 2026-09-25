-- Gate C — audit actor semantics.
--
-- The audit trail gains three distinct facts per event instead of one blurred
-- pointer:
--
--   actor_kind = 'user'
--     actor_identity_id          the platform person            (required)
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
-- columns are additive, the dropped foreign key touches no data, and the new
-- check is NOT VALID so the four historical rows are left exactly as they are.
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

-- Existing rows read as 'user' through the column default, which is truthful:
-- all four were operator-attributed actions. A default on a new column does not
-- rewrite the table, so no stored row changes.
alter table public.control_audit_events
  add column actor_kind text not null default 'user'
  check (actor_kind in ('user', 'system'));

-- Conditional invariant. An event attributed to an authenticated user must
-- resolve to a platform identity; a system event may legitimately have no
-- actor at all. NOT VALID enforces this on every new row while leaving the
-- history untouched.
alter table public.control_audit_events
  add constraint control_audit_user_has_platform_actor
  check (actor_kind <> 'user' or actor_identity_id is not null) not valid;

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
  'user = attributed to an authenticated person; system = performed by the platform itself with no authenticated actor.';

commit;
