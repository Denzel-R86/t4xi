# Gate 1 — Transactional processing

Scope: an inactive server-side processor + RPC adapter + PostgreSQL transaction functions. No route activation, decoder implementation, worker, mock domain service, pricing/booking execution or outbound integration.

## Invariants

`processInbound` loads the persisted inbound message and conversation snapshot, then runs the existing deterministic kernel. The supplied deterministic decoder receives persisted content, not a separately supplied customer action. This decoder is an integration boundary; the tests decode structured fixture actions, with no natural-language inference.

The commit RPC takes the read version and computed decision. It locks the conversation, checks the unique processing registration first, rejects stale versions, and then performs the guarded `UPDATE ... WHERE id AND version`. State/flow, version, draft, processing registration, audit and proposed commands commit together. SQL does not reimplement the booking engine. Read/compute occur optimistically outside the write transaction; CAS proves that their basis still holds. Nothing executes an effect.

The processing primary key references the durable inbox message. The inbox retains its scoped UNIQUE Meta message ID. Commands are unique by message/ordinal; booking commands additionally by kernel command ID. Rejected actions are recorded with unchanged version and no commands. Audit and processing tables grant the service role SELECT/INSERT only.

A conflict causes a fresh load and a fresh kernel computation, at most three attempts. Exhaustion throws, leaving that inbound unprocessed for later redelivery. Unknown database commit errors are not automatically retried inside the processor. Redelivery of the same durable message checks the processing record and is safe even if the earlier commit succeeded.

Quote identity, revision and expiry are checked by the kernel; the commit RPC additionally checks the unchanged authoritative quote, prior awaiting-confirmation state, matching command and quote IDs, revision, and expiry at write time. No claim about actual pricing correctness is made: the authoritative adapter is not built.

One-shot command claim uses a conditional status update, a UUID fence, and a timestamp. Concurrent claimants cannot both win. There is no lease requeue, automatic expiry or external invocation. An explicit unknown-booking-outcome signal with the correct claim fence changes command status to reconciliation and conversation to handoff, with a version increment and audit in one transaction. Repeat reconciliation and claim attempts are no-ops; new customer confirmations in handoff cannot enqueue another booking. Detecting uncertainty after a future worker crash is outside this gate: claimed commands remain blocked until reconciled.

All mutating functions use SECURITY INVOKER with fixed empty search_path. Public/anon/authenticated have neither function execute nor table access. The service role is a trusted backend boundary and retains required direct table privileges; protection against a compromised service-role credential is not claimed.

## Reconciliation

WhatsApp started at recipient-allowlist commit 1ebf31cdd7e4b722d3dce55be00736d18bcc8fc1. The two migrations were on chore/control-staging-verification-v2 at 5464772e93fa15da1b3a603e8dd29c51a6ccc3c1, not in that branch ancestry/default main. Canonical evidence: docs/control/evidence/2026-09-08-staging-apply-and-probes.md at that exact Git commit. Control was renumbered to follow the already-applied August migrations; retired 20260831075015 must not return.

46 recorded Control statements and 1 revoke statement were compared against the canonical Git SQL: all occur verbatim in order. Control SHA-256 f0b6e57f4c5efae26015a471413a774929dbe99173bcabc04ff31d7cae677825; revoke SHA-256 662e7f0c567747f1155af68631c31b8f95cda84408dacf6d997c6d61d10d1a85. Only these two files were copied locally; no remote repair/reset/reapply occurred. Staging has 49 applied versions; remote-missing-local is now zero. Only WhatsApp ingress and Gate 1 migrations are pending. This proves the two-file reconciliation, not a fresh full-schema replay of all historical migrations.

## Reproducing the database evidence

Create an isolated container named t4xi-whatsapp-gate1 using postgres:15-alpine, network none, POSTGRES_HOST_AUTH_METHOD=trust, no published ports. Run `node --import tsx scripts/test-whatsapp-gate1.ts` from the repo. The test creates and removes its own database. Do not target a shared container: test roles are cluster-level. Raw evidence is written to work/gate1/postgres-evidence.json.

Cases use independent persistent psql sessions. Contention is observed via pg_stat_activity and pg_blocking_pids, not inferred from Promise.all. Test-only AFTER triggers pause after state mutation or command insertion; pg_terminate_backend kills the blocked test backend. Observer snapshots before release and after termination must exactly match the pre-transaction snapshot. Test triggers do not appear in the production migration.

The local harness runs PostgreSQL 15, minimal pre-existing bookings table, ingress and Gate 1 migrations. It is not full Supabase, PostgREST, WAL/power-loss testing or PostgreSQL 17 staging verification. The RPC adapter is supplied but the DB tests call the same RPC functions over psql; HTTP serialization/authorization is not tested here. Quote/booking-request state in case 8 is a fixed precondition, not a mock pricing/booking service. No external booking occurs.

Reference: PostgreSQL 17 transaction isolation and explicit locking documentation; Supabase Postgres short-transactions and lock-order guidance. Final gate decision remains with the independent reviewer.
