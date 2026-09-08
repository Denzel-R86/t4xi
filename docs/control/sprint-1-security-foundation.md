# T4XI Control — Sprint 1 Security & Privacy Foundation

Status: rebased onto `024bdcf`. Canonical migration `20260908120000`; not currently applied to staging or production. An earlier, pre-remediation form of this migration did run on staging under the retired id `20260831075015` — see Migration identity.
Historical reference only: `ac2063f`, preserved as `backup/control-security-foundation-ac2063f`. All current Sprint-1 evidence points at the rebased line.

## Boundary

The shared HMAC operations session and Basic Auth brain dashboard remain temporary legacy fallbacks. New Control code may not extend them. `/admin` verifies an individual Supabase Auth user server-side, requires AAL2 by default, and checks an exact database permission. This migration creates only `control_*` objects and does not redefine `create_booking` or alter booking, pricing, event, communication or Sanity objects.

### Edge default-deny

`proxy.ts` closes `/admin` by default. A path under `/admin` that is not registered in `CONTROL_ROUTES` (`lib/control/routes.ts`) returns 404, exactly like the closed `/dashboard` routes, so a new subroute cannot become reachable by forgetting `authorizeControl()`. Registering a route is a deliberate act and is the moment to add the page's own check. Locale-prefixed Control paths (`/nl/admin`, `/en/admin`) are never valid and are closed before locale rewriting.

Cookie presence at the edge is a pre-filter, not authentication: it stops an unauthenticated visitor from confirming that a Control subroute exists. The server component remains the authoritative check, and RLS remains the final layer.

**Known gap, deliberately out of Sprint-1 scope:** the middleware matcher excludes `/api`, so a future Control API route gets no edge default-deny and must carry its own server-side authorization. Closing that gap changes the middleware surface for every existing API route and needs its own review.

## Migration identity

The canonical Control migration is **`20260908120000_control_security_foundation.sql`**.

`20260831075015_control_security_foundation.sql` is **retired and must never be reused**. Its history is part of the record:

- **2026-08-31** — applied to the staging project `ztlhydagjqfzkyfiqgio` and manually probed (`control.probe` on `security_gate`), together with a bootstrap identity that never held a role grant. Production `ajdsiklxfmmgisdvarhv` never received it.
- **2026-09-07** — the file was corrected in place for findings B, A and D, on the mistaken assumption that it had not been applied anywhere. Supabase had already recorded the version as applied, so `db push` would never have delivered the corrected content to staging.
- **2026-09-08** — the Control foundation was removed from staging under an explicit reverse scope (no `CASCADE`), and that one history row — and only that one — was reverted. The pre-reset state is preserved in `docs/control/evidence/2026-09-08-staging-pre-reset.md`.
- **2026-09-08** — renumbered to `20260908120000`, above the highest applied version on both staging and production (`20260831140000`), so that a plain `db push` applies it in order. `--include-all` was deliberately rejected: an exception must not become part of the normal deploy path.

The rename changed the migration's identity only. The SQL is byte-for-byte identical, which the unchanged SHA-256 proves.

## RLS matrix

| Resource | Authenticated read | Browser mutation | Approved mutation path |
| --- | --- | --- | --- |
| own identity and grants | active identity only | denied | later audited server command |
| role/permission definitions | active Control identity | denied | migration-controlled |
| audit events | `audit.read` | denied | authorized server + service role |
| privacy catalog/retention | `privacy.read` | denied | later audited server command |

`control_authorize` is `SECURITY INVOKER`: it does not bypass RLS. The service role remains server-only and is never an authorization substitute.

## Access decisions and audit

`authorizeControl()` is the single choke point and produces one audit event per decision about an identified principal:

| Decision | Event | Outcome | Reason |
| --- | --- | --- | --- |
| granted | `control.access` | `success` | `granted` |
| AAL1 while AAL2 required | `control.access` | `denied` | `mfa_required` |
| no matching permission | `control.access` | `denied` | `forbidden` |

Deliberately **not** audited: `unauthenticated` and `unconfigured`. There is no principal to attribute them to, and auditing anonymous hits on a public URL would let any visitor write unbounded rows into the trail. Edge default-deny and Supabase Auth cover that surface.

### Audit failure policy

- **advisory** — a failed audit write is reported but never changes the outcome. Used for access decisions: a denial stays a denial, and a logging outage must not become a lockout or a silent grant.
- **required** — the caller must treat a failed write as a denial and abort. The default for `recordControlAuditEvent`, reserved for security-sensitive mutations (identity and permission grants, privacy configuration). No such mutation exists in Sprint 1; the mechanism exists so the first one cannot be written without choosing.

Both policies report the failure to server logs without echoing the event's content. `ip_hash` stays null: deriving it is a new personal-data processing that needs its own catalog entry, lawful basis and salt handling.

## Privacy foundation

`control_data_catalog` holds **one row per Control table** — all eight. A table without a catalog entry cannot have a retention rule, because the rules reference the register, and that would mean implicit unlimited storage. Every table therefore carries an explicit decision, including a keep decision:

| Resource | Class | Personal data | Retention | Decision |
| --- | --- | --- | --- | --- |
| `control_identities` | restricted | yes | 730 d | `retain_while_active`; `disabled` → 365 d `anonymize` |
| `control_identity_roles` | restricted | yes | 730 d | `retain_while_active`; `revoked` → 365 d `delete` |
| `control_roles` | confidential | no | 3650 d | `retain_while_active` |
| `control_permissions` | confidential | no | 3650 d | `retain_while_active` |
| `control_role_permissions` | confidential | no | 3650 d | `retain_while_active` |
| `control_audit_events` | restricted | yes | 730 d | `legal_hold_review` |
| `control_data_catalog` | internal | no | 3650 d | `retain_while_active` |
| `control_retention_rules` | internal | no | 3650 d | `retain_while_active` |

Audit metadata is allow-listed, scalar and bounded. Retention execution and legal-hold handling require a later reviewed job; Sprint 1 stores policy and performs no automatic deletion.

## Evidence model

The checks in `lib/control/security-foundation.test.ts` are of two kinds and must not be weighed as one:

- **Anti-regression assertions** read the migration, `auth.ts`, `audit.ts` and `proxy.ts` and assert that the agreed guarantees are still written there. They prove the text has not silently changed. They are **not** proof of authorization behaviour.
- **Behavioural unit tests** exercise the real edge decision (`controlEdgeDecision`, `hasSessionCookie`, `isControlPath`) and the catalog/retention completeness of the migration.

The exit gate takes its authorization proof from staging probes — RLS denial, AAL, audit — not from either group above.

## Accepted residual risks (Sprint 1)

- **Audit metadata filters keys, not values.** A forbidden key (`email`, `token`, …) is rejected; a value under a permitted key is only length-bounded. Mitigation is procedural for now: producers pass enumerated scalars, not free text.
- **`identity.read` and `identity.manage` have no RLS path.** Both permissions exist and are granted to `control_admin`, but `control_identities` carries only a self-read policy, so no one can read or manage another identity yet. The permission catalog therefore describes more than the current RLS model delivers. Identity management arrives with its own audited server command, and this line must be removed when it does.

No claim beyond the implementation is made anywhere in this document.

## Existing Supabase advisory classification

- Historical unrestricted anonymous `addresses` updates: **critical, repository-remediated**; live staging state still needs verification.
- `create_booking` privileged public workflow: **high-risk interface, intentionally unchanged**; inspect grants, fixed search path, validation and overload contract before any change.
- Any live `SECURITY DEFINER` function executable by `PUBLIC`, `anon` or broad `authenticated`: **high** until caller contract and grants are proven.
- Performance-only unused/duplicate index findings: **non-security**, classify separately.
- Live advisor list: **unverified** until an authenticated staging advisor run is attached.

## Identity and MFA rollout

1. Apply the migration to an isolated non-production Supabase project.
2. Create named Auth users with verified individual email addresses; no shared identity.
3. Bootstrap the matching normalized `control_identities` row and least-privilege role as an explicit staging operator action.
4. Enrol TOTP and prove AAL1, suspended identity, expired role and missing permission are denied — and that each denial produced an attributable `control.access` event.
5. Keep `CONTROL_REQUIRE_AAL2=true` or unset. `false` is local-development-only and must not exist in any environment that points at production data.
6. Prove two named break-glass administrators can authenticate and produce attributable audit events.
7. Migrate legacy capabilities one permission at a time. Remove shared auth only in a later, separately approved migration after rollback evidence.

## Sprint-1 exit gate

GO requires: clean lint/typecheck/full tests; migration applying on clean and current staging schemas; before/after advisors classified; denial tests for unauthenticated/AAL1/suspended/expired/unpermitted users; positive AAL2 least-privilege test; audit insert plus update/delete denial proof; an audited denial and an audited grant observed end-to-end; privacy register approval; booking/pricing/event/communication smoke tests; rollback/forward-fix rehearsal; and attached query logs, migration hash and screenshots.

Current decision: **NO-GO for production**. No production write is authorized.

## Local evidence — 2026-09-07

- rebased base: `024bdcf` (main, including communication `3309f14` and the SEO city hubs);
- Sprint-1 branch: `feat/control-security-foundation`; historical pre-rebase commit `ac2063f` kept as a remote backup ref;
- canonical migration: `20260908120000_control_security_foundation.sql`, SHA-256 `f0b6e57f4c5efae26015a471413a774929dbe99173bcabc04ff31d7cae677825` — unchanged by the renumbering, because only the filename changed;
- retired id `20260831075015`: applied to staging 2026-08-31, controlled removal 2026-09-08, never applied to production, never to be reused;
- lint: passed;
- typecheck: **0 errors**. The earlier "pre-existing missing image imports" reading was a misdiagnosis: the images are tracked and present; a fresh worktree simply lacks the gitignored, build-generated `next-env.d.ts`, without which TypeScript has no module declarations for `.jpg`/`.png`. Generate or copy that file before running the gate in a new worktree;
- full suite: **868/868 passed**, of which 14 Control checks (6 anti-regression, 8 added for the B/A/D remediation, 4 of those behavioural);
- staging migration, RLS probes, Auth/MFA exercise and database advisors: not run; this worktree has no linked staging project or authenticated advisor connection;
- production writes: none.
