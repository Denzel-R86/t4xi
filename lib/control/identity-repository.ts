import "server-only";

import { controlServerClient } from "@/lib/control/auth";
import { COMMAND_RPC, type CommandName } from "@/lib/control/identity-commands";

/**
 * Data access for Control identity management. Everything here runs on the
 * caller's own session, so RLS decides what is readable, and every write goes
 * through a command RPC that re-authorizes inside PostgreSQL. There is no
 * service role on this path.
 */

export type ControlIdentityRow = {
  id: string;
  display_name: string;
  email: string;
  status: string;
  last_authenticated_at: string | null;
  disabled_at: string | null;
  created_at: string;
};

export type ControlGrantRow = {
  identity_id: string;
  role_key: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

export async function listIdentities(): Promise<ControlIdentityRow[]> {
  const supabase = await controlServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("control_identities")
    .select("id, display_name, email, status, last_authenticated_at, disabled_at, created_at")
    .order("display_name", { ascending: true });
  if (error || !data) return [];
  return data as ControlIdentityRow[];
}

/** Active and revoked grants, so the UI can show history without a second call. */
export async function listGrants(): Promise<ControlGrantRow[]> {
  const supabase = await controlServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("control_identity_roles")
    .select("identity_id, granted_at, expires_at, revoked_at, control_roles(role_key)");
  if (error || !data) return [];
  return (data as unknown[]).map((row) => {
    const record = row as Record<string, unknown>;
    const role = record.control_roles as { role_key?: string } | null;
    return {
      identity_id: String(record.identity_id),
      role_key: role?.role_key ?? "onbekend",
      granted_at: String(record.granted_at),
      expires_at: (record.expires_at as string | null) ?? null,
      revoked_at: (record.revoked_at as string | null) ?? null,
    };
  });
}

export async function listRoleKeys(): Promise<string[]> {
  const supabase = await controlServerClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("control_roles").select("role_key").order("role_key");
  if (error || !data) return [];
  return (data as { role_key: string }[]).map((row) => row.role_key);
}

/**
 * A non-auditing permission probe, for deciding which actions to offer in the
 * UI. Access *decisions* are audited by authorizeControl; asking "may I show
 * this button" is not a decision and must not fill the audit trail.
 */
export async function hasPermission(permission: string): Promise<boolean> {
  const supabase = await controlServerClient();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("control_authorize", {
    required_permission: permission,
  });
  return !error && data === true;
}

/**
 * Calls a command RPC. The raised condition name is returned verbatim so the
 * service layer can map it; nothing here decides whether the call was allowed.
 */
export async function callCommand(
  command: CommandName,
  args: Record<string, string | null>,
): Promise<{ ok: true } | { ok: false; condition: string }> {
  const supabase = await controlServerClient();
  if (!supabase) return { ok: false, condition: "unconfigured" };
  const { error } = await supabase.rpc(COMMAND_RPC[command], args);
  if (!error) return { ok: true };
  const match = /control_[a-z_]+/.exec(error.message ?? "");
  return { ok: false, condition: match ? match[0] : "control_command_failed" };
}
