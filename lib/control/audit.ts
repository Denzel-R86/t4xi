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
}): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return false;
  const retentionDays = input.retentionDays ?? 730;
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    throw new Error("control_audit_retention_invalid");
  }
  const metadata = safeMetadata(input.metadata ?? {});
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: identity, error: identityError } = await client
    .from("control_identities")
    .select("id")
    .eq("auth_user_id", input.principal.userId)
    .eq("status", "active")
    .is("disabled_at", null)
    .single();
  if (identityError || !identity) return false;
  const retentionUntil = new Date(Date.now() + retentionDays * 86_400_000).toISOString();
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
    retention_until: retentionUntil,
  });
  return !error;
}
