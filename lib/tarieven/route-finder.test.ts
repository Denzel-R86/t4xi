import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchSchipholRoute,
  buildBookingHref,
  routeSummary,
  buildQuoteRequestText,
  buildWhatsappHref,
  formatDuration,
  type RouteFinderTrip,
} from "./route-finder";

test("matchSchipholRoute herkent de vijf steden, ook met wijk/plaatsdetails", () => {
  assert.equal(matchSchipholRoute("Amsterdam Centrum")?.slug, "taxi-amsterdam-schiphol");
  assert.equal(matchSchipholRoute("Gustav Mahlerlaan 10, 1082 Amsterdam")?.naam, "Amsterdam");
  assert.equal(matchSchipholRoute("Almere Poort")?.slug, "taxi-almere-schiphol");
  assert.equal(matchSchipholRoute("Den Haag centrum")?.slug, "taxi-den-haag-schiphol");
  assert.equal(matchSchipholRoute("'s-Gravenhage")?.slug, "taxi-den-haag-schiphol");
  assert.equal(matchSchipholRoute("Utrecht CS")?.naam, "Utrecht");
});

test("matchSchipholRoute geeft null voor onbekende plaatsen", () => {
  assert.equal(matchSchipholRoute("Groningen"), null);
  assert.equal(matchSchipholRoute(""), null);
});

test("buildBookingHref codeert en laat standaardwaarden weg", () => {
  const href = buildBookingHref({ pickup: "Amsterdam Centrum", dropoff: "Schiphol" });
  assert.match(href, /^\/boeken\?/);
  assert.ok(href.includes("pickup=Amsterdam+Centrum") || href.includes("pickup=Amsterdam%20Centrum"));
  assert.ok(!href.includes("retour="));
  assert.ok(!href.includes("persons="));
});

test("buildBookingHref voegt retour en passagiers toe wanneer relevant", () => {
  const href = buildBookingHref({ pickup: "A", dropoff: "B", returnTrip: true, passengers: 3 });
  assert.ok(href.includes("retour=1"));
  assert.ok(href.includes("persons=3"));
});

test("buildBookingHref laat persons weg bij 1 passagier", () => {
  const href = buildBookingHref({ pickup: "A", dropoff: "B", passengers: 1 });
  assert.ok(!href.includes("persons="));
});

test("routeSummary toont tussenstops in volgorde en negeert lege delen", () => {
  assert.equal(
    routeSummary("Amsterdam", [{ label: "Haarlem", waitRequested: false }], "Schiphol"),
    "Amsterdam → Haarlem → Schiphol"
  );
  assert.equal(routeSummary("Amsterdam", [], "Schiphol"), "Amsterdam → Schiphol");
});

test("buildQuoteRequestText bevat route, type, passagiers en bagage", () => {
  const trip: RouteFinderTrip = {
    pickup: "Amsterdam",
    dropoff: "Schiphol",
    stops: [{ label: "Haarlem", waitRequested: true }],
    returnTrip: true,
    passengers: 2,
    bigLuggage: 2,
    handLuggage: 2,
    date: "2026-08-10",
    time: "08:00",
    returnDate: "2026-08-14",
    returnTime: "18:00",
    flightNumber: "KL1234",
  };
  const text = buildQuoteRequestText(trip);
  assert.ok(text.includes("Amsterdam → Haarlem → Schiphol"));
  assert.ok(text.includes("retour"));
  assert.ok(text.includes("Passagiers: 2"));
  assert.ok(text.includes("2 grote koffers"));
  assert.ok(text.includes("KL1234"));
  assert.ok(text.includes("extra wachttijd"));
});

test("buildWhatsappHref codeert de tekst in de URL", () => {
  const href = buildWhatsappHref("A → B");
  assert.ok(href.startsWith("https://wa.me/31634744522?text="));
  assert.ok(!href.includes(" "));
});

test("formatDuration rekent minuten om naar uren", () => {
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(60), "1 u");
  assert.equal(formatDuration(75), "1 u 15 min");
  assert.equal(formatDuration(0), "");
});
