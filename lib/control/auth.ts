import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

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

export async function authorizeControl(permission = "control.access"): Promise<ControlAuthResult> {
  const supabase = await serverClient();
  if (!supabase) return { ok: false, reason: "unconfigured" };

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { ok: false, reason: "unauthenticated" };

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const aal = !assuranceError && assurance.currentLevel === "aal2" ? "aal2" : "aal1";
  if (process.env.CONTROL_REQUIRE_AAL2 !== "false" && aal !== "aal2") {
    return { ok: false, reason: "mfa_required" };
  }

  const { data: allowed, error } = await supabase.rpc("control_authorize", {
    required_permission: permission,
  });
  if (error || allowed !== true) return { ok: false, reason: "forbidden" };

  return {
    ok: true,
    principal: { userId: userData.user.id, email: userData.user.email ?? null, aal },
  };
}
