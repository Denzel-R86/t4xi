import { NextResponse } from "next/server";
import { hasValidOpsCredentials } from "@/lib/admin/basic-auth";
import { checkOpsLogin, recordOpsLoginFailure } from "@/lib/admin/login-throttle";
import { createOpsSession, OPS_SESSION_COOKIE } from "@/lib/admin/session";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { isSameOriginRequest } from "@/lib/security/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};

/**
 * Ops-login (F-39). Volgorde: Origin-check → pogingenlimiet per IP → lockout per
 * IP en gebruikersnaam → wachtwoordcheck. Alle limieten zijn in-memory per warme
 * instance (lib/security/rate-limit.ts, F-37 / besluit B6): op Vercel geen harde
 * limiet over instances of cold starts heen.
 */
const LOGIN_RATE_MAX = 10;
const LOGIN_RATE_WINDOW_MS = 60_000;

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "no-store");
  return response;
}

function forbiddenOrigin(): NextResponse {
  return noStore(NextResponse.json({ error: "forbidden_origin" }, { status: 403 }));
}

/** Eén 429-vorm voor IP-limiet en lockout: verraadt niet welke van de twee, noch of de naam bestaat. */
function tooManyAttempts(retryAfterSec: number): NextResponse {
  const response = NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  response.headers.set("Retry-After", String(retryAfterSec));
  return noStore(response);
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();

  const ip = clientIp(request);
  const rl = rateLimit(`ops-login:${ip}`, LOGIN_RATE_MAX, LOGIN_RATE_WINDOW_MS);
  if (rl.limited) return tooManyAttempts(rl.retryAfterSec);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const gate = checkOpsLogin(ip, username);
  if (!gate.allowed) return tooManyAttempts(gate.retryAfterSec);

  if (!hasValidOpsCredentials(username, password)) {
    recordOpsLoginFailure(ip, username);
    return noStore(NextResponse.json({ error: "invalid_credentials" }, { status: 401 }));
  }

  const session = await createOpsSession();
  if (!session) {
    return noStore(NextResponse.json({ error: "unavailable" }, { status: 503 }));
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(OPS_SESSION_COOKIE.name, session, {
    ...cookieOptions,
    maxAge: OPS_SESSION_COOKIE.maxAge,
  });
  return noStore(response);
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return forbiddenOrigin();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(OPS_SESSION_COOKIE.name, "", {
    ...cookieOptions,
    expires: new Date(0),
    maxAge: 0,
  });
  return noStore(response);
}
