import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { airportContext } from "@/lib/pricing/service";

/**
 * Regressiebescherming voor één operationele businessregel:
 *
 *   Vertrekt het RETOUR-ritdeel vanaf een luchthaven, dan is een
 *   retour-vluchtnummer VERPLICHT (de server weigert de boeking zonder).
 *
 * Waarom een aparte test: de serverreject in app/api/bookings/route.ts is de
 * échte veiligheidsgrens. De functionaliteit is aantoonbaar correct, maar dit is
 * precies het soort regel dat later ongemerkt kan sneuvelen bij een refactor van
 * route.ts, airport-context of de booking-service. UI-validatie alléén is daar
 * geen bescherming voor.
 *
 * SEMANTIEK — bewust expliciet, want `flightDirection` voelt dubbelzinnig:
 *   Een heenrit stad→luchthaven levert `flightDirection === "departure"`
 *   (de reiziger VERTREKT per vliegtuig). Het retourdeel is dan luchthaven→stad,
 *   dus het RETOUR-ritdeel vertrekt VANAF de luchthaven → aankomende retourvlucht
 *   → retour-vluchtnummer verplicht.
 *   Draai "departure"/"arrival" hier dus NOOIT om zonder deze test te herzien.
 *
 * De luchthavenrichting komt uit één bron van waarheid: `airportContext()` in
 * lib/pricing/service.ts (afgeleid van `locations.location_type`). De booking-
 * route leest exact dat object. Deze test bewaakt (1) de richting-afleiding via
 * de ECHTE functie en (2) dat de route die richting nog steeds naar de retour-
 * plicht + server-reject bedraadt.
 *
 * NB — grens van deze test: de HTTP-reject zelf loopt via de volledige
 * prijsresolutie, die `locations` uit Supabase leest en dus niet offline te
 * reproduceren is zonder DB-double. Daarom: de richting via de echte functie +
 * een broncode-wiring-lock, i.p.v. een netwerkafhankelijke end-to-end call.
 */

// location_type zoals de `locations`-tabel het aanlevert; alleen dat veld telt.
const AIRPORT: { location_type: string | null } = { location_type: "airport" };
const CITY: { location_type: string | null } = { location_type: "city" };

/**
 * De regel exact zoals app/api/bookings/route.ts hem samenstelt, gevoed door de
 * echte `airportContext`. Wijkt de route hiervan af, dan vangt de wiring-lock-
 * test hieronder dat af.
 */
function returnFlightNumberRequired(
  pickup: { location_type: string | null },
  dropoff: { location_type: string | null },
  returnTrip: boolean,
): boolean {
  const airport = airportContext(pickup, dropoff);
  return returnTrip && airport.isAirportTransfer && airport.flightDirection === "departure";
}

test("1. retour vanaf luchthaven + geen retour-vluchtnummer → reject", () => {
  // stad → luchthaven (heenrit), dus retourdeel vertrekt vanaf de luchthaven.
  const required = returnFlightNumberRequired(CITY, AIRPORT, true);
  const returnFlightNumber = "";
  assert.equal(required, true, "retour vanaf luchthaven moet een vluchtnummer eisen");
  assert.equal(required && returnFlightNumber === "", true, "leeg nummer → server rejecteert");
});

test("2. retour vanaf luchthaven + geldig retour-vluchtnummer → accept", () => {
  const required = returnFlightNumberRequired(CITY, AIRPORT, true);
  const returnFlightNumber: string = "KL1234";
  assert.equal(required, true);
  assert.equal(required && returnFlightNumber === "", false, "gevuld nummer → geen reject");
});

test("3. retour vanaf niet-luchthaven + geen retour-vluchtnummer → accept", () => {
  // stad → stad: geen luchthavenrit, dus nooit een retour-vluchtnummerplicht.
  assert.equal(returnFlightNumberRequired(CITY, CITY, true), false);
});

test("4. enkele reis → geen retour-vluchtnummerplicht (bestaand gedrag ongewijzigd)", () => {
  // Zelfs met een luchthaven als bestemming: zonder retour is er geen retourdeel.
  assert.equal(returnFlightNumberRequired(CITY, AIRPORT, false), false);
});

test("wiring-lock: route.ts bedraadt de plicht op flightDirection === 'departure' en rejecteert een leeg nummer", () => {
  const src = readFileSync("app/api/bookings/route.ts", "utf8");
  assert.match(
    src,
    /const returnFlightRequired\s*=\s*[\s\S]*?returnTrip[\s\S]*?airport\.isAirportTransfer[\s\S]*?airport\.flightDirection === "departure"/,
    "route moet de retour-plicht afleiden uit flightDirection === 'departure'",
  );
  assert.match(
    src,
    /if \(returnFlightRequired && returnFlightNumber === ""\)\s*\{[\s\S]*?return bad\(/,
    "route moet een leeg verplicht retour-vluchtnummer server-side weigeren",
  );
});
