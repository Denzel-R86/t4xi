import assert from "node:assert/strict";
import { test } from "node:test";
import { renderBookingEmails, sendBookingEmails, type BookingEmailData } from "@/lib/notifications/booking-email";

const base: BookingEmailData = {
  bookingRef: "T4XI-TEST-1001",
  rideType: "enkel",
  pickup: "Utrecht Centraal",
  dropoff: "Schiphol Airport",
  date: "2026-09-18",
  time: "09:30",
  vehicle: "Tesla Model Y",
  persons: 2,
  luggage: "1 koffer",
  flightNumber: null,
  flightDirection: null,
  price: 89.5,
  currency: "EUR",
  quoteOnRequest: false,
  returnApplied: false,
  customerName: "Sam Tester",
  customerPhone: "+31 6 12 34 56 78",
  customerEmail: "sam@example.com",
  locale: "nl",
};

test("NL en EN hebben hun eigen subject en heading", () => {
  const nl = renderBookingEmails(base);
  const en = renderBookingEmails({ ...base, locale: "en" });
  assert.equal(nl.customerSubject, "Je boeking bij T4XI — T4XI-TEST-1001");
  assert.match(nl.customerHtml, />Bedankt voor je boeking</);
  assert.equal(en.customerSubject, "Your T4XI booking — T4XI-TEST-1001");
  assert.match(en.customerHtml, />Thank you for your booking</);
});

test("officieel monogram staat zelfstandig en gebruikt een publieke HTTPS-asset", () => {
  const html = renderBookingEmails(base).customerHtml;
  assert.match(html, /src="https:\/\/www\.t4xi\.nl\/t4xi-monogram-navy\.png"/);
  assert.match(html, /width="52" height="51" alt="T4XI"/);
  assert.doesNotMatch(html, />T4XI<\/td>/);
  assert.doesNotMatch(html, /Users\/|file:\/\//);
});

test("boekingsbevestiging gebruikt dezelfde premium designtaal als de factuurmail", () => {
  const html = renderBookingEmails(base).customerHtml;
  assert.match(html, /max-width:620px/);
  assert.match(html, /font-family:Inter,-apple-system/);
  assert.match(html, /font-family:Outfit,'Helvetica Neue'/);
  assert.match(html, /border-radius:18px 18px 0 0/);
  assert.match(html, /border-bottom:3px solid #28313B/);
  assert.match(html, />\s*Boeking<br><span[^>]*>T4XI-TEST-1001<\/span>/);
  assert.match(html, />Vertrek<\/div>[\s\S]*Utrecht Centraal/);
  assert.match(html, />Bestemming<\/div>[\s\S]*Schiphol Airport/);
  assert.match(html, />Boekingsbevestiging · bijgevoegd<\/div>/);
  assert.match(html, />ARRIVE WITH CONFIDENCE\.<\/span>/);
});

test("prijs wordt gelokaliseerd en retour staat eenmaal als ritsoort, niet achter het bedrag", () => {
  const single = renderBookingEmails(base).customerHtml;
  const returned = renderBookingEmails({ ...base, rideType: "retour", returnApplied: true }).customerHtml;
  assert.match(single, /\u20ac\s?89,50/);
  assert.doesNotMatch(single, /\(retour\)/);
  assert.match(returned, /\u20ac\s?89,50/);
  assert.doesNotMatch(returned, /\(retour\)/);
  assert.equal(returned.match(/retour/gi)?.length, 1);
});

test("offerte op aanvraag wordt in de taal van de klant getoond", () => {
  const nl = renderBookingEmails({ ...base, price: null, quoteOnRequest: true }).customerHtml;
  const en = renderBookingEmails({ ...base, locale: "en", price: null, quoteOnRequest: true }).customerHtml;
  assert.match(nl, /Offerte op aanvraag/);
  assert.match(en, /Quote on request/);
});

test("klantmail bevat essentiële gegevens, maar niet het voorlopig voertuig", () => {
  const nl = renderBookingEmails({ ...base, flightNumber: "KL1008", flightDirection: "arrival" }).customerHtml;
  assert.match(nl, />Passagiers<\/td>[\s\S]*?>2<\/td>/);
  assert.match(nl, />Bagage<\/td>[\s\S]*?>1 koffer<\/td>/);
  assert.doesNotMatch(nl, />Voertuig<\/td>/);
  assert.match(nl, />Vlucht<\/td>[\s\S]*?>KL1008<\/td>/);

  const en = renderBookingEmails({ ...base, locale: "en", flightNumber: null }).customerHtml;
  assert.match(en, />Passengers<\/td>/);
  assert.match(en, />Luggage<\/td>/);
  assert.doesNotMatch(en, />Vehicle<\/td>/);
  assert.doesNotMatch(en, />Flight<\/td>/);
});

test("retourmoment en retourvlucht staan in klant- en operationsmail", () => {
  const rendered = renderBookingEmails({
    ...base,
    rideType: "retour",
    returnApplied: true,
    returnDate: "2026-09-20",
    returnTime: "18:45",
    returnFlightNumber: "KL1235",
  });
  assert.match(rendered.customerHtml, />Retourdatum<\/td>[\s\S]*20 september 2026/);
  assert.match(rendered.customerHtml, />Retourtijd<\/td>[\s\S]*18:45/);
  assert.match(rendered.customerHtml, />Retourvlucht<\/td>[\s\S]*KL1235/);
  assert.match(rendered.opsHtml, />Retour<\/td>[\s\S]*20 september 2026 om 18:45/);
  assert.match(rendered.opsHtml, />Retourvlucht<\/td>[\s\S]*KL1235/);
});

test("klantinvoer wordt in klant- en ops-HTML ge-escaped", () => {
  const injection = '<img src=x onerror="alert(1)"> & \'test\'';
  const rendered = renderBookingEmails({
    ...base,
    bookingRef: injection,
    pickup: injection,
    dropoff: injection,
    customerName: injection,
    customerPhone: injection,
    customerEmail: injection,
    luggage: injection,
    vehicle: injection,
    flightNumber: injection,
  });
  for (const html of [rendered.customerHtml, rendered.opsHtml]) {
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &#39;test&#39;/);
  }
});

test("dispatch-actie verschijnt uitsluitend bij een aankomende vlucht", () => {
  const arrival = renderBookingEmails({ ...base, flightDirection: "arrival", flightNumber: "KL1008" }).opsHtml;
  const departure = renderBookingEmails({ ...base, flightDirection: "departure", flightNumber: "KL1008" }).opsHtml;
  const none = renderBookingEmails({ ...base, flightDirection: null, flightNumber: null }).opsHtml;
  assert.match(arrival, /Actie dispatch/);
  assert.match(arrival, /Controleer de aankomststatus/);
  assert.doesNotMatch(departure, /Actie dispatch/);
  assert.doesNotMatch(none, /Actie dispatch/);
});

test("klantdispatch bevat altijd een PDF-boekingsbevestiging en reply_to blijft snake_case", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.RESEND_API_KEY;
  const requests: Array<{ headers: Headers; body: Record<string, unknown> }> = [];
  process.env.RESEND_API_KEY = "re_test_only";
  globalThis.fetch = async (_input, init) => {
    requests.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return new Response("{}", { status: 200 });
  };
  try {
    assert.deepEqual(await sendBookingEmails(base), { sent: true });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousKey;
  }
  assert.equal(requests.length, 2);
  const customer = requests.find((request) => request.body.to === base.customerEmail);
  assert.ok(customer);
  assert.equal(customer.body.reply_to, "booking@t4xi.nl");
  assert.ok(!("replyTo" in customer.body));
  const attachments = customer.body.attachments as Array<{ filename: string; content: string }>;
  assert.equal(attachments[0].filename, `boekingsbevestiging-${base.bookingRef}.pdf`);
  assert.match(Buffer.from(attachments[0].content, "base64").toString("latin1"), /^%PDF-1\.4/);
  assert.equal(requests.find((request) => request.body.to !== base.customerEmail)?.body.attachments, undefined);
  assert.equal(customer.headers.get("Idempotency-Key"), `booking-customer/${base.bookingRef}`);
});
