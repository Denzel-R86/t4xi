# WhatsApp conversation kernel (2026-09-10)

Implemented as a pure, inactive module in lib/whatsapp/conversation.ts. Ingress does not import it. No migration, AI, network call, booking write, pricing call or outbound send was added.

Flow: collecting_booking → ready_for_quote → awaiting_confirmation → booking_requested → completed. Side states: handoff, cancelled, expired. `completed` means the service result was recorded, not that the trip was completed or payment received. The actual booking status is passed through.

Customer input accepts only allowlisted draft fields. Shared departure-time and luggage helpers are reused. Completeness is not booking validation, capacity or availability. Quotes enter only through a trusted domain adapter after snapshot persistence. Editing a draft increments its revision and invalidates the quote and hashed confirmation token. Confirmation requires the same scoped sender, current version, unexpired quote and matching token. The token must be delivered through an eventual outbound adapter; plain “yes” is not interpreted by this module.

A successful confirmation returns a proposed command with a deterministic identifier; it does not invoke createBooking. Cancelling after that point hands off and retains the command, since the booking outcome may be uncertain. A delayed service result can be recorded during handoff without restarting bot replies. Duplicate results cannot overwrite a recorded booking. Resume is an operator-only entrypoint; authorization belongs in the future adapter.

## Mandatory integration gates

1. Reconcile staging's canonical migration history with this checkout. Read-only staging inspection found 20260908120000_control_security_foundation and 20260908140000_revoke_rls_auto_enable_client_execute absent here. Do not derive replacement migrations from deployed SQL.
2. Configure the Meta test app, number and secrets securely. Local configuration files contained no WHATSAPP variables; no values were displayed. No WhatsApp tables were present on staging. No deployment or real Meta challenge was attempted.
3. Add transactional persistence: lock/CAS conversation version, deduplicate consumed inbound event IDs, and atomically store state, audit and pending effects. `expectedVersion` and `eventId` in this pure kernel do not implement database concurrency or deduplication. The existing ingress's active/handoff/closed lifecycle is distinct from the kernel's flow state; add an explicit mapping and versioned storage, not a cast of existing rows.
4. Persist and execute commands through a worker with claim/retry/reconciliation semantics. Do not execute effects before the state transaction commits. A deterministic command ID alone does not make the booking service idempotent. Prove service-side retry safety before booking execution; uncertain outcomes must remain in handoff and must not be retried as new bookings.
5. Build trusted pricing/snapshot and createBooking adapters, preserving the service's complete validations and input contract. The kernel draft is not yet a complete createBooking payload. Revalidate quote validity at execution, including time elapsed after confirmation. Store the full customer-visible quote snapshot in the domain layer.
6. Add outbound delivery with persisted confirmation actions, safe rendering, template/window rules and audit; verify actual Meta challenge, signatures, retries and staging E2E before activation.

The kernel is not an operational chatbot. Unit flow simulations prove transition rules, not staging end-to-end behavior or durable exactly-once execution. Existing ingress persistence remains unchanged.
