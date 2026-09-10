# Sprint 1 staging gates — 2026-09-10

Decision: NO-GO for Sprint 1 staging: leaked-password protection remains disabled.
Production was not accessed or changed during this verification.

## Scope and basis
Project: ztlhydagjqfzkyfiqgio.
Worktree: /Users/Dalgliesh/Downloads/t4xi-staging-verify.
Branch: chore/control-staging-verification-v2.
HEAD: 5464772e93fa15da1b3a603e8dd29c51a6ccc3c1.
Verified ancestry includes local main a850ba5, Control 62f042c and revoke 99cac5b.
This establishes coherence against local refs; no remote branch refresh was performed.

Local fixes, not committed:
- app/admin/layout.tsx: supplies the missing root html/body and global styles for the non-localized Control route.
- components/control/ControlLogin.tsx: reloads after successful password login so the server records mfa_required before deliberate TOTP enrolment.
An obsolete/corrupted generated Next cache was removed and rebuilt. No authentication bypass was introduced.

## Real browser and audit proof
The user entered the password and TOTP themselves. No credentials, QR or secret were read or recorded by the agent.
Actor: 6f393572-7be5-4bc4-b7c7-a0208307d743.
Identity created only after both real denials: 72c9e071-d63a-4fcf-b10d-ea80dd15f011.
Exactly the control_auditor role was assigned to this testoperator.

| UTC timestamp | Outcome | Reason | AAL | actor_identity_id | identity_resolved |
| --- | --- | --- | --- | --- | --- |
| 2026-09-10 00:58:28.240852 | denied | mfa_required | aal1 | null | false |
| 2026-09-10 00:59:45.013758 | denied | forbidden | aal2 | null | false |
| 2026-09-10 06:04:12.095308 | success | granted | aal2 | 72c9e071-d63a-4fcf-b10d-ea80dd15f011 | true |

All three rows share the actor above, action control.access and resource_type control_shell.
Metadata on every row contains exactly aal, reason and identity_resolved.
Browser verified Geen toegang before bootstrap and Security foundation / MFA AAL2 after reload.
No synthetic audit rows were inserted.

## Final checks
- Lint: PASS.
- Typecheck: PASS.
- Full suite: 1078 passed, 0 failed, 0 skipped.
- git diff --check: PASS.
- Migration history: exact equality of all 49 local and remote version/name pairs, before and after the flow.
- Latest migration: 20260908140000. Obsolete 20260831075015 absent.
- Control migration SHA-256: f0b6e57f4c5efae26015a471413a774929dbe99173bcabc04ff31d7cae677825.
- Revoke migration SHA-256: 662e7f0c567747f1155af68631c31b8f95cda84408dacf6d997c6d61d10d1a85.
- Temporary .env.staging.local copy removed after verification; source file unchanged.

## Security advisors and remaining gate
Fresh security advisors retrieved at approximately 06:04 UTC; raw results are in 2026-09-10-security-advisors.json.
No finding references a Control object; rls_auto_enable client-execution finding remains absent.
Existing non-Control findings remain: 30 RLS-without-policy informational findings; 4 mutable search paths; spatial_ref_sys RLS error; 3 extensions in public; 3 PostGIS st_estimatedextent overloads for each client role.
These are existing findings, not a clean-project claim; classification context is in 2026-09-08-staging-apply-and-probes.md.

Leaked-password protection is still disabled. Dashboard showed Free organization and feature available on Pro and above.
The user must handle the subscription/account decision and enable the setting; no upgrade or billing change was performed.
Documentation: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Once enabled, verify the setting and rerun the security advisor before changing the staging decision.
This report covers the requested remaining staging gates, not approval for production or all broader rollout/governance requirements.
