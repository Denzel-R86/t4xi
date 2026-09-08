# Staging apply + Sprint-1 probes — 2026-09-08

Project: `ztlhydagjqfzkyfiqgio` (t4xi-staging). Production `ajdsiklxfmmgisdvarhv` was read once, read-only, only to establish its highest migration version (`20260831140000`); it received no write.

Base: `chore/control-staging-verification-v2` = main `024bdcf` + Event Pricing `52e6ca8` + Control `6faff40`.
Migration: `20260908120000_control_security_foundation.sql`, SHA-256 `f0b6e57f4c5efae26015a471413a774929dbe99173bcabc04ff31d7cae677825`.

## Gate before apply

```
remote-applied-but-missing-local: 0

pending:
  20260908120000_control_security_foundation.sql

unexpected pending: 0
```

`supabase db push --dry-run` (plain, **no** `--include-all`): would push exactly that one migration, no seeds, no roles. Applied with a plain `db push`.

## Schema after apply

| Check | Result |
| --- | --- |
| `control_*` tables | 8 |
| tables with RLS enabled | 8 |
| policies | 8, all SELECT; **0** INSERT/UPDATE/DELETE policies |
| `control_data_catalog` rows | **8** — one per table, no synthetic key |
| `control_retention_rules` rows | **10** |
| `deletion_mode` check | `delete, anonymize, legal_hold_review, retain_while_active, manual_review` |
| `control_authorize` | `prosecdef = false` (SECURITY INVOKER) |
| migration recorded | yes, version 20260908120000 |

## Authorization and RLS probes

Executed inside a single statement that deliberately aborted at the end, so every probe row rolled back. Verified afterwards: `control_identities`, `control_identity_roles` and `control_audit_events` all back to 0 rows.

| Probe | Expected | Actual |
| --- | --- | --- |
| active identity + granted permission (`audit.read`) | true | true |
| active identity + ungranted permission (`identity.manage`) | false | false |
| RLS: own identity visible | 1 | 1 |
| RLS: catalog visible with `privacy.read` | 8 | 8 |
| suspended identity denied | false | false |
| RLS: suspended identity invisible to itself | 0 | 0 |
| expired role grant denied | false | false |
| unknown auth user denied | false | false |
| RLS: unknown user sees no identity | 0 | 0 |
| `anon` read on `control_roles` | 0 rows or denied | denied (insufficient_privilege) |

## Audit append-only probes

| Probe | Expected | Actual |
| --- | --- | --- |
| `service_role` INSERT audit event | allowed | allowed |
| `service_role` UPDATE audit event | denied | denied |
| `service_role` DELETE audit event | denied | denied |
| `service_role` TRUNCATE audit events | denied | denied |
| `authenticated` INSERT audit event | denied | denied |

## Supabase security advisors

Run after apply. **No finding references any `control_*` object or `control_authorize`.** All 8 Control tables are absent from `rls_enabled_no_policy`, and `control_authorize` appears in neither SECURITY DEFINER lint, confirming invoker rights. The Control migration introduced no advisor finding.

Pre-existing, not caused by Control, classified per the Sprint-1 scheme:

- **High, needs its own decision** — `public.rls_auto_enable()` is `SECURITY DEFINER` and executable by both `anon` and `authenticated` via `/rest/v1/rpc/rls_auto_enable`. This is exactly the category the Sprint-1 document flags as high until the caller contract and grants are proven. Not a Control object; belongs to its own remediation.
- **Auth hardening, relevant to Control** — leaked-password protection (HaveIBeenPwned) is disabled. Control signs in with Supabase Auth passwords, so this belongs in the identity rollout.
- **Pre-existing, non-Control** — 30 × `rls_enabled_no_policy` on `brain_*`, `pricing_*`, `communication_deliveries`, `booking_status_transitions`, `price_snapshot*`, `executing_carriers`, `flight_monitoring`, `booking_invoice_details`; 4 × mutable `search_path` on the address functions; `spatial_ref_sys` RLS (PostGIS system table); PostGIS/pg_trgm/unaccent installed in `public`; `st_estimatedextent` overloads (PostGIS built-ins).

## Repository gates on this base

lint clean · typecheck 0 errors · full suite **1043/1043**.

## NOT proven — the gate is not complete

- **AAL1/AAL2 and MFA.** Staging has 1 auth user, **0 MFA factors, 0 verified**. AAL2 is unreachable today, so neither the AAL1 denial nor the AAL2 grant is proven at runtime. With `CONTROL_REQUIRE_AAL2` at its secure default every sign-in would currently be denied with `mfa_required` — correct fail-closed behaviour, but not the positive proof the gate requires.
- **Real `control.access` audit production.** The probes proved the database accepts exactly the row shape `recordControlAccessDecision` writes and refuses every mutation of it, but no event was produced through `authorizeControl()` itself. That needs the application running against staging with an authenticated AAL2 user.
- **Edge default-deny at runtime.** Proven by unit test against the real decision function, not yet by an HTTP request to a deployed `/admin`.

These three need a named staging operator: create the individual Auth users, enrol TOTP, bootstrap `control_identities` with a least-privilege grant, then exercise `/admin`. Creating accounts and handling credentials is deliberately outside what was automated here.

Current decision: **NO-GO for production.** No production write is authorized.

---

# Addendum — 2026-09-08, later: MFA build, header correction, grant revoke

## `rls_auto_enable` grant revoke — applied and proven

Migration `20260908140000_revoke_rls_auto_enable_client_execute.sql`, on its own branch
`chore/revoke-rls-auto-enable-client-execute` so the workstream stays separate from Control.
Dry-run offered exactly that one migration; applied with a plain `db push`.

| Probe | Expected | Actual |
| --- | --- | --- |
| `anon` direct call | denied | denied (insufficient_privilege) |
| `authenticated` direct call | denied | denied (insufficient_privilege) |
| `ensure_rls` event trigger still enabled | 1 | 1 |
| new `public` table still auto-gets RLS | true | true |
| test table removed again | 0 | 0 |
| remaining EXECUTE grants | `postgres` only | `postgres` only |

Advisors re-run afterwards: `rls_auto_enable` has **disappeared** from both SECURITY DEFINER
lints, which drop from 4 findings to 3. The three that remain are the PostGIS
`st_estimatedextent` overloads. No Control object appears in any finding.

The safety net is intact: a newly created `public` table still receives RLS automatically,
so revoking direct execution did not disable the event trigger.

## Reclassification

The advisor described `rls_auto_enable` as an exploitable public SECURITY DEFINER RPC.
Measured before the revoke, both `anon` and `authenticated` could indeed invoke it, but the
body iterates `pg_event_trigger_ddl_commands()`, which yields nothing outside a DDL event,
and the function takes no arguments — so a direct call had no effect and no injection
surface. Classified as **hygiene beside a privileged Control layer**, not as an exploit.

Governance note: the function is not repo-managed and not owned by an extension. This
migration manages only its grants. If the platform restores the grant, that is platform
governance and the migration should be reconsidered rather than re-applied in a loop.

## Staging state after this round

49 migrations applied, 8 Control tables, no probe residue, no client grants on
`rls_auto_enable`. Repository gates on the refreshed base
(main `a850ba5` + Control `62f042c` + revoke `99cac5b`): lint clean, typecheck 0,
**1078/1078**.

## Still open before a production decision

- **MFA runtime proof.** The shell can now enrol and verify a TOTP factor, but no operator
  has walked it. `mfa_required` / `forbidden` / `granted` and their audit rows remain unproven.
- **Leaked password protection** is still disabled (Authentication → Password security).
- Production remains untouched and NO-GO.
