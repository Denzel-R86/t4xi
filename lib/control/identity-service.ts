import "server-only";

import { authorizeControl } from "@/lib/control/auth";
import { recordControlAuditEvent } from "@/lib/control/audit";
import {
  COMMAND_ACTION,
  isKnownStatus,
  isUsableDisplayName,
  looksLikeEmail,
  normaliseEmail,
  reasonForCondition,
  type CommandName,
  type CommandOutcome,
} from "@/lib/control/identity-commands";
import {
  callCommand,
  hasPermission,
  listGrants,
  listIdentities,
  listRoleKeys,
  type ControlGrantRow,
  type ControlIdentityRow,
} from "@/lib/control/identity-repository";

/**
 * Application service for Control identity management.
 *
 * The authorization here is for UX and route protection only. PostgreSQL
 * re-checks the actor, the permission, the target and the escalation rules
 * inside every command, and writes the required audit row in the same
 * transaction. If this layer were bypassed entirely, no mutation would
 * succeed.
 *
 * Successful mutations are audited by the command itself, atomically. Refused
 * mutations are audited here instead, deliberately: a refusal raises and rolls
 * the transaction back, which would erase an audit row written inside it, so
 * the attempt has to be recorded from outside on an advisory basis.
 */


export type IdentityOverview = {
  identities: ControlIdentityRow[];
  grants: ControlGrantRow[];
  roleKeys: string[];
  canManage: boolean;
  canChangeAdmin: boolean;
};

export async function loadIdentityOverview(): Promise<
  { ok: true; overview: IdentityOverview } | { ok: false; reason: string }
> {
  const read = await authorizeControl("identity.read");
  if (!read.ok) return { ok: false, reason: read.reason };

  // Probed without auditing: these only decide which buttons to render.
  const [canManage, canChangeAdmin] = await Promise.all([
    hasPermission("identity.manage"),
    hasPermission("identity.grant_admin"),
  ]);

  const [identities, grants, roleKeys] = await Promise.all([
    listIdentities(),
    listGrants(),
    listRoleKeys(),
  ]);

  return {
    ok: true,
    overview: { identities, grants, roleKeys, canManage, canChangeAdmin },
  };
}

async function runCommand(
  command: CommandName,
  args: Record<string, string | null>,
  auditMetadata: Record<string, string | boolean>,
): Promise<CommandOutcome> {
  // UX gate only. The command re-authorizes regardless of what happens here.
  const auth = await authorizeControl("identity.manage");
  if (!auth.ok) {
    return { ok: false, reason: auth.reason === "forbidden" ? "forbidden" : auth.reason };
  }

  const result = await callCommand(command, args);
  if (result.ok) return { ok: true };

  const reason = reasonForCondition(result.condition);
  // Advisory: a refusal must be visible, but failing to record it may not
  // change the refusal itself.
  await recordControlAuditEvent({
    principal: auth.principal,
    action: COMMAND_ACTION[command],
    resourceType: "control_identity",
    resourceId: args.target_identity_id ?? undefined,
    outcome: "denied",
    processingPurpose: "Access control and accountability",
    metadata: { ...auditMetadata, reason },
    policy: "advisory",
  });
  return { ok: false, reason };
}

export async function setIdentityStatus(identityId: string, status: string): Promise<CommandOutcome> {
  if (!isKnownStatus(status)) return { ok: false, reason: "invalid_status" };
  return runCommand(
    "set_status",
    { target_identity_id: identityId, new_status: status, correlation_id: crypto.randomUUID() },
    { requested_status: status },
  );
}

/**
 * Onboards an existing Supabase Auth account. The email never reaches an audit
 * row: PostgreSQL resolves it, stores it on the identity where it is
 * classified and retained, and audits the identity id instead.
 */
export async function createIdentity(
  email: string,
  displayName: string,
  initialRoleKey?: string,
): Promise<CommandOutcome> {
  if (!looksLikeEmail(email)) return { ok: false, reason: "auth_user_not_found" };
  if (!isUsableDisplayName(displayName)) return { ok: false, reason: "invalid_display_name" };
  return runCommand(
    "create_identity",
    {
      target_email: normaliseEmail(email),
      target_display_name: displayName.trim(),
      initial_role_key: initialRoleKey && initialRoleKey.length > 0 ? initialRoleKey : null,
      correlation_id: crypto.randomUUID(),
    },
    { initial_role: initialRoleKey ?? "none" },
  );
}

export function grantRole(identityId: string, roleKey: string): Promise<CommandOutcome> {
  return runCommand(
    "grant_role",
    { target_identity_id: identityId, target_role_key: roleKey, correlation_id: crypto.randomUUID() },
    { role_key: roleKey },
  );
}

export function revokeRole(identityId: string, roleKey: string): Promise<CommandOutcome> {
  return runCommand(
    "revoke_role",
    { target_identity_id: identityId, target_role_key: roleKey, correlation_id: crypto.randomUUID() },
    { role_key: roleKey },
  );
}
