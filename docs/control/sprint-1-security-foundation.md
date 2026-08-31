# T4XI Control — Sprint 1 Security & Privacy Foundation

Status: implemented from clean base `5c10a54`; not applied to staging or production.

## Boundary

The shared HMAC operations session and Basic Auth brain dashboard remain temporary legacy fallbacks. New Control code may not extend them. `/admin` verifies an individual Supabase Auth user server-side, requires AAL2 by default, and checks an exact database permission. This migration creates only `control_*` objects and does not redefine `create_booking` or alter booking, pricing, event, communication or Sanity objects.

## RLS matrix

| Resource | Authenticated read | Browser mutation | Approved mutation path |
| --- | --- | --- | --- |
| own identity and grants | active identity only | denied | later audited server command |
| role/permission definitions | active Control identity | denied | migration-controlled |
| audit events | `audit.read` | denied | authorized server + service role |
| privacy catalog/retention | `privacy.read` | denied | later audited server command |

`control_authorize` is `SECURITY INVOKER`: it does not bypass RLS. The service role remains server-only and is never an authorization substitute. Audit writes resolve the already authenticated individual identity and reject metadata keys likely to contain credentials, payloads or direct contact/address data.

## Identity and MFA rollout

1. Apply the migration to an isolated non-production Supabase project.
2. Create named Auth users with verified individual email addresses; no shared identity.
3. Bootstrap the matching normalized `control_identities` row and least-privilege role as an explicit staging operator action.
4. Enrol TOTP and prove AAL1, suspended identity, expired role and missing permission are denied.
5. Keep `CONTROL_REQUIRE_AAL2=true` or unset. `false` is local-development-only.
6. Prove two named break-glass administrators can authenticate and produce attributable audit events.
7. Migrate legacy capabilities one permission at a time. Remove shared auth only in a later, separately approved migration after rollback evidence.

## Privacy foundation

The catalog records classification, personal-data presence, purpose, lawful basis, owner and retention. Audit metadata is allow-listed, scalar, bounded and must never contain secrets, credentials, raw payloads or unnecessary personal data. Retention execution and legal-hold handling require a later reviewed job; Sprint 1 stores policy but performs no automatic deletion.

## Existing Supabase advisory classification

- Historical unrestricted anonymous `addresses` updates: **critical, repository-remediated**; live staging state still needs verification.
- `create_booking` privileged public workflow: **high-risk interface, intentionally unchanged**; inspect grants, fixed search path, validation and overload contract before any change.
- Any live `SECURITY DEFINER` function executable by `PUBLIC`, `anon` or broad `authenticated`: **high** until caller contract and grants are proven.
- Performance-only unused/duplicate index findings: **non-security**, classify separately.
- Live advisor list: **unverified** until an authenticated staging advisor run is attached.

## Sprint-1 exit gate

GO requires: clean lint/typecheck/full tests; migration applying on clean and current staging schemas; before/after advisors classified; denial tests for unauthenticated/AAL1/suspended/expired/unpermitted users; positive AAL2 least-privilege test; audit insert plus update/delete denial proof; privacy register approval; booking/pricing/event/communication smoke tests; rollback/forward-fix rehearsal; and attached query logs, migration hash and screenshots.

Current decision: **NO-GO for production**. No production write is authorized.

## Local evidence — 2026-08-31

- immutable base: `5c10a54ed18ad7cfbd72c2d54fc912bd10b8d16f`;
- Sprint-1 commit: the commit containing this evidence block;
- migration SHA-256: `f62db2a5cfa604c80406bd094865f8a2e3f8cab55e7bfa5a4840fdbd5384c96f`;
- clean baseline: lint passed; full suite 798/798 passed;
- post-change: lint passed; Control boundaries 6/6 passed; full suite 804/804 passed;
- typecheck before and after: blocked by the same eleven pre-existing missing image imports under `public/`; after correction there are no Control-specific TypeScript errors;
- staging migration, RLS probes, Auth/MFA exercise and database advisors: not run because this isolated worktree has no linked staging project or authenticated advisor connection;
- production writes: none.
