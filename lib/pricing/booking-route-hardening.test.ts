import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POST as book } from "@/app/api/bookings/route";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";
import { quoteFingerprint } from "@/lib/pricing/service";

const bookingSource = readFileSync("app/api/bookings/route.ts", "utf8");
const formSource = readFileSync("components/booking/BookingSection.tsx", "utf8");
const migrationSource = readFileSync(
  "supabase/migrations/20260809090000_add_return_trip_details.sql",
  "utf8"
);

const validBase = {
  rideType: "enkel",
  pickup: "Amsterdam Centrum",
  dropoff: "Utrecht Centrum",
  date: "2099-01-10",
  time: "09:00",
  customerName: "Test Klant",
  customerEmail: "test@example.com",
  customerPhone: "+31612345678",
  persons: 1,
  luggage: "handbagage",
};

function request(
  body: Record<string, unknown>,
  ip: string,
  userAgent = "booking-hardening-test",
): Request {
  return new Request("https://www.t4xi.nl/api/bookings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
      "user-agent": userAgent,
    },
    body: JSON.stringify(body),
  });
}

function assertPrivateNoStore(response: Response): void {
  const cacheControl = response.headers.get("cache-control") ?? "";
  assert.match(cacheControl, /\bprivate\b/);
  assert.match(cacheControl, /\bno-store\b/);
}

test("booking: onmogelijke datum en misleidende rittypes worden geweigerd", async () => {
  const cases = [
    { ...validBase, date: "2099-02-31" },
    { ...validBase, rideType: "dagtocht" },
    { ...validBase, rideType: "luchthaven" },
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const response = await book(request(cases[index], `198.51.100.${index + 1}`));
    assert.equal(response.status, 400);
    assertPrivateNoStore(response);
  }
});

test("booking: rate-limit staat vóór body-read en telt oversized pogingen", async () => {
  const limitPosition = bookingSource.indexOf("const rl = rateLimit");
  const bodyReadPosition = bookingSource.indexOf("const rawBody = await request.text()");
  assert.ok(limitPosition >= 0, "booking-rate-limit ontbreekt");
  assert.ok(bodyReadPosition > limitPosition, "rate-limit moet vóór request.text() staan");

  const ip = "198.18.0.51";
  const oversized = { ...validBase, padding: "x".repeat(5_000) };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await book(request(oversized, ip));
    assert.equal(response.status, 413);
    assertPrivateNoStore(response);
  }

  const limited = await book(request(validBase, ip));
  assert.equal(limited.status, 429);
  assertPrivateNoStore(limited);
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
});

test("booking: rate-limit is IP-only en niet te omzeilen met User-Agent-rotatie", async () => {
  assert.match(bookingSource, /rateLimit\(`bookings:\$\{ip\}`/);
  assert.doesNotMatch(bookingSource, /rateLimit\(`bookings:\$\{ip\}\|\$\{ua\}`/);

  const ip = "198.18.0.52";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await book(request({}, ip, `rotating-agent-${attempt}`));
    assert.equal(response.status, 400);
  }
  const limited = await book(request({}, ip, "rotating-agent-final"));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
});

test("booking: retourmoment moet compleet en later dan de heenrit zijn", async () => {
  const cases = [
    { ...validBase, rideType: "retour", returnDate: "", returnTime: "" },
    { ...validBase, rideType: "retour", returnDate: "2099-01-10", returnTime: "08:59" },
    { ...validBase, returnDate: "2099-01-11", returnTime: "09:00" },
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const response = await book(request(cases[index], `203.0.113.${index + 1}`));
    assert.equal(response.status, 400);
    assertPrivateNoStore(response);
  }
});

test("booking: retourgegevens lopen van formulier tot database en notificatie", () => {
  for (const field of ["returnDate", "returnTime", "returnFlightNumber"]) {
    assert.match(formSource, new RegExp(field));
    assert.match(bookingSource, new RegExp(field));
  }
  for (const column of ["return_date", "return_time", "return_flight_number"]) {
    assert.match(bookingSource, new RegExp(column));
    assert.match(migrationSource, new RegExp(column));
  }
  assert.match(migrationSource, /bookings_return_after_departure/);
});

test("booking: quote-lock gebruikt exact dezelfde vertrek-instants als de prijs-preview", () => {
  const rpcFingerprintCall = bookingSource.match(
    /p_expected_fingerprint:\s*quoteFingerprint\(\{[\s\S]*?\}\),\s*p_ride_type:/,
  )?.[0];
  assert.ok(rpcFingerprintCall, "quote-lock RPC moet zijn verwachte fingerprint lokaal opbouwen");
  assert.match(rpcFingerprintCall, /\bdepartureAt\b/);
  assert.match(rpcFingerprintCall, /\breturnDepartureAt\b/);

  const departureAt = amsterdamDepartureIso("2099-01-10", "09:00");
  const returnDepartureAt = amsterdamDepartureIso("2099-01-11", "23:30");
  assert.ok(departureAt);
  assert.ok(returnDepartureAt);

  const pricePreviewFingerprint = quoteFingerprint({
    pickup: "Amsterdam Centrum",
    dropoff: "Schiphol Airport",
    returnTrip: true,
    departureAt,
    returnDepartureAt,
  });
  const bookingConfirmationFingerprint = quoteFingerprint({
    pickup: "Amsterdam Centrum",
    dropoff: "Schiphol Airport",
    returnTrip: true,
    departureAt,
    returnDepartureAt,
  });

  assert.equal(bookingConfirmationFingerprint, pricePreviewFingerprint);
  assert.notEqual(
    quoteFingerprint({
      pickup: "Amsterdam Centrum",
      dropoff: "Schiphol Airport",
      returnTrip: true,
    }),
    pricePreviewFingerprint,
    "zonder vertrek-instants zou de database terecht QUOTE_MISMATCH geven",
  );
});

test("bookingformulier: submit wacht op een bevestigde quote-lock of echte offerte-op-aanvraag", () => {
  assert.match(
    formSource,
    /const quoteAllowsBooking\s*=\s*[\s\S]*?quote\.status === "ready"[\s\S]*?quote\.quoteId\.length > 0[\s\S]*?quote\.status === "onrequest"/,
  );
  assert.match(formSource, /if \(!quoteAllowsBooking\) \{[\s\S]*?setSubmit/);
  assert.match(formSource, /disabled=\{loading \|\| !quoteReady \|\| !quoteAllowsBooking\}/);
});

test("booking: server en formulier hanteren dezelfde vluchtnummerplicht", () => {
  assert.match(
    bookingSource,
    /const outboundFlightRequired\s*=\s*[\s\S]*?airport\.flightDirection === "arrival"/,
  );
  assert.match(
    bookingSource,
    /const returnFlightRequired\s*=\s*[\s\S]*?airport\.flightDirection === "departure"/,
  );
  assert.match(bookingSource, /if \(outboundFlightRequired && flightNumber === ""\)/);
  assert.match(bookingSource, /if \(returnFlightRequired && returnFlightNumber === ""\)/);
  assert.doesNotMatch(
    bookingSource,
    /if \(airport\.isAirportTransfer && flightNumber === ""\)/,
  );
  assert.match(formSource, /const flightRequired = needsFlight && isArrival/);
  assert.match(formSource, /const returnFlightRequired = needsFlight && tab === "retour" && returnDirection === "arrival"/);
});

test("booking: vluchtmonitoring volgt bij city→airport→city de verplichte aankomende retourvlucht", () => {
  assert.match(bookingSource, /buildTripMonitoringRegistration\(\{/);
  assert.match(
    bookingSource,
    /returnLeg:\s*\{[\s\S]*?flightNumber: returnFlightNumberToStore[\s\S]*?scheduleDate: returnDate/,
  );
  assert.match(
    bookingSource,
    /flightDirection === "departure"[\s\S]*?\? "arrival"/,
  );
});

test("booking: voertuigkeuze is verborgen en de server dwingt een neutrale standaard af", () => {
  assert.doesNotMatch(formSource, /id=["']f-vehicle["']/);
  assert.doesNotMatch(formSource, /Lynk & Co 01|Tesla Model Y/);
  assert.doesNotMatch(formSource, /setVehicle/);
  assert.doesNotMatch(formSource, /\bvehicle\s*,/);

  assert.match(bookingSource, /const DEFAULT_BOOKING_VEHICLE = ["']Premium voertuig["']/);
  assert.match(bookingSource, /const vehicle = DEFAULT_BOOKING_VEHICLE/);
  assert.doesNotMatch(bookingSource, /const vehicle = str\(body\.vehicle\)/);
  assert.equal(bookingSource.match(/p_vehicle: vehicle \|\| null/g)?.length, 2);
  assert.match(bookingSource, /sendBookingEmails\(\{[\s\S]*?vehicle: vehicle \|\| null/);
});
