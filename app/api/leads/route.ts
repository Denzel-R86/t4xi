import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import {
  LEAD_KINDS,
  sendLeadEmail,
  type LeadField,
  type LeadKind,
} from "@/lib/notifications/lead-email";
import { normalizeLocale } from "@/lib/i18n/locale";
import {
  BUSINESS_CONTACT_TOPICS,
  PRIVATE_CONTACT_TOPICS,
} from "@/lib/contact/prefill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 12_000;
const MAX_FIELDS = 24;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const CONTACT_TOPIC_LABELS: Readonly<Record<string, string>> = {
  privateRide: "Privérit of algemene vraag",
  privateAirport: "Luchthaventransfer",
  privateEvent: "Evenement of bijzondere gelegenheid",
  privateOther: "Anders",
  businessTransport: "Zakelijk vervoer",
  businessAgreement: "Raamovereenkomst of terugkerende ritten",
  businessEvent: "Bedrijfsevenement of groepsvervoer",
  businessOther: "Andere zakelijke vraag",
};

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
  const ip = clientIp(request);
  // Beperk per IP en tel de poging voordat de body wordt ingelezen. Een caller
  // kan de limiet zo niet omzeilen door alleen de User-Agent te rouleren en ook
  // te grote payloads verbruiken budget zonder eerst serverresources te kosten.
  const limit = rateLimit(`leads:${ip}`, 5, 10 * 60_000);
  if (limit.limited) {
    return json(
      429,
      { ok: false, error: "rate_limited" },
      { "Retry-After": String(limit.retryAfterSec) }
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: "payload_too_large" });
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
  let fields = parseFields(body.fields);
  if (name.length < 2 || !EMAIL_RE.test(email) || !fields) {
    return json(400, { ok: false, error: "invalid_input" });
  }
  if (phone && phone.replace(/[^0-9+]/g, "").length < 8) {
    return json(400, { ok: false, error: "invalid_phone" });
  }

  // Contactleads hebben een strikter servercontract dan de generieke bestaande
  // leadsoorten. Browser-`required` is geen beveiliging: directe callers moeten
  // eveneens een geldig publiek/zakelijk type, onderwerp en echt bericht leveren.
  if (kind === "contact-private" || kind === "contact-business") {
    const expectedAudience = kind === "contact-business" ? "business" : "private";
    const audience = clean(body.audience, 20);
    const topic = clean(body.topic, 80);
    const companyRaw = typeof body.company === "string" ? body.company.trim() : "";
    const messageRaw = typeof body.message === "string" ? body.message.trim() : "";
    const allowedTopics: readonly string[] = kind === "contact-business"
      ? BUSINESS_CONTACT_TOPICS
      : PRIVATE_CONTACT_TOPICS;

    if (
      audience !== expectedAudience ||
      !allowedTopics.includes(topic) ||
      messageRaw.length < 10 ||
      messageRaw.length > 1_200 ||
      (kind === "contact-business" && (companyRaw.length < 2 || companyRaw.length > 160))
    ) {
      return json(400, { ok: false, error: "invalid_contact_details" });
    }

    // Stel de inhoud voor operations opnieuw samen uit de gevalideerde velden.
    // Zo kan een directe caller niet een geldige structuur meesturen maar in de
    // vrije `fields`-presentatielaag bedrijf/onderwerp/bericht weglaten of wijzigen.
    fields = [
      { label: "Naam", value: name },
      { label: "E-mailadres", value: email },
      ...(phone ? [{ label: "Telefoonnummer", value: phone }] : []),
      {
        label: "Type aanvraag",
        value: kind === "contact-business" ? "Zakelijke klant" : "Particulier",
      },
      ...(kind === "contact-business"
        ? [{ label: "Bedrijfsnaam", value: companyRaw }]
        : []),
      { label: "Onderwerp", value: CONTACT_TOPIC_LABELS[topic] ?? topic },
      { label: "Vraag", value: messageRaw },
    ];
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
