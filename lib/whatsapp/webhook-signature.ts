import { createHmac, timingSafeEqual } from "node:crypto";

export type WhatsAppVerificationResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "missing_signature" | "bad_signature" };

/**
 * Server-only Meta webhook authentication, before JSON parsing.
 * Pass the original request bytes, never a parsed/re-serialized payload.
 * Authentication does not prevent replay: durable message deduplication must
 * succeed before acknowledging or processing an event. No side effects here.
 */
export function verifyWhatsAppSignature(input: {
  appSecret: string | undefined;
  signature: string | null;
  body: Uint8Array;
}): WhatsAppVerificationResult {
  if (!input.appSecret?.trim()) return { ok: false, reason: "not_configured" };
  if (!input.signature) return { ok: false, reason: "missing_signature" };

  // Validate before decoding: Buffer.from(hex) silently truncates invalid hex.
  // Reject combined headers, wrong algorithms and trailing whitespace as well.
  if (!/^sha256=[a-fA-F0-9]{64}$/.test(input.signature)) {
    return { ok: false, reason: "bad_signature" };
  }
  const expected = createHmac("sha256", input.appSecret).update(input.body).digest();
  const provided = Buffer.from(input.signature.slice(7), "hex");
  return timingSafeEqual(expected, provided)
    ? { ok: true }
    : { ok: false, reason: "bad_signature" };
}
