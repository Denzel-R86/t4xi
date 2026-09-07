import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { recordControlAccessDecision } from "@/lib/control/audit";

export type ControlPrincipal = { userId: string; email: string | null; aal: "aal1" | "aal2" };
export type ControlAuthResult =
  | { ok: true; principal: ControlPrincipal }
  | { ok: false; reason: "unconfigured" | "unauthenticated" | "mfa_required" | "forbidden" };

async function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          values.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // A Server Component cannot always write refreshed cookies. The request
          // boundary remains fail-closed; a future session proxy can persist them.
        }
      },
    },
  });
}

/**
 * The single choke point for Control access. Every decision about an
 * identified principal is audited here, so a caller cannot obtain access
 * without producing an attributable event.
 *
 * Audit policy is "advisory" on this path: a failed audit write is reported
 * but never converts a denial into an error or a grant into a lockout. Any
 * future security-sensitive mutation uses the "required" policy instead and
 * must abort when the write fails.
 */
export async function authorizeControl(permission = "control.access"): Promise<ControlAuthResult> {
  const supabase = await serverClient();
  if (!supabase) return { ok: false, reason: "unconfigured" };

  const { data: userData, error: userError } = await supabase.auth.getUser();
  // No principal to attribute: deliberately not audited, see audit.ts.
  if (userError || !userData.user) return { ok: false, reason: "unauthenticated" };

  const authUserId = userData.user.id;
  const requestId = crypto.randomUUID();

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const aal = !assuranceError && assurance.currentLevel === "aal2" ? "aal2" : "aal1";
  if (process.env.CONTROL_REQUIRE_AAL2 !== "false" && aal !== "aal2") {
    await recordControlAccessDecision({
      authUserId, outcome: "denied", reason: "mfa_required", aal, permission, requestId,
    });
    return { ok: false, reason: "mfa_required" };
  }

  const { data: allowed, error } = await supabase.rpc("control_authorize", {
    required_permission: permission,
  });
  if (error || allowed !== true) {
    await recordControlAccessDecision({
      authUserId, outcome: "denied", reason: "forbidden", aal, permission, requestId,
    });
    return { ok: false, reason: "forbidden" };
  }

  await recordControlAccessDecision({
    authUserId, outcome: "success", aal, permission, requestId,
  });

  return {
    ok: true,
    principal: { userId: authUserId, email: userData.user.email ?? null, aal },
  };
}
