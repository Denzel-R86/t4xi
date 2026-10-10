import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBookingIcs } from "@/lib/bookings/booking-calendar";
import type { ConfirmationDetails } from "@/lib/bookings/confirmation-details";
import { serverPaidProof, type ServerPaidProof } from "@/lib/payments/server-paid";

const NOW = new Date("2026-10-01T08:00:00.000Z");
const PAID = serverPaidProof({ status: "paid", amountPaid: 8900 }, null);
const ride: ConfirmationDetails = {
  bookingRef: "T4X-2026-0042",
  bookingStatus: "inquiry",
  date: "2026-11-12",
  time: "14:30",
  pickup: "Amsterdam Zuidas, Amsterdam",
  dropoff: "Schiphol",
  returnTrip: true,
  returnDate: "2026-11-19",
  returnTime: "18:00",
  passengers: 2,
  flightNumber: "",
  returnFlightNumber: "",
  email: "tester@example.test",
};

/** Ongevouwen regels; ICS-escaping van komma's teruggedraaid voor leesbaarheid. */
const lines = (ics: string | null) => (ics ?? "").replace(/\r\n /g, "").split("\r\n").map((l) => l.replace(/\\,/g, ","));
const value = (ics: string | null, key: string) => lines(ics).filter((l) => l.startsWith(`${key}:`)).map((l) => l.slice(key.length + 1));

test("aanvraag (nl): TENTATIVE, titel en omschrijving zeggen 'nog niet bevestigd'", () => {
  const ics = buildBookingIcs(ride, { locale: "nl", payment: PAID, now: NOW });
  assert.deepEqual(value(ics, "STATUS"), ["TENTATIVE", "TENTATIVE"]);
  assert.deepEqual(value(ics, "SUMMARY"), [
    "Aanvraag T4XI-rit (nog niet bevestigd) — Amsterdam Zuidas → Schiphol",
    "Aanvraag T4XI-terugrit (nog niet bevestigd) — Schiphol → Amsterdam Zuidas",
  ]);
  for (const d of value(ics, "DESCRIPTION")) {
    assert.equal(d, "Betaling ontvangen. Uw aanvraag is in behandeling. Wij bevestigen uw rit via WhatsApp of e-mail. Referentie: T4X-2026-0042.");
  }
  assert.doesNotMatch(ics ?? "", /CONFIRMED|is bevestigd/);
});

test("aanvraag (en): TENTATIVE, 'not yet confirmed'", () => {
  const ics = buildBookingIcs(ride, { locale: "en", payment: PAID, now: NOW });
  assert.deepEqual(value(ics, "STATUS"), ["TENTATIVE", "TENTATIVE"]);
  assert.equal(value(ics, "SUMMARY")[0], "T4XI ride request (not yet confirmed) — Amsterdam Zuidas → Schiphol");
  assert.equal(value(ics, "SUMMARY")[1], "T4XI return ride request (not yet confirmed) — Schiphol → Amsterdam Zuidas");
  assert.equal(value(ics, "DESCRIPTION")[0], "Payment received. Your request is being processed. We will confirm your ride via WhatsApp or email. Reference: T4X-2026-0042.");
  assert.doesNotMatch(ics ?? "", /STATUS:CONFIRMED|is confirmed/);
});

test("quoted is ook nog een aanvraag", () => {
  assert.deepEqual(value(buildBookingIcs({ ...ride, bookingStatus: "quoted" }, { locale: "nl", payment: PAID, now: NOW }), "STATUS"), ["TENTATIVE", "TENTATIVE"]);
});

test("alleen bookingstatus confirmed (nl/en): CONFIRMED en een gewone titel", () => {
  const nl = buildBookingIcs({ ...ride, bookingStatus: "confirmed" }, { locale: "nl", payment: PAID, now: NOW });
  assert.deepEqual(value(nl, "STATUS"), ["CONFIRMED", "CONFIRMED"]);
  assert.deepEqual(value(nl, "SUMMARY"), ["T4XI-rit — Amsterdam Zuidas → Schiphol", "T4XI-terugrit — Schiphol → Amsterdam Zuidas"]);
  assert.equal(value(nl, "DESCRIPTION")[0], "Uw rit is bevestigd. Referentie: T4X-2026-0042.");
  const en = buildBookingIcs({ ...ride, bookingStatus: "confirmed" }, { locale: "en", payment: PAID, now: NOW });
  assert.deepEqual(value(en, "STATUS"), ["CONFIRMED", "CONFIRMED"]);
  assert.equal(value(en, "SUMMARY")[0], "T4XI ride — Amsterdam Zuidas → Schiphol");
  assert.equal(value(en, "DESCRIPTION")[0], "Your ride is confirmed. Reference: T4X-2026-0042.");
});

test("zonder server-bewijs van betaling geen agenda-item (pending, nagemaakt)", () => {
  const forged = { amountCents: 8900, currency: "eur" } as unknown as ServerPaidProof;
  for (const payment of [null, forged]) {
    for (const bookingStatus of ["inquiry", "confirmed"] as const) {
      assert.equal(buildBookingIcs({ ...ride, bookingStatus }, { locale: "nl", payment, now: NOW }), null);
    }
  }
});

test("locatie = wat de klant invoerde; geen e-mail of telefoon", () => {
  const ics = buildBookingIcs(ride, { locale: "nl", payment: PAID, now: NOW }) ?? "";
  assert.deepEqual(value(ics, "LOCATION"), ["Amsterdam Zuidas, Amsterdam", "Schiphol"]);
  assert.ok(!ics.includes("tester@example.test"));
});
