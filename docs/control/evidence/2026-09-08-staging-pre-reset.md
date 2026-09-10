# Staging Control foundation — state captured before the controlled reset

Project: `ztlhydagjqfzkyfiqgio` (t4xi-staging). Production `ajdsiklxfmmgisdvarhv` was not queried and not touched.
Captured: 2026-09-08 11:54:14 UTC, read-only, from `chore/control-staging-verification-v2`.

## Why this record exists

On 2026-08-31 migration `20260831075015_control_security_foundation.sql` was **already applied to staging** and manually probed. The Sprint-1 document claimed at the time that it had not been applied anywhere; that claim was wrong for staging, and this file preserves what was actually there. The migration was later corrected in place (findings B/A/D), so the applied schema and the repository file had diverged: Supabase records the version as applied, so `db push` would never deliver the corrected content.

This historical fact stands regardless of the reset that follows it.

## Migration history record

| version | name |
| --- | --- |
| 20260831075015 | control_security_foundation |

`migration list` showed all 48 local migrations as applied remotely; nothing was pending, and nothing was remote-applied-but-missing-local.

## Divergence from the corrected repository file

| Aspect | Staging (applied 31-08) | Corrected file (SHA-256 f0b6e57f…677825) |
| --- | --- | --- |
| `control_data_catalog` rows | 3 | 8 |
| catalog keys | `control_audit_events`, `control_identities`, `control_authorization` (synthetic) | one row per Control table |
| `control_retention_rules` rows | 3 | 10 |
| `deletion_mode` check | `delete, anonymize, legal_hold_review` | + `retain_while_active`, `manual_review` |

## Dependency inventory (the reset scope is closed)

- Inbound foreign keys to `control_*`: 7, **all Control → Control**
  (`control_audit_events.actor_identity_id`, `control_identity_roles.identity_id`, `.role_id`, `.granted_by`, `control_retention_rules.resource_key`, `control_role_permissions.role_id`, `.permission_id`).
- Outbound foreign keys leaving Control: `control_identities.auth_user_id` and `control_audit_events.actor_auth_user_id` → `auth.users(id) ON DELETE RESTRICT`. Not touched by the reset.
- Views, materialized views, rules, triggers depending on `control_*`: **none**.
- Functions mentioning `control_`: **only** `public.control_authorize(text)`.
- Policies on non-Control tables referencing Control or `control_authorize`: **none**.

No Booking, Pricing, Event, Communication or Sanity object depends on the Control foundation.

## Objects present before the reset

Eight tables, all with RLS enabled: `control_audit_events` (14 cols), `control_data_catalog` (9), `control_identities` (9), `control_identity_roles` (5), `control_permissions` (5), `control_retention_rules` (8), `control_role_permissions` (3), `control_roles` (6).

Eight SELECT policies, all `to authenticated`: self-read on identities and identity_roles; active-identity read on roles, permissions and role_permissions; `control_authorize('audit.read')` on audit events; `control_authorize('privacy.read')` on data catalog and retention rules. No INSERT/UPDATE/DELETE policy on any table.

Seventeen indexes (primary keys, the `lower(email)` unique index, the actor/time, resource and retention indexes, the identity/expiry index).

`public.control_authorize(text)`: `LANGUAGE sql`, `STABLE`, `SET search_path TO 'pg_catalog','public'`, **no SECURITY DEFINER** — invoker rights as intended.

Grants: `authenticated` holds SELECT only; `service_role` holds SELECT+INSERT on `control_audit_events` and no UPDATE/DELETE/TRUNCATE there; `anon` holds no SELECT on any Control table.

## Data present before the reset

| Table | Rows |
| --- | --- |
| control_identities | 1 |
| control_roles | 2 |
| control_permissions | 6 |
| control_role_permissions | 10 |
| control_identity_roles | **0** |
| control_audit_events | 1 |
| control_data_catalog | 3 |
| control_retention_rules | 3 |

**Bootstrap identity** — status `disabled`, created 2026-08-31 10:41:10.975868+00, disabled 2026-08-31 10:41:11.906+00, linked to an `auth.users` row. It held **no role grant** (`control_identity_roles` is empty), so it could never have passed `control_authorize`.

**The single audit row** — `control.probe` / `security_gate` / `success`, occurred 2026-08-31 10:41:11.300898+00, classification `restricted`, purpose "Security verification", retention until 2026-09-30, metadata `{"gate":"staging","probe":true}`. This is a manual probe, not an event produced by `authorizeControl()`, which writes `control.access` on `control_shell`.

Neither row is restored after the reset. They are recorded here for traceability only.
