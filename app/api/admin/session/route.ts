import { NextResponse } from "next/server";
import { hasValidOpsCredentials } from "@/lib/admin/basic-auth";
import { createOpsSession, OPS_SESSION_COOKIE } from "@/lib/admin/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!hasValidOpsCredentials(username, password)) {
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

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(OPS_SESSION_COOKIE.name, "", {
    ...cookieOptions,
    expires: new Date(0),
    maxAge: 0,
  });
  return noStore(response);
}
