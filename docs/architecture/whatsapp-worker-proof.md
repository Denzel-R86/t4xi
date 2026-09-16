# Gate 2 — Worker proof (local mocks only)

Gate 1 remains GO within its reviewed local scope. This extension adds durable execution evidence to the existing outbox. No Gate 1 production function, constraint or identity was changed. The only existing source file changed is the Gate 1 test runner, adding an optional `--with-worker-schema` replay and a separate evidence filename.

## Execution model

The Gate 1 command status remains `pending`, `claimed`, `reconciliation`. Worker detail lives in `whatsapp_execution`; per-attempt fences/timestamps live in `whatsapp_execution_attempts`; append-only lifecycle events live in `whatsapp_execution_audit`. This deliberately avoids rewriting old command history. A succeeded or permanently failed command keeps its coarse `claimed` status and a terminal execution phase, so old Gate 1 claim callers cannot execute it again. Consumers must inspect execution phase for completion.

| Execution phase | Meaning | Recovery |
|---|---|---|
| No execution row + pending | Not yet claimed | Claim permitted |
| claimed | Preflight only; no effect may run | After expiry, bounded pre-effect retry |
| executing | Durable permission to start was committed; effect may have happened | After expiry, reconciliation; never blind retry |
| retryable_failed | Adapter certified no effect, or expired before begin | Retry only when next_attempt_at is due and budget remains |
| succeeded | Result, conversation decision, audit and presentation outbox committed together | No new execution |
| permanently_failed | Validation failure or retry budget exhausted | Terminal handoff |
| reconciliation | Unknown effect outcome | Handoff; no automated re-execution |

Claims use a fresh unique UUID per attempt. All start/finish/failure writes are fenced against the current command token and execution token. Maximum 3 claims/attempts; 30-second lease; exponential backoff of 1 and 2 seconds before attempts 2 and 3. A pre-effect worker crash consumes a claim attempt. There is no heartbeat extension: slow execution past the lease is conservatively unknown. Recovery discovers at most 100 due/legacy commands per pass. Calls are explicit exported functions; no daemon, cron, deployment or network client is activated.

`runMockWorker` permits only a mock-mode adapter. Preflight must be effect-free. Only a typed `PreEffectFailure` certifies retry safety; arbitrary errors/timeouts are unknown. `begin_whatsapp_effect` must successfully commit before calling the adapter. If its response is lost, the adapter is not called; recovery may conservatively mark unknown. The begin RPC also checks current conversation eligibility and stored quote expiry, without calculating a price or calling a booking engine.

A stale worker cannot start an effect after losing its pre-effect claim. If an effect may already have started, recovery never gives another worker permission to repeat it. A late original result cannot overwrite reconciliation. This is fencing and conservative recovery, not a claim of distributed exactly-once execution.

## Results and transactions

The worker reuses `acceptDomainQuote` and `acceptBookingResult`. It never calls createBooking or the pricing engine. The finish RPC locks conversation, command and execution in consistent order, checks the conversation version, and commits result, terminal phase, attempt, conversation transition, audit and proposed show_quote/show_booking rows atomically. Those presentation rows are not sent or executed.

On a result version conflict the worker reloads and recomputes up to three times using the already returned mock result; it never calls the adapter again. A stale quote result can be durably recorded as succeeded but discarded by the kernel; the recorded reason distinguishes this from presentation. An unknown result-commit outcome remains recoverable from the durable execution phase. Raw mock results remain stored locally; production retention for real result payloads requires a later decision before real data is enabled.

## Migration and compatibility

Additive migration: 20260910125036_whatsapp_worker_execution.sql. It creates three tables, indexes and invoker RPCs with no public/anon/authenticated access. No tables, rows or historical fields are dropped. Existing pending rows remain executable. Existing claimed rows without execution evidence are conservatively moved to reconciliation and handoff with audit/version update; existing reconciled rows retain their prior conversation/history. IDs, original payloads, processing and audit rows are preserved byte-for-byte in tests.

Legacy Gate 1 claim calls made after migration also remain usable, but recovery quarantines them because they supply no worker execution evidence. No legacy claim is interpreted as proof that no effect occurred. Gate 1's eight database cases were replayed with this migration installed and still pass.

## Evidence and limitations

The test harness uses isolated PostgreSQL 15 containers with network mode none and no published ports. Worker children are actual separate Node processes, terminated using SIGKILL at controlled lifecycle boundaries. An independent fake-provider PostgreSQL session commits every effect to a test ledger with NO uniqueness/dedup constraint. Therefore a hidden second invocation would produce a second row. Real bookings remain empty; no pricing, customer, payment, Meta or outbound service is called.

The 12 required cases are covered by 22 measured scenarios, including migration, both pricing/booking failures, pre-marker and post-marker crashes, a crash inside the result transaction, durable-success replay, stale-owner resumption and concurrent result CAS. Lock waits are established through pg_stat_activity/pg_blocking_pids. No wait durations are claimed. Parallel commands both reach executing with their own committed fake effect before either is released to finish.

Tests age stored lease/retry/quote timestamps using privileged fixture writes after asserting the initial state. They exercise the actual DB-clock eligibility predicates, but do not prove a real scheduler's timing or wait through every 30-second lease. Recovery is explicitly invoked by the test as a bounded discovery pass or command recovery operation. A continuously running operational supervisor is not installed.

Unknown after an actual fake booking effect is proven by effect count 1 before recovery and 1 after recovery/replay. The separate crash immediately after the durable marker but before invocation has count 0 and is still conservatively reconciled: no unsafe inference that the effect did not happen is made by recovery.

This is neither full Supabase/PostgREST verification nor a replay of every historical application migration, PostgreSQL 17/staging proof, external-provider cancellation proof, power-loss/WAL durability testing or production readiness. A service-role credential is trusted. Typed pre-effect certification is an adapter contract whose truth must be independently proven when real domain adapters are introduced. The runtime mode label alone is not a sandbox for arbitrary third-party code.

## Review boundary

Local result: Worker proof candidate for GO, subject to independent review. Gate 3/domain integration remains out of scope. No push, merge, deploy, outbound or remote database write is authorized or performed.
