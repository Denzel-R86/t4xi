import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BOOKING_FIELD_ID,
  BOOKING_FIELD_STEP,
  BOOKING_STEPS,
  SERVER_FIELD_ERRORS,
  blocksStep,
  fieldErrorId,
  fieldForElementId,
  firstBookingFieldError,
  generalErrorIcon,
  initialBookingStep,
  nativeValidityKey,
  nextStep,
  previousStep,
  serverFieldError,
  stepStatus,
  type BookingValidationInput,
} from "./steps";

// Experience 2.0 PR 2.4 — stappen zijn weergave; validatie blijft gelijk.

/**
 * Letterlijke kopie van de client-checks in `BookingSection.handleSubmit` vóór
 * PR 2.4 (origin/main e2ff92c), alleen met de melding als resultaat. De nieuwe
 * helper moet voor elke invoer exact dezelfde melding geven.
 */
function legacyMessage(i: BookingValidationInput): string | null {
  if (!i.hasPickup || !i.hasDropoff) return "valAdres";
  if (!i.date || !i.time || !i.isFutureDeparture(i.date, i.time)) return "valDatumTijd";
  if (!i.luggage) return "valBagage";
  if (i.flightRequired && i.flightNumber.trim() === "") return "valVluchtAankomst";
  if (i.rideType === "retour" && (!i.returnDate || !i.returnTime)) return "valRetourMoment";
  if (i.returnFlightRequired && i.returnFlightNumber.trim() === "") return "valVluchtRetourAankomst";
  return null;
}

function* inputs(): Generator<BookingValidationInput> {
  const bools = [true, false];
  for (const hasPickup of bools)
    for (const hasDropoff of bools)
      for (const date of ["", "2026-11-12"])
        for (const time of ["", "14:30"])
          for (const future of bools)
            for (const luggage of ["", "handbagage"])
              for (const rideType of ["enkel", "retour"] as const)
                for (const returnDate of ["", "2026-11-19"])
                  for (const returnTime of ["", "18:00"])
                    for (const flightRequired of bools)
                      for (const flightNumber of ["", "  ", "KL1234"])
                        for (const returnFlightRequired of bools)
                          for (const returnFlightNumber of ["", "KL1235"])
                            yield {
                              hasPickup,
                              hasDropoff,
                              date,
                              time,
                              luggage,
                              rideType,
                              returnDate,
                              returnTime,
                              flightRequired,
                              flightNumber,
                              returnFlightRequired,
                              returnFlightNumber,
                              isFutureDeparture: () => future,
                            };
}

test("validatie: zelfde melding in dezelfde volgorde als vóór de split (volledige combinatiematrix)", () => {
  let n = 0;
  for (const input of inputs()) {
    n += 1;
    assert.equal(firstBookingFieldError(input)?.messageKey ?? null, legacyMessage(input));
  }
  assert.ok(n > 10_000, `matrix te klein (${n})`);
});

test("validatie: elke fout wijst naar het veld dat de klant moet aanpassen", () => {
  const ok: BookingValidationInput = {
    hasPickup: true,
    hasDropoff: true,
    date: "2026-11-12",
    time: "14:30",
    luggage: "handbagage",
    rideType: "retour",
    returnDate: "2026-11-19",
    returnTime: "18:00",
    flightRequired: true,
    flightNumber: "KL1234",
    returnFlightRequired: true,
    returnFlightNumber: "KL1235",
    isFutureDeparture: () => true,
  };
  assert.equal(firstBookingFieldError(ok), null);
  const field = (patch: Partial<BookingValidationInput>) => firstBookingFieldError({ ...ok, ...patch })?.field;
  assert.equal(field({ hasPickup: false }), "pickup");
  assert.equal(field({ hasPickup: false, hasDropoff: false }), "pickup");
  assert.equal(field({ hasDropoff: false }), "dropoff");
  assert.equal(field({ date: "" }), "date");
  assert.equal(field({ time: "" }), "time");
  assert.equal(field({ isFutureDeparture: () => false }), "date");
  assert.equal(field({ luggage: "" }), "luggage");
  assert.equal(field({ flightNumber: " " }), "flight");
  assert.equal(field({ returnDate: "" }), "returnDate");
  assert.equal(field({ returnTime: "" }), "returnTime");
  assert.equal(field({ returnFlightNumber: "" }), "returnFlight");
  // Enkele rit: retourmoment telt niet mee (zoals vóór de split).
  assert.equal(field({ rideType: "enkel", returnDate: "", returnFlightRequired: false }), undefined);
});

test("stappen: vaste volgorde Route → Rit → Gegevens → Bevestigen", () => {
  assert.deepEqual([...BOOKING_STEPS], ["route", "rit", "gegevens", "bevestigen"]);
  assert.equal(nextStep("route"), "rit");
  assert.equal(nextStep("bevestigen"), "bevestigen");
  assert.equal(previousStep("rit"), "route");
  assert.equal(previousStep("route"), "route");
  assert.deepEqual(
    BOOKING_STEPS.map((s) => stepStatus(s, "gegevens")),
    ["complete", "complete", "current", "upcoming"]
  );
});

test("stappen: deep-link met beide adressen start op Rit, anders op Route", () => {
  assert.equal(initialBookingStep({ hasPickup: true, hasDropoff: true }), "rit");
  assert.equal(initialBookingStep({ hasPickup: true, hasDropoff: false }), "route");
  assert.equal(initialBookingStep({ hasPickup: false, hasDropoff: false }), "route");
});

test("stappen: alleen een fout in de huidige of een eerdere stap houdt de stapwissel tegen", () => {
  const luggage = { field: "luggage", messageKey: "valBagage" } as const;
  assert.equal(blocksStep(luggage, "route"), false);
  assert.equal(blocksStep(luggage, "rit"), true);
  assert.equal(blocksStep(luggage, "bevestigen"), true);
  assert.equal(blocksStep(null, "bevestigen"), false);
});

test("velden: elk veld hoort bij precies één stap, ids zijn uniek en omkeerbaar", () => {
  const ids = Object.values(BOOKING_FIELD_ID);
  assert.equal(new Set(ids).size, ids.length);
  for (const [field, id] of Object.entries(BOOKING_FIELD_ID)) {
    assert.equal(fieldForElementId(id), field);
    assert.ok(BOOKING_STEPS.includes(BOOKING_FIELD_STEP[field as keyof typeof BOOKING_FIELD_STEP]));
    assert.equal(fieldErrorId(field as keyof typeof BOOKING_FIELD_ID), `${id}-error`);
  }
  assert.equal(fieldForElementId("f-website"), null, "honeypot is nooit een zichtbaar veld");
});

test("serverfouten: veldkoppeling gebruikt letterlijk de teksten uit app/api/bookings/route.ts", () => {
  const route = readFileSync("app/api/bookings/route.ts", "utf8");
  for (const message of Object.keys(SERVER_FIELD_ERRORS)) {
    assert.ok(route.includes(`bad("${message}")`), `route.ts geeft "${message}" niet meer terug`);
  }
  assert.equal(serverFieldError("Geldig telefoonnummer is verplicht.")?.field, "phone");
  assert.equal(serverFieldError("Naam is verplicht.")?.field, "name");
  assert.equal(serverFieldError("Geldig e-mailadres is verplicht.")?.field, "email");
  assert.equal(serverFieldError("Boekingen zijn tijdelijk niet beschikbaar. Bel of WhatsApp ons."), null);
  assert.equal(serverFieldError(undefined), null);
});

test("native constraints: eigen melding bij verplicht/e-mail, anders de browsertekst", () => {
  const v = (valueMissing: boolean, typeMismatch: boolean) => ({ valueMissing, typeMismatch });
  assert.equal(nativeValidityKey(v(true, false), "name"), "valVerplichtVeld");
  assert.equal(nativeValidityKey(v(true, false), "luggage"), "valBagage");
  assert.equal(nativeValidityKey(v(true, false), "date"), "valDatumTijd");
  assert.equal(nativeValidityKey(v(true, false), "returnTime"), "valRetourMoment");
  assert.equal(nativeValidityKey(v(false, true), "email"), "valEmail");
  assert.equal(nativeValidityKey(v(false, false), "persons"), null);
});

test("F-13: algemene melding kiest het icoon naar het soort fout", () => {
  assert.equal(generalErrorIcon("price"), "info-circle");
  assert.equal(generalErrorIcon("network"), "globe");
  assert.equal(generalErrorIcon("rate"), "clock");
  assert.equal(generalErrorIcon("server"), "phone");
});

test("i18n: alle nieuwe stap- en foutlabels bestaan in nl én en", () => {
  const nl = JSON.parse(readFileSync("messages/nl.json", "utf8")).booking;
  const en = JSON.parse(readFileSync("messages/en.json", "utf8")).booking;
  for (const key of [
    "stapVoortgang", "stapRoute", "stapRit", "stapGegevens", "stapBevestigen", "stapVanTotaal",
    "volgende", "terug", "wijzig", "vluchtnummerKort", "verplichtUitleg",
    "valVerplichtVeld", "valEmail", "valTelefoon", "valNaam",
  ]) {
    assert.ok(nl[key]?.trim(), `nl.booking.${key}`);
    assert.ok(en[key]?.trim(), `en.booking.${key}`);
  }
  // B7 niet besloten: geen nieuwe wacht-/annuleringsclaims in de nieuwe labels.
  const added = JSON.stringify([nl, en].map((m) => [m.stapVoortgang, m.verplichtUitleg, m.valTelefoon]));
  assert.doesNotMatch(added, /wacht|annuler|wait|cancel/i);
});

test("payload: handleSubmit stuurt exact dezelfde sleutels als vóór de split", () => {
  const src = readFileSync("components/booking/BookingSection.tsx", "utf8");
  const block = src.match(/const payload = \{([\s\S]*?)\n {4}\};/)?.[1];
  assert.ok(block, "payload-blok niet gevonden");
  const keys = [...block.matchAll(/^\s{6}(\w+)(?::|,)/gm)].map((m) => m[1]);
  assert.deepEqual(keys, [
    "rideType", "pickup", "dropoff", "quoteId", "date", "time", "returnDate", "returnTime",
    "persons", "luggage", "flightNumber", "returnFlightNumber", "customerName", "customerPhone",
    "customerEmail", "locale", "website",
  ]);
  // Contactvelden en datum/tijd komen nog steeds uit FormData (name-attributen).
  for (const name of ["datum", "tijd", "naam", "telefoon", "email", "website"]) {
    assert.match(block, new RegExp(`form\\.get\\("${name}"\\)`));
  }
});
