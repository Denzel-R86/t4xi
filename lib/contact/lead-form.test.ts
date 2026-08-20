import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { POST as submitLead } from "@/app/api/leads/route";
import { LEAD_KINDS, renderLeadEmail } from "@/lib/notifications/lead-email";

const formSource = readFileSync("components/contact/ContactLeadForm.tsx", "utf8");
const pageSource = readFileSync("app/[locale]/contact/page.tsx", "utf8");
const routeSource = readFileSync("app/api/leads/route.ts", "utf8");
const nl = JSON.parse(readFileSync("messages/nl.json", "utf8"));
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));

let requestSequence = 0;

function request(
  body: Record<string, unknown>,
  ip = `192.0.2.${++requestSequence}`,
  userAgent = "contact-lead-contract-test",
): Request {
  return new Request("https://www.t4xi.nl/api/leads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
      "user-agent": userAgent,
    },
    body: JSON.stringify(body),
  });
}

function validBody(kind: "contact-private" | "contact-business") {
  const business = kind === "contact-business";
  return {
    kind,
    audience: business ? "business" : "private",
    locale: "nl",
    name: "Sam Tester",
    email: "sam@example.com",
    phone: "+31 6 12 34 56 78",
    company: business ? "Voorbeeld B.V." : "",
    topic: business ? "businessTransport" : "privateAirport",
    message: '<img src=x onerror="alert(1)"> & vraag met voldoende lengte',
    website: "",
    fields: [
      { label: "Naam", value: "Sam Tester" },
      { label: "Onderwerp", value: "Zakelijk vervoer" },
      { label: "Uw vraag", value: '<img src=x onerror="alert(1)"> & vraag' },
    ],
  };
}

async function withFakeMailProvider(
  run: (requests: Array<{ input: string; headers: Headers; body: Record<string, unknown> }>) => Promise<void>
) {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.RESEND_API_KEY;
  const requests: Array<{ input: string; headers: Headers; body: Record<string, unknown> }> = [];
  process.env.RESEND_API_KEY = "re_contact_test_only";
  globalThis.fetch = async (input, init) => {
    requests.push({
      input: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return new Response("{}", { status: 200 });
  };
  try {
    await run(requests);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
  }
}

test("contact-API accepteert beide expliciete leadsoorten en escaped klantinvoer", async () => {
  assert.ok(LEAD_KINDS.includes("contact-private"));
  assert.ok(LEAD_KINDS.includes("contact-business"));

  await withFakeMailProvider(async (requests) => {
    const response = await submitLead(request(validBody("contact-business")));
    assert.equal(response.status, 201);
    assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.match(payload.leadId, /^[0-9a-f-]{36}$/);

    assert.equal(requests.length, 1);
    assert.equal(requests[0].input, "https://api.resend.com/emails");
    assert.equal(requests[0].body.subject, "Nieuwe zakelijke contactaanvraag");
    assert.equal(requests[0].body.reply_to, "sam@example.com");
    const html = String(requests[0].body.html);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; vraag/);
    assert.match(requests[0].headers.get("idempotency-key") ?? "", /^lead\/[0-9a-f-]{36}$/);
  });

  assert.equal(
    renderLeadEmail({
      leadId: "private-test",
      kind: "contact-private",
      locale: "en",
      name: "Sam",
      email: "sam@example.com",
      phone: "",
      fields: [{ label: "Request", value: "Airport transfer" }],
    }).subject,
    "Nieuwe particuliere contactaanvraag"
  );
});

test("contact-API weigert onbekende soorten en accepteert een honeypot stil zonder mail", async () => {
  await withFakeMailProvider(async (requests) => {
    const invalid = await submitLead(request({ ...validBody("contact-private"), kind: "contact-admin" }));
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { ok: false, error: "invalid_kind" });

    const bot = await submitLead(request({ ...validBody("contact-private"), website: "spam.example" }));
    assert.equal(bot.status, 200);
    assert.deepEqual(await bot.json(), { ok: true });
    assert.equal(requests.length, 0);
  });
});

test("contact-API dwingt bedrijf, audience, onderwerp en bericht server-side af", async () => {
  const invalidBodies = [
    { ...validBody("contact-business"), company: "" },
    { ...validBody("contact-business"), audience: "private" },
    { ...validBody("contact-business"), topic: "privateAirport" },
    { ...validBody("contact-business"), message: "te kort" },
    { ...validBody("contact-private"), topic: "businessTransport" },
    { ...validBody("contact-private"), message: "x".repeat(1_201) },
  ];

  await withFakeMailProvider(async (requests) => {
    for (const body of invalidBodies) {
      const response = await submitLead(request(body));
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        ok: false,
        error: "invalid_contact_details",
      });
    }
    assert.equal(requests.length, 0);
  });
});

test("contact-API begrenst per IP voordat de request-body wordt gelezen", () => {
  assert.match(routeSource, /rateLimit\(`leads:\$\{ip\}`, 5, 10 \* 60_000\)/);
  assert.doesNotMatch(routeSource, /rateLimit\(`leads:\$\{ip\}\|\$\{ua\}`/);
  const limitPosition = routeSource.indexOf("const limit = rateLimit");
  const bodyReadPosition = routeSource.indexOf("const raw = await request.text()");
  assert.ok(limitPosition >= 0, "lead-rate-limit ontbreekt");
  assert.ok(bodyReadPosition > limitPosition, "rate-limit moet vóór request.text() staan");
  assert.match(routeSource, /"Retry-After"/);
  assert.match(routeSource, /clean\(body\.website, 200\)/);
});

test("contact-API laat User-Agent-rotatie de IP-limiet niet omzeilen", async () => {
  const ip = "198.18.0.41";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await submitLead(request({}, ip, `rotating-agent-${attempt}`));
    assert.equal(response.status, 400);
  }

  const limited = await submitLead(request({}, ip, "rotating-agent-final"));
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { ok: false, error: "rate_limited" });
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
});

test("contact-API telt ook te grote payloads mee voor de IP-limiet", async () => {
  const ip = "198.18.0.42";
  const oversized = { padding: "x".repeat(13_000) };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await submitLead(request(oversized, ip));
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { ok: false, error: "payload_too_large" });
  }

  const limited = await submitLead(request({}, ip));
  assert.equal(limited.status, 429);
});

test("contactformulier staat op NL en EN en gebruikt één volledige vertaalset", () => {
  assert.match(pageSource, /import ContactLeadForm/);
  assert.match(pageSource, /<ContactLeadForm[\s\S]*?initialAudience=\{prefill\.audience\}[\s\S]*?initialTopic=\{prefill\.topic\}[\s\S]*?\/>/);
  assert.match(formSource, /useTranslations\("contact\.form"\)/);
  assert.match(formSource, /fetch\("\/api\/leads"/);
  assert.match(formSource, /"contact-business" : "contact-private"/);

  const expectedKeys = [
    "kicker", "title", "intro", "responseTitle", "responseText", "requiredNote",
    "audienceLegend", "privateOption", "businessOption", "nameLabel", "phoneLabel",
    "emailLabel", "companyLabel", "topicLabel", "topicPlaceholder", "messageLabel",
    "messagePlaceholder", "submit", "sending", "success", "error", "emailFallback",
    "whatsappFallback", "privateMailSubject", "businessMailSubject", "privacyNote",
    "privacyLink", "honeypot",
  ];
  const expectedTopics = [
    "privateRide", "privateAirport", "privateEvent", "privateOther",
    "businessTransport", "businessAgreement", "businessEvent", "businessOther",
  ];

  for (const messages of [nl, en]) {
    for (const key of expectedKeys) {
      assert.equal(typeof messages.contact.form[key], "string", `contact.form.${key} ontbreekt`);
      assert.ok(messages.contact.form[key].length > 0, `contact.form.${key} is leeg`);
    }
    for (const key of expectedTopics) {
      assert.equal(typeof messages.contact.form.topics[key], "string", `contact.form.topics.${key} ontbreekt`);
    }
  }

  assert.equal(nl.contact.form.privateOption, "Particulier");
  assert.equal(en.contact.form.privateOption, "Private customer");
  assert.equal(nl.contact.form.businessOption, "Zakelijke klant");
  assert.equal(en.contact.form.businessOption, "Business customer");
});

test("contactformulier houdt labels, statusmeldingen, honeypot en veilige fallbacks toegankelijk", () => {
  assert.match(formSource, /<fieldset/);
  assert.match(formSource, /<legend/);
  assert.match(formSource, /htmlFor="contact-name"/);
  assert.match(formSource, /htmlFor="contact-email"/);
  assert.match(formSource, /htmlFor="contact-message"/);
  assert.match(formSource, /aria-live="polite"/);
  assert.match(formSource, /role="status"/);
  assert.match(formSource, /role="alert"/);
  assert.match(formSource, /name="website"[\s\S]*?tabIndex=\{-1\}[\s\S]*?autoComplete="off"/);
  assert.match(formSource, /target="_blank"[\s\S]*?rel="noopener noreferrer"/);
  assert.match(formSource, /mailtoHref/);
  assert.match(formSource, /whatsappHref/);
  assert.match(formSource, /<Link href="\/privacy"/);
});
