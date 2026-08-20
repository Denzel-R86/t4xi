import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderLeadEmail, sendLeadEmail, type LeadEmailData } from "@/lib/notifications/lead-email";

const base: LeadEmailData = {
  leadId: "lead-test-1",
  kind: "membership",
  locale: "nl",
  name: "Sam Tester",
  email: "sam@example.com",
  phone: "+31 6 12 34 56 78",
  fields: [
    { label: "Naam", value: "Sam Tester" },
    { label: "Pakket", value: "Business" },
  ],
};
const source = readFileSync("lib/notifications/lead-email.ts", "utf8");

test("leadmail rendert het juiste onderwerp en escaped alle klantinvoer", () => {
  const injection = '<img src=x onerror="alert(1)"> & test';
  const rendered = renderLeadEmail({
    ...base,
    fields: [{ label: injection, value: injection }],
  });
  assert.equal(rendered.subject, "Nieuwe aanvraag Airport Membership");
  assert.doesNotMatch(rendered.html, /<img src=x/);
  assert.match(rendered.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; test/);
});

test("leadmail gebruikt reply_to en een idempotency key", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.RESEND_API_KEY;
  const requests: Array<{
    headers: Headers;
    body: Record<string, unknown>;
    signal: AbortSignal | null;
  }> = [];
  process.env.RESEND_API_KEY = "re_test_only";
  globalThis.fetch = async (_input, init) => {
    requests.push({
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
      signal: init?.signal ?? null,
    });
    return new Response("{}", { status: 200 });
  };
  try {
    assert.deepEqual(await sendLeadEmail(base), { sent: true });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
  }
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.reply_to, base.email);
  assert.equal(requests[0].headers.get("Idempotency-Key"), "lead/lead-test-1");
  assert.ok(requests[0].signal instanceof AbortSignal);
});

test("leadmail begrenst de Resend-call met een harde timeout", () => {
  assert.match(source, /const RESEND_TIMEOUT_MS = 8_000/);
  assert.match(source, /signal:\s*AbortSignal\.timeout\(RESEND_TIMEOUT_MS\)/);
  assert.match(source, /error\.name === "TimeoutError"/);
});

test("leadmail faalt gesloten wanneer de provider-timeout afloopt", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_timeout_test_only";
  globalThis.fetch = async () => {
    throw new DOMException("Resend timeout", "TimeoutError");
  };
  try {
    assert.deepEqual(await sendLeadEmail(base), { sent: false, error: "timeout" });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
  }
});
