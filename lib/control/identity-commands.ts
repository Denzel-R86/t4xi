/**
 * Pure vocabulary for the Control identity commands: the conditions PostgreSQL
 * raises and the reasons the application reports. Deliberately free of any
 * server-only import so the mapping can be unit-tested directly instead of
 * being asserted against source text.
 */

export type CommandName = "create_identity" | "set_status" | "grant_role" | "revoke_role";

export type CommandReason =
  | "unauthenticated"
  | "mfa_required"
  | "unconfigured"
  | "forbidden"
  | "actor_not_active"
  | "self_mutation_denied"
  | "admin_change_denied"
  | "last_admin_protected"
  | "target_not_found"
  | "role_not_found"
  | "grant_not_active"
  | "invalid_status"
  | "invalid_display_name"
  | "auth_user_not_found"
  | "auth_user_ambiguous"
  | "identity_exists"
  | "self_onboarding_denied"
  | "failed";

export type CommandOutcome = { ok: true } | { ok: false; reason: CommandReason };

export const COMMAND_RPC: Record<CommandName, string> = {
  create_identity: "control_create_identity",
  set_status: "control_set_identity_status",
  grant_role: "control_grant_role",
  revoke_role: "control_revoke_role",
};

export const COMMAND_ACTION: Record<CommandName, string> = {
  create_identity: "identity.created",
  set_status: "identity.status_changed",
  grant_role: "identity.role_granted",
  revoke_role: "identity.role_revoked",
};

const CONDITIONS: Record<string, CommandReason> = {
  control_actor_not_active: "actor_not_active",
  control_permission_denied: "forbidden",
  control_self_mutation_denied: "self_mutation_denied",
  control_admin_grant_denied: "admin_change_denied",
  control_admin_revoke_denied: "admin_change_denied",
  control_last_admin_protected: "last_admin_protected",
  control_target_not_found: "target_not_found",
  control_role_not_found: "role_not_found",
  control_grant_not_active: "grant_not_active",
  control_invalid_status: "invalid_status",
  control_invalid_display_name: "invalid_display_name",
  control_auth_user_not_found: "auth_user_not_found",
  control_auth_user_ambiguous: "auth_user_ambiguous",
  control_identity_exists: "identity_exists",
  control_self_onboarding_denied: "self_onboarding_denied",
};

/** Anything unrecognised reports as a failure; a refusal never reads as success. */
export function reasonForCondition(condition: string): CommandReason {
  return CONDITIONS[condition] ?? "failed";
}

export const IDENTITY_STATUSES = ["invited", "active", "suspended", "disabled"] as const;

export function isKnownStatus(status: string): boolean {
  return (IDENTITY_STATUSES as readonly string[]).includes(status);
}

/** control_admin may only be granted or revoked with the extra permission. */
export function mayChangeRole(roleKey: string, canManage: boolean, canChangeAdmin: boolean): boolean {
  if (!canManage) return false;
  return roleKey !== "control_admin" || canChangeAdmin;
}

/** A display name the identity table will accept, checked before the round trip. */
export function isUsableDisplayName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 120;
}

/** Normalised the same way the identity table stores and uniquely indexes it. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliseEmail(email));
}
