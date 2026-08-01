/**
 * Tests voor de retour- en vluchtnummerregels van het boekingsformulier.
 *
 * Alles hier is ZUIVERE logica: dezelfde regels die de client (BookingSection)
 * toont én die de server (app/api/bookings/route.ts) opnieuw afdwingt. Zo kunnen
 * formulier, payload en validatie niet uit elkaar lopen.
 *
 * De onderliggende luchthavencontext (pickupIsAirport/dropoffIsAirport) komt uit
 * de autoritatieve Pricing Service; die richtinglogica wordt apart getest in
 * lib/pricing/airport-context.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  flightFieldRules,
  returnFlightDirection,
  isReturnAfterOutbound,
  validateBookingForm,
  buildBookingPayload,
  type FlightFieldRules,
} from "./booking-meta";

// ── Locatievarianten (alleen de luchthavenvlaggen doen ertoe) ────────────────
const HUIS = { pickupIsAirport: false, dropoffIsAirport: false };
const HUIS_NAAR_SCHIPHOL = { pickupIsAirport: false, dropoffIsAirport: true };
const SCHIPHOL_NAAR_HUIS = { pickupIsAirport: true, dropoffIsAirport: false };
const SCHIPHOL_NAAR_SCHIPHOL = { pickupIsAirport: true, dropoffIsAirport: true };

// ── flightFieldRules — enkele rit ────────────────────────────────────────────

test("huis → Schiphol, enkele rit: heen optioneel, retour verborgen (geen plicht)", () => {
  const r = flightFieldRules({ ...HUIS_NAAR_SCHIPHOL, isReturn: false });
  assert.equal(r.outbound, "optional");
  assert.equal(r.return, "hidden");
});

test("Schiphol → huis, enkele rit: heen verplicht", () => {
  const r = flightFieldRules({ ...SCHIPHOL_NAAR_HUIS, isReturn: false });
  assert.equal(r.outbound, "required");
  assert.equal(r.return, "hidden");
});

test("huis → huis, enkele rit: geen vluchtvelden", () => {
  const r = flightFieldRules({ ...HUIS, isReturn: false });
  assert.equal(r.outbound, "hidden");
  assert.equal(r.return, "hidden");
});

// ── flightFieldRules — retour ────────────────────────────────────────────────

test("huis → Schiphol → huis, retour: heen optioneel, retour verplicht", () => {
  // Retour vertrekt vanaf Schiphol (de heen-bestemming) → aankomst monitoren.
  const r = flightFieldRules({ ...HUIS_NAAR_SCHIPHOL, isReturn: true });
  assert.equal(r.outbound, "optional");
  assert.equal(r.return, "required");
});

test("Schiphol → huis → Schiphol, retour: heen verplicht, retour optioneel", () => {
  const r = flightFieldRules({ ...SCHIPHOL_NAAR_HUIS, isReturn: true });
  assert.equal(r.outbound, "required");
  assert.equal(r.return, "optional");
});

test("Schiphol → Schiphol, retour: beide verplicht", () => {
  const r = flightFieldRules({ ...SCHIPHOL_NAAR_SCHIPHOL, isReturn: true });
  assert.equal(r.outbound, "required");
  assert.equal(r.return, "required");
});

test("huis → huis, retour: nog steeds geen vluchtvelden", () => {
  const r = flightFieldRules({ ...HUIS, isReturn: true });
  assert.equal(r.outbound, "hidden");
  assert.equal(r.return, "hidden");
});

// ── returnFlightDirection ────────────────────────────────────────────────────

test("retourrichting: dropoff-luchthaven → arrival, pickup-luchthaven → departure", () => {
  assert.equal(returnFlightDirection(HUIS_NAAR_SCHIPHOL), "arrival");
  assert.equal(returnFlightDirection(SCHIPHOL_NAAR_HUIS), "departure");
  assert.equal(returnFlightDirection(SCHIPHOL_NAAR_SCHIPHOL), "arrival");
  assert.equal(returnFlightDirection(HUIS), null);
});

// ── isReturnAfterOutbound ────────────────────────────────────────────────────

test("retour later dan heen wordt geaccepteerd", () => {
  assert.equal(isReturnAfterOutbound("2026-08-10", "08:00", "2026-08-12", "09:00"), true);
  assert.equal(isReturnAfterOutbound("2026-08-10", "08:00", "2026-08-10", "08:01"), true);
});

test("retour vóór of gelijk aan heen wordt geweigerd", () => {
  assert.equal(isReturnAfterOutbound("2026-08-10", "08:00", "2026-08-09", "09:00"), false);
  assert.equal(isReturnAfterOutbound("2026-08-10", "08:00", "2026-08-10", "08:00"), false); // gelijk
  assert.equal(isReturnAfterOutbound("2026-08-10", "08:00", "2026-08-10", "07:59"), false);
});

test("ontbrekende of ongeldige datum/tijd → false (geen stille pass)", () => {
  assert.equal(isReturnAfterOutbound("", "08:00", "2026-08-12", "09:00"), false);
  assert.equal(isReturnAfterOutbound("2026-08-10", "08:00", "", "09:00"), false);
  assert.equal(isReturnAfterOutbound("niet-een-datum", "08:00", "2026-08-12", "09:00"), false);
});

// ── validateBookingForm ──────────────────────────────────────────────────────

const OK_ENKEL = {
  hasPickup: true,
  hasDropoff: true,
  isReturn: false,
  flightRules: { outbound: "hidden", return: "hidden" } as FlightFieldRules,
  outboundFlight: "",
  returnFlight: "",
  outboundDate: "2026-08-10",
  outboundTime: "08:00",
  returnDate: "",
  returnTime: "",
};

test("adres ontbreekt → 'address'", () => {
  assert.equal(validateBookingForm({ ...OK_ENKEL, hasPickup: false }), "address");
  assert.equal(validateBookingForm({ ...OK_ENKEL, hasDropoff: false }), "address");
});

test("huis → Schiphol, enkele rit zonder vluchtnummer: geen fout", () => {
  const v = validateBookingForm({
    ...OK_ENKEL,
    flightRules: { outbound: "optional", return: "hidden" },
    outboundFlight: "",
  });
  assert.equal(v, null);
});

test("Schiphol → huis, enkele rit zonder vluchtnummer: 'flight_outbound'", () => {
  const v = validateBookingForm({
    ...OK_ENKEL,
    flightRules: { outbound: "required", return: "hidden" },
    outboundFlight: "",
  });
  assert.equal(v, "flight_outbound");
});

test("retour zonder datum/tijd → 'return_datetime_missing'", () => {
  const v = validateBookingForm({
    ...OK_ENKEL,
    isReturn: true,
    flightRules: { outbound: "optional", return: "required" },
    returnFlight: "KL1234",
    returnDate: "",
    returnTime: "",
  });
  assert.equal(v, "return_datetime_missing");
});

test("retour vóór of gelijk aan heen → 'return_not_after_outbound'", () => {
  const gelijk = validateBookingForm({
    ...OK_ENKEL,
    isReturn: true,
    flightRules: { outbound: "optional", return: "hidden" },
    returnDate: "2026-08-10",
    returnTime: "08:00",
  });
  assert.equal(gelijk, "return_not_after_outbound");

  const eerder = validateBookingForm({
    ...OK_ENKEL,
    isReturn: true,
    flightRules: { outbound: "optional", return: "hidden" },
    returnDate: "2026-08-09",
    returnTime: "23:59",
  });
  assert.equal(eerder, "return_not_after_outbound");
});

test("retour (huis → Schiphol → huis) zonder retourvluchtnummer → 'flight_return'", () => {
  const v = validateBookingForm({
    ...OK_ENKEL,
    isReturn: true,
    flightRules: { outbound: "optional", return: "required" },
    returnDate: "2026-08-12",
    returnTime: "09:00",
    returnFlight: "",
  });
  assert.equal(v, "flight_return");
});

test("volledige geldige retour → geen fout", () => {
  const v = validateBookingForm({
    ...OK_ENKEL,
    isReturn: true,
    flightRules: { outbound: "optional", return: "required" },
    returnDate: "2026-08-12",
    returnTime: "09:00",
    returnFlight: "KL0602",
  });
  assert.equal(v, null);
});

// ── buildBookingPayload ──────────────────────────────────────────────────────

const BASE_FORM = {
  pickup: "Amsterdam Centrum",
  dropoff: "Schiphol Airport",
  date: "2026-08-10",
  time: "08:00",
  vehicle: "Tesla Model Y — Amsterdam",
  persons: 2,
  luggage: "1-2-koffers",
  customerName: "Jan Jansen",
  customerPhone: "+31612345678",
  customerEmail: "jan@example.nl",
  locale: "nl",
  website: "",
};

test("payload — enkele rit laat retourvelden leeg", () => {
  const p = buildBookingPayload({
    ...BASE_FORM,
    rideType: "enkel",
    flightNumber: "",
    returnDate: "2026-08-12",
    returnTime: "09:00",
    returnFlightNumber: "KL0602",
    flightRules: { outbound: "optional", return: "hidden" },
  });
  assert.equal(p.rideType, "enkel");
  assert.equal(p.returnDate, "");
  assert.equal(p.returnTime, "");
  assert.equal(p.returnFlightNumber, "");
});

test("payload — retour bevat correcte heen- en retourgegevens", () => {
  const p = buildBookingPayload({
    ...BASE_FORM,
    rideType: "retour",
    flightNumber: "",
    returnDate: "2026-08-12",
    returnTime: "09:00",
    returnFlightNumber: "kl0602", // wordt getrimd, hoofdletters komen uit de UI
    flightRules: { outbound: "optional", return: "required" },
  });
  // Heen
  assert.equal(p.pickup, "Amsterdam Centrum");
  assert.equal(p.dropoff, "Schiphol Airport");
  assert.equal(p.date, "2026-08-10");
  assert.equal(p.time, "08:00");
  // Retour
  assert.equal(p.returnDate, "2026-08-12");
  assert.equal(p.returnTime, "09:00");
  assert.equal(p.returnFlightNumber, "kl0602");
});

test("payload — verborgen vluchtveld levert geen vluchtnummer op", () => {
  const p = buildBookingPayload({
    ...BASE_FORM,
    rideType: "enkel",
    flightNumber: "KL1234",
    returnDate: "",
    returnTime: "",
    returnFlightNumber: "",
    flightRules: { outbound: "hidden", return: "hidden" },
  });
  assert.equal(p.flightNumber, "");
});

test("payload — retourvluchtnummer valt weg wanneer het retourveld verborgen is", () => {
  const p = buildBookingPayload({
    ...BASE_FORM,
    rideType: "retour",
    flightNumber: "",
    returnDate: "2026-08-12",
    returnTime: "09:00",
    returnFlightNumber: "KL0602",
    flightRules: { outbound: "optional", return: "hidden" },
  });
  assert.equal(p.returnFlightNumber, "");
  // datum/tijd blijven wél bewaard bij een retour
  assert.equal(p.returnDate, "2026-08-12");
  assert.equal(p.returnTime, "09:00");
});

// ── NL/EN-validatie- en labelteksten aanwezig in beide talen ────────────────

const NEW_KEYS = [
  "optioneel",
  "vluchtUitleg",
  "retourDatum",
  "retourTijd",
  "retourVlucht",
  "valRetourDatumTijd",
  "valRetourNaHeen",
  "valRetourVlucht",
] as const;

function loadBooking(lang: "nl" | "en"): Record<string, string> {
  const raw = readFileSync(new URL(`../messages/${lang}.json`, import.meta.url), "utf8");
  return (JSON.parse(raw) as { booking: Record<string, string> }).booking;
}

test("alle nieuwe boekingssleutels bestaan en zijn niet-leeg in NL én EN", () => {
  const nl = loadBooking("nl");
  const en = loadBooking("en");
  for (const key of NEW_KEYS) {
    assert.ok(typeof nl[key] === "string" && nl[key].trim() !== "", `NL mist '${key}'`);
    assert.ok(typeof en[key] === "string" && en[key].trim() !== "", `EN mist '${key}'`);
  }
});

test("NL en EN validatieteksten verschillen (echt vertaald, niet gekopieerd)", () => {
  const nl = loadBooking("nl");
  const en = loadBooking("en");
  for (const key of ["valRetourDatumTijd", "valRetourNaHeen", "valRetourVlucht"] as const) {
    assert.notEqual(nl[key], en[key], `'${key}' is niet vertaald`);
  }
});
