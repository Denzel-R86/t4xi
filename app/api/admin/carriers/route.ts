import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAuthorizedAdminRequest } from "@/lib/admin/basic-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export async function POST(request: Request) {
  if (!(await isAuthorizedAdminRequest(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const name = normalizeName(body?.name);
  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }

  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data, error } = await supabase
    .from("executing_carriers")
    .insert({ name })
    .select("id, name, active, onboarding_completed_at")
    .single();

  if (error?.code === "23505") {
    return NextResponse.json({ error: "already_exists" }, { status: 409 });
  }
  if (error || !data) {
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  return NextResponse.json({ carrier: data }, { status: 201 });
}
