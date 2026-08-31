import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  TOLERANCE_SECONDS,
  deliveryStatusFor,
  verifyResendSignature,
} from "@/lib/communication/webhook-signature";

const SECRET = `whsec_${Buffer.from("t4xi-webhook-test-secret").toString("base64")}`;
const BODY = JSON.stringify({ type: "email.delivered", data: { email_id: "msg_1" } });
const NOW = new Date("2026-08-30T12:00:00Z");
const TIMESTAMP = String(Math.floor(NOW.getTime() / 1000));

function sign(body: string, id: string, timestamp: string, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

const valid = {
  secret: SECRET,
  id: "msg_1",
  timestamp: TIMESTAMP,
  signature: sign(BODY, "msg_1", TIMESTAMP),
  body: BODY,
  now: NOW,
};

test("een correct ondertekend bericht wordt geaccepteerd", () => {
  assert.deepEqual(verifyResendSignature(valid), { ok: true });
});

test("zonder secret wordt niets geaccepteerd", () => {
  assert.deepEqual(verifyResendSignature({ ...valid, secret: undefined }), {
    ok: false,
    reason: "not_configured",
  });
});

test("een gewijzigde body ongeldigt de handtekening", () => {
  const tampered = JSON.stringify({ type: "email.delivered", data: { email_id: "msg_999" } });
  assert.deepEqual(verifyResendSignature({ ...valid, body: tampered }), {
    ok: false,
    reason: "bad_signature",
  });
});

test("een handtekening van een andere sleutel wordt geweigerd", () => {
  const other = `whsec_${Buffer.from("een-heel-ander-secret").toString("base64")}`;
  assert.deepEqual(
    verifyResendSignature({ ...valid, signature: sign(BODY, "msg_1", TIMESTAMP, other) }),
    { ok: false, reason: "bad_signature" }
  );
});

test("een oud bericht wordt niet opnieuw geaccepteerd", () => {
  // Zelfde geldige handtekening, maar buiten het tijdvenster: replay-bescherming.
  const later = new Date(NOW.getTime() + (TOLERANCE_SECONDS + 60) * 1000);
  assert.deepEqual(verifyResendSignature({ ...valid, now: later }), {
    ok: false,
    reason: "stale_timestamp",
  });
});

test("ontbrekende headers leveren geen acceptatie op", () => {
  assert.deepEqual(verifyResendSignature({ ...valid, id: null }), {
    ok: false,
    reason: "missing_headers",
  });
  assert.deepEqual(verifyResendSignature({ ...valid, signature: null }), {
    ok: false,
    reason: "missing_headers",
  });
});

test("meerdere handtekeningen in één header: één treffer is genoeg", () => {
  const other = `whsec_${Buffer.from("roterende-sleutel").toString("base64")}`;
  const combined = `${sign(BODY, "msg_1", TIMESTAMP, other)} ${sign(BODY, "msg_1", TIMESTAMP)}`;
  assert.deepEqual(verifyResendSignature({ ...valid, signature: combined }), { ok: true });
});

test("alleen eindstanden veranderen de afleverstatus", () => {
  assert.equal(deliveryStatusFor("email.delivered"), "delivered");
  assert.equal(deliveryStatusFor("email.bounced"), "bounced");
  assert.equal(deliveryStatusFor("email.complained"), "complained");
  assert.equal(deliveryStatusFor("email.sent"), null);
  assert.equal(deliveryStatusFor("email.opened"), null);
  assert.equal(deliveryStatusFor("email.delivery_delayed"), null);
});
