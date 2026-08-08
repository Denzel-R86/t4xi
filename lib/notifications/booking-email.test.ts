import assert from "node:assert/strict";
import { test } from "node:test";
import { renderBookingEmails, type BookingEmailData } from "@/lib/notifications/booking-email";

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
  assert.match(html, /src="https:\/\/t4xi\.nl\/t4xi-monogram-navy\.png"/);
  assert.match(html, /width="64" height="63" alt="T4XI"/);
  assert.doesNotMatch(html, />T4XI<\/td>/);
  assert.doesNotMatch(html, /Users\/|file:\/\//);
});

test("prijs wordt gelokaliseerd en retour wordt alleen toegepast indien aangegeven", () => {
  const single = renderBookingEmails(base).customerHtml;
  const returned = renderBookingEmails({ ...base, returnApplied: true }).customerHtml;
  assert.match(single, /\u20ac\s?89,50/);
  assert.doesNotMatch(single, /\(retour\)/);
  assert.match(returned, /\u20ac\s?89,50 \(retour\)/);
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
