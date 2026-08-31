/**
 * Verificatie van Resend-webhooks (Svix-formaat).
 *
 * Zonder deze controle kan iedereen die het endpoint kent afleverstatussen
 * verzinnen. De handtekening staat over `id.timestamp.body`, dus het opnieuw
 * afspelen van een oud, geldig bericht wordt geblokkeerd door de tijdvenster-
 * controle en niet door de handtekening zelf.
 *
 * Puur en zonder dependency: alleen node:crypto, zodat dit los van een
 * netwerkaanroep testbaar is.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Svix accepteert standaard vijf minuten speling in beide richtingen. */
export const TOLERANCE_SECONDS = 5 * 60;

export type VerificationResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "missing_headers" | "stale_timestamp" | "bad_signature" };

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyResendSignature(input: {
  secret: string | undefined;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now?: Date;
}): VerificationResult {
  const secret = (input.secret ?? "").trim();
  if (!secret) return { ok: false, reason: "not_configured" };
  if (!input.id || !input.timestamp || !input.signature) {
    return { ok: false, reason: "missing_headers" };
  }

  const sentAt = Number(input.timestamp);
  if (!Number.isFinite(sentAt)) return { ok: false, reason: "stale_timestamp" };
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - sentAt) > TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  // De secret komt als "whsec_<base64>"; het base64-deel is de sleutel.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${input.id}.${input.timestamp}.${input.body}`)
    .digest("base64");

  // De header kan meerdere handtekeningen dragen ("v1,<sig> v1,<sig>") tijdens
  // een sleutelwissel. Eén treffer is genoeg.
  const provided = input.signature
    .split(" ")
    .map((part) => part.split(",", 2))
    .filter(([version]) => version === "v1")
    .map(([, value]) => value ?? "");

  return provided.some((candidate) => safeEqual(candidate, expected))
    ? { ok: true }
    : { ok: false, reason: "bad_signature" };
}

/** Resend-eventtype naar de stand in `communication_deliveries`. */
export function deliveryStatusFor(eventType: string): "delivered" | "bounced" | "complained" | null {
  if (eventType === "email.delivered") return "delivered";
  if (eventType === "email.bounced") return "bounced";
  if (eventType === "email.complained") return "complained";
  // sent/opened/clicked/delivery_delayed veranderen de eindstand niet.
  return null;
}
