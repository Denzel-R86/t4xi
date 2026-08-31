import assert from "node:assert/strict";
import { test } from "node:test";
import { renderLeadAck, renderLeadEmail, type LeadEmailData } from "@/lib/notifications/lead-email";

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

test("de ontvangstbevestiging spreekt de taal van de aanvrager", () => {
  const nl = renderLeadAck(base);
  const en = renderLeadAck({ ...base, locale: "en" });
  assert.equal(nl.subject, "We hebben je aanvraag ontvangen — T4XI");
  assert.equal(en.subject, "We received your request — T4XI");
  assert.match(nl.text, /binnen één werkdag/);
  assert.match(en.text, /within one business day/);
});

test("de ontvangstbevestiging escapet de naam van de aanvrager", () => {
  const ack = renderLeadAck({ ...base, name: '<img src=x onerror="alert(1)">' });
  assert.doesNotMatch(ack.html, /<img src=x/);
  assert.match(ack.html, /&lt;img src=x/);
});
