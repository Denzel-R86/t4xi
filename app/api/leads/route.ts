import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import {
  LEAD_KINDS,
  sendLeadEmail,
  type LeadField,
  type LeadKind,
} from "@/lib/notifications/lead-email";
import { normalizeLocale } from "@/lib/i18n/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 12_000;
const MAX_FIELDS = 24;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function json(status: number, payload: Record<string, unknown>, extraHeaders?: Record<string, string>) {
  return NextResponse.json(payload, {
    status,
    headers: { ...NO_STORE, ...extraHeaders },
  });
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseFields(value: unknown): LeadField[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FIELDS) return null;
  const fields: LeadField[] = [];
  for (const field of value) {
    if (!field || typeof field !== "object" || Array.isArray(field)) return null;
    const item = field as Record<string, unknown>;
    const label = clean(item.label, 80);
    const fieldValue = clean(item.value, 1_500);
    if (!label || !fieldValue) return null;
    fields.push({ label, value: fieldValue });
  }
  return fields;
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: "payload_too_large" });
  }

  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? "unknown";
  const limit = rateLimit(`leads:${ip}|${ua}`, 5, 10 * 60_000);
  if (limit.limited) {
    return json(
      429,
      { ok: false, error: "rate_limited" },
      { "Retry-After": String(limit.retryAfterSec) }
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: "invalid_input" });
  }

  // Bots krijgen een neutrale success zonder mail; zo leren ze de val niet omzeilen.
  if (clean(body.website, 200)) {
    return json(200, { ok: true });
  }

  const kind = clean(body.kind, 30) as LeadKind;
  if (!LEAD_KINDS.includes(kind)) {
    return json(400, { ok: false, error: "invalid_kind" });
  }

  const name = clean(body.name, 120);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 60);
  const fields = parseFields(body.fields);
  if (name.length < 2 || !EMAIL_RE.test(email) || !fields) {
    return json(400, { ok: false, error: "invalid_input" });
  }
  if (phone && phone.replace(/[^0-9+]/g, "").length < 8) {
    return json(400, { ok: false, error: "invalid_phone" });
  }

  const leadId = crypto.randomUUID();
  const result = await sendLeadEmail({
    leadId,
    kind,
    locale: normalizeLocale(body.locale),
    name,
    email,
    phone,
    fields,
  });
  if (!result.sent) {
    return json(503, { ok: false, error: "delivery_unavailable" });
  }

  return json(201, { ok: true, leadId });
}
