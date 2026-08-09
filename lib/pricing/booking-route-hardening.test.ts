import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POST as book } from "@/app/api/bookings/route";

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

function request(body: Record<string, unknown>, ip: string): Request {
  return new Request("https://www.t4xi.nl/api/bookings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
      "user-agent": "booking-hardening-test",
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
