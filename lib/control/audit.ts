import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { ControlPrincipal } from "@/lib/control/auth";

type AuditScalar = string | number | boolean | null;
type AuditMetadata = Record<string, AuditScalar>;

const SAFE_METADATA_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const FORBIDDEN_METADATA_KEY = /(password|secret|token|authorization|cookie|email|phone|address|payload)/i;

function safeMetadata(metadata: AuditMetadata): AuditMetadata {
  const entries = Object.entries(metadata);
  if (entries.length > 20) throw new Error("control_audit_metadata_too_large");
  for (const [key, value] of entries) {
    if (!SAFE_METADATA_KEY.test(key) || FORBIDDEN_METADATA_KEY.test(key)) {
      throw new Error("control_audit_metadata_key_rejected");
    }
    if (typeof value === "string" && value.length > 200) {
      throw new Error("control_audit_metadata_value_too_large");
    }
  }
  return Object.fromEntries(entries);
}

/**
 * Audit failure policy — decided in Sprint 1, deliberately explicit.
 *
 *   "advisory" — an audit write failure MUST NOT change the outcome of the
 *                handling itself. Used for access decisions: a denial stays a
 *                denial and a granted read stays granted, because turning a
 *                logging outage into a lockout (or into a silent grant) is the
 *                worse failure mode for a read-only shell.
 *   "required" — the caller MUST treat `false` as a denial and abort. Reserved
 *                for security-sensitive mutations (identity/permission grants,
 *                privacy configuration). No such mutation exists in Sprint 1;
 *                the mechanism exists so the first one cannot be written
 *                without choosing.
 *
 * Both policies report the failure; neither swallows it silently.
 */
export type ControlAuditPolicy = "advisory" | "required";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function retentionUntil(retentionDays: number): string {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    throw new Error("control_audit_retention_invalid");
  }
  return new Date(Date.now() + retentionDays * 86_400_000).toISOString();
}

/** Reports an audit write failure without leaking the event's own content. */
function reportAuditFailure(action: string, policy: ControlAuditPolicy, detail: string): void {
  console.error(
    `[control-audit] write failed action=${action} policy=${policy} detail=${detail}`,
  );
}

const ACCESS_PURPOSE = "Security, fraud prevention and accountability";

/**
 * The access decision producer for /admin. Every server-side decision that
 * concerns an *identified* principal produces one event:
 *
 *   granted       → outcome "success"
 *   mfa_required  → outcome "denied", reason mfa_required
 *   forbidden     → outcome "denied", reason forbidden
 *
 * Deliberately NOT audited: "unauthenticated" and "unconfigured". There is no
 * principal to attribute them to, and an anonymous request to a public URL
 * would otherwise let any visitor write unbounded rows into the audit trail.
 * Edge default-deny and Supabase Auth cover that surface instead.
 *
 * `ip_hash` stays null: deriving it introduces a new personal-data processing
 * that needs its own catalog entry, lawful basis and salt handling. Not in
 * Sprint 1, and not silently.
 */
export async function recordControlAccessDecision(input: {
  authUserId: string;
  outcome: "success" | "denied";
  reason?: "mfa_required" | "forbidden";
  aal: "aal1" | "aal2";
  permission: string;
  requestId?: string;
  policy?: ControlAuditPolicy;
}): Promise<boolean> {
  const policy = input.policy ?? "advisory";
  const client = serviceClient();
  if (!client) {
    reportAuditFailure("control.access", policy, "unconfigured");
    return false;
  }

  // Best effort: an authenticated user without an active Control identity is
  // exactly the event worth keeping, so a missing identity is not a reason to
  // drop the row — only actor_identity_id stays null.
  const { data: identity } = await client
    .from("control_identities")
    .select("id")
    .eq("auth_user_id", input.authUserId)
    .eq("status", "active")
    .is("disabled_at", null)
    .maybeSingle();

  const { error } = await client.from("control_audit_events").insert({
    actor_identity_id: identity?.id ?? null,
    actor_auth_user_id: input.authUserId,
    action: "control.access",
    resource_type: "control_shell",
    resource_id: input.permission,
    outcome: input.outcome,
    request_id: input.requestId ?? null,
    metadata: {
      aal: input.aal,
      reason: input.reason ?? "granted",
      identity_resolved: Boolean(identity),
    },
    processing_purpose: ACCESS_PURPOSE,
    classification: "restricted",
    retention_until: retentionUntil(730),
  });

  if (error) {
    reportAuditFailure("control.access", policy, error.code ?? "insert_failed");
    return false;
  }
  return true;
}

export async function recordControlAuditEvent(input: {
  principal: ControlPrincipal;
  action: string;
  resourceType: string;
  resourceId?: string;
  outcome: "success" | "denied" | "failure";
  processingPurpose: string;
  requestId?: string;
  metadata?: AuditMetadata;
  retentionDays?: number;
  /** Defaults to "required": a mutation that cannot be audited must not stand. */
  policy?: ControlAuditPolicy;
}): Promise<boolean> {
  const policy = input.policy ?? "required";
  const retentionDays = input.retentionDays ?? 730;
  const until = retentionUntil(retentionDays);
  const metadata = safeMetadata(input.metadata ?? {});
  const client = serviceClient();
  if (!client) {
    reportAuditFailure(input.action, policy, "unconfigured");
    return false;
  }
  const { data: identity, error: identityError } = await client
    .from("control_identities")
    .select("id")
    .eq("auth_user_id", input.principal.userId)
    .eq("status", "active")
    .is("disabled_at", null)
    .single();
  if (identityError || !identity) {
    reportAuditFailure(input.action, policy, "identity_unresolved");
    return false;
  }
  const { error } = await client.from("control_audit_events").insert({
    actor_identity_id: identity.id,
    actor_auth_user_id: input.principal.userId,
    action: input.action,
    resource_type: input.resourceType,
    resource_id: input.resourceId ?? null,
    outcome: input.outcome,
    request_id: input.requestId ?? null,
    metadata,
    processing_purpose: input.processingPurpose,
    classification: "restricted",
    retention_until: until,
  });
  if (error) {
    reportAuditFailure(input.action, policy, error.code ?? "insert_failed");
    return false;
  }
  return true;
}
