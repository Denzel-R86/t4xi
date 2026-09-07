/**
 * Single source of truth for the T4XI Control surface.
 *
 * The edge is default-deny: a path under /admin that is not registered here
 * gets a 404, exactly like the closed /dashboard routes. Registering a route
 * is therefore a deliberate act, and it is the moment to also give the page
 * its own authorizeControl() check — the edge is the first barrier, never the
 * only one.
 */
export type ControlRoute = {
  /** Exact path, without locale prefix. Control is deliberately non-localized. */
  path: string;
  /**
   * true  → reachable without a session cookie (the sign-in surface itself).
   * false → the edge already requires a Supabase session cookie; the page
   *         still performs the full identity, AAL2 and permission check.
   */
  allowsAnonymous: boolean;
};

export const CONTROL_ROUTES: readonly ControlRoute[] = [
  { path: "/admin", allowsAnonymous: true },
] as const;

/** A Supabase SSR session cookie, possibly chunked as `.0`, `.1`, … */
const SESSION_COOKIE = /^sb-[a-z0-9-]+-auth-token(\.\d+)?$/i;

export function isControlPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function findControlRoute(pathname: string): ControlRoute | undefined {
  return CONTROL_ROUTES.find((route) => route.path === pathname);
}

export function hasSessionCookie(cookieNames: readonly string[]): boolean {
  return cookieNames.some((name) => SESSION_COOKIE.test(name));
}

/**
 * Edge decision for a Control path. Deliberately cheap: cookie presence is a
 * pre-filter, not authentication. It keeps unauthenticated visitors from
 * confirming that a Control subroute exists; the server component decides.
 */
export function controlEdgeDecision(
  pathname: string,
  cookieNames: readonly string[],
): "allow" | "not_found" {
  const route = findControlRoute(pathname);
  if (!route) return "not_found";
  if (route.allowsAnonymous) return "allow";
  return hasSessionCookie(cookieNames) ? "allow" : "not_found";
}
