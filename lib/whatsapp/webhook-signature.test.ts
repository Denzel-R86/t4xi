import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { verifyWhatsAppSignature } from "@/lib/whatsapp/webhook-signature";

const appSecret = "local-whatsapp-test-secret";
const body = Buffer.from('{ "text": "Rit naar café 🚕" }\n');
const signature = `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
const valid = { appSecret, body, signature };

test("Meta signature accepts exact UTF-8 request bytes", () => {
  assert.deepEqual(verifyWhatsAppSignature(valid), { ok: true });
});

test("HMAC matches the independent RFC 4231 SHA-256 test vector", () => {
  assert.deepEqual(verifyWhatsAppSignature({
    appSecret: "Jefe",
    body: Buffer.from("what do ya want for nothing?"),
    signature: "sha256=5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
  }), { ok: true });
});

test("missing configuration and missing signatures fail closed", () => {
  for (const secret of [undefined, "", "  "]) {
    assert.deepEqual(verifyWhatsAppSignature({ ...valid, appSecret: secret }), {
      ok: false, reason: "not_configured",
    });
  }
  for (const value of [null, ""]) {
    assert.deepEqual(verifyWhatsAppSignature({ ...valid, signature: value }), {
      ok: false, reason: "missing_signature",
    });
  }
});

test("changed bytes, JSON normalization and wrong app secret are rejected", () => {
  for (const changed of [Buffer.from("tampered"), Buffer.from(JSON.stringify(JSON.parse(body.toString()))), Buffer.alloc(0)]) {
    assert.deepEqual(verifyWhatsAppSignature({ ...valid, body: changed }), {
      ok: false, reason: "bad_signature",
    });
  }
  assert.deepEqual(verifyWhatsAppSignature({ ...valid, appSecret: "other-app" }), {
    ok: false, reason: "bad_signature",
  });
});

test("malformed, truncated, combined and wrong-algorithm headers are rejected", () => {
  for (const value of [
    "sha256=", signature.slice(0, -1), `${signature}0`, `${signature}gg`,
    `sha256=${"z".repeat(64)}`, signature.replace("sha256", "sha1"),
    `${signature}, ${signature}`, `${signature}\n`, ` ${signature}`,
  ]) {
    assert.deepEqual(verifyWhatsAppSignature({ ...valid, signature: value }), {
      ok: false, reason: "bad_signature",
    }, value);
  }
});

test("a well-formed but incorrect digest is rejected", () => {
  assert.deepEqual(verifyWhatsAppSignature({ ...valid, signature: `sha256=${"0".repeat(64)}` }), {
    ok: false, reason: "bad_signature",
  });
});

test("authentication alone accepts a replay; the future inbox must deduplicate", () => {
  assert.deepEqual(verifyWhatsAppSignature(valid), { ok: true });
  assert.deepEqual(verifyWhatsAppSignature(valid), { ok: true });
});
