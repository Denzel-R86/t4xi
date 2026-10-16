import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolveBookingPrice, type BookingPriceRequest, type BookingPriceDeps } from "@/lib/pricing/engine";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";
import { NO_AIRPORT, quoteFingerprint, type PricingQuoteResult } from "@/lib/pricing/service";
import type { StoredSnapshot } from "@/lib/pricing/snapshot";
import { bookingToAmount, eurosToCents, parsePaymentRequest } from "@/lib/payments/create-intent";

/**
 * S3 (masterplan §9) — adversarial aanvulling op booking-lock.test.ts.
 *
 * Drie lagen:
 *   1. resolveBookingPrice (puur): gevallen die booking-lock.test.ts nog niet
 *      dekte — retourmoment gewijzigd (F-29/F-31-pad), quote van een andere
 *      route, vervalgrens, gemanipuleerde priceBreakdown (#87), lege quoteId.
 *   2. Broncode-lock op de SQL-garanties van create_booking_from_snapshot
 *      (vergrendeling, volgorde van controles, consumptie, prijs uitsluitend uit
 *      de snapshot) — die zijn offline niet uitvoerbaar te testen.
 *   3. Betaalbedrag = serversnapshot: snapshot-cents → bookings.price_euros →
 *      PaymentIntent-bedrag is verliesvrij, en de create-intent-body kan geen
 *      bedrag meegeven.
 */

const NOW = new Date("2099-03-01T10:00:00.000Z");
const QID = "0192f0c0-0000-7000-8000-0000000053b2";
const PICKUP = "Almere Poort, Almere";
const DROPOFF = "Schiphol Airport";
const DEP = amsterdamDepartureIso("2099-03-10", "10:00")!;
const RET = amsterdamDepartureIso("2099-03-12", "18:00")!;

const retourReq = (over: Partial<BookingPriceRequest> = {}): BookingPriceRequest => ({
  pickup: PICKUP,
  dropoff: DROPOFF,
  returnTrip: true,
  passengers: 2,
  departureAt: DEP,
  returnDepartureAt: RET,
  quoteId: QID,
  ...over,
});

const stored = (fingerprint: string, over: Partial<StoredSnapshot> = {}): StoredSnapshot => ({
  quoteId: QID,
  pricingVersion: "2026.07.v1",
  pricingSource: "fixed_route_prices",
  currency: "EUR",
  subtotalCents: 18400,
  totalCents: 19930,
  routeSnapshot: {
    pickupSlug: "almere-poort-almere",
    dropoffSlug: "schiphol-airport",
    vehicleClass: "executive-ev",
    distanceKm: 39,
    estimatedDurationMin: 38,
    source: "fixed_route_prices",
    sourceLabel: null,
    validFrom: null,
    returnApplied: true,
    vatRate: 9,
    fingerprint,
    airport: { ...NO_AIRPORT, dropoffIsAirport: true, isAirportDropoff: true, isAirportTransfer: true, flightDirection: "departure" },
  },
  calculatedAt: "2099-03-01T09:55:00.000Z",
  expiresAt: "2099-03-01T10:10:00.000Z",
  ...over,
});

const RETOUR_FP = quoteFingerprint({ pickup: PICKUP, dropoff: DROPOFF, returnTrip: true, departureAt: DEP, returnDepartureAt: RET });

const deps = (snap: StoredSnapshot | null, over: Partial<BookingPriceDeps> = {}): BookingPriceDeps => ({
  now: NOW,
  readSnapshot: async () => snap,
  computeQuote: () => {
    throw new Error("geen herberekening in het quote-lock-pad");
  },
  ...over,
});

const errorOf = (o: Awaited<ReturnType<typeof resolveBookingPrice>>) => (o.kind === "error" ? o.error : o.kind);

// ── 1. resolveBookingPrice ─────────────────────────────────────────────────────

test("S3 engine: ongewijzigde retour → exact het snapshotbedrag", async () => {
  const out = await resolveBookingPrice(retourReq(), deps(stored(RETOUR_FP)));
  assert.equal(out.kind, "priced");
  assert.equal(out.kind === "priced" && out.priceEuros, 199.3);
  assert.equal(out.kind === "priced" && out.lockedQuoteId, QID);
});

test("S3 engine (F-29/F-31): retourdatum of -tijd gewijzigd na de quote → quote_mismatch", async () => {
  for (const returnDepartureAt of [
    amsterdamDepartureIso("2099-03-12", "23:30")!, // dag → nacht (nachttarief zou ontlopen worden)
    amsterdamDepartureIso("2099-03-13", "18:00")!, // andere dag
    undefined, // retourmoment weggelaten
  ]) {
    const out = await resolveBookingPrice(retourReq({ returnDepartureAt }), deps(stored(RETOUR_FP)));
    assert.equal(errorOf(out), "quote_mismatch", String(returnDepartureAt));
  }
});

test("S3 engine: retour-quote gebruiken voor een enkele rit (of omgekeerd) → quote_mismatch", async () => {
  const single = await resolveBookingPrice(
    retourReq({ returnTrip: false, returnDepartureAt: undefined }),
    deps(stored(RETOUR_FP))
  );
  assert.equal(errorOf(single), "quote_mismatch");
  const singleFp = quoteFingerprint({ pickup: PICKUP, dropoff: DROPOFF, returnTrip: false, departureAt: DEP });
  const upgraded = await resolveBookingPrice(retourReq(), deps(stored(singleFp)));
  assert.equal(errorOf(upgraded), "quote_mismatch");
});

test("S3 engine: quoteId van een andere route (goedkopere rit) → quote_mismatch", async () => {
  const cheapFp = quoteFingerprint({ pickup: PICKUP, dropoff: "Almere Buiten, Almere", returnTrip: true, departureAt: DEP, returnDepartureAt: RET });
  const out = await resolveBookingPrice(retourReq(), deps(stored(cheapFp, { totalCents: 6000 })));
  assert.equal(errorOf(out), "quote_mismatch");
});

test("S3 engine: vingerafdruk is ongevoelig voor hoofdletters/leestekens maar niet voor de plaats", async () => {
  const same = await resolveBookingPrice(retourReq({ pickup: "  almere poort ALMERE " }), deps(stored(RETOUR_FP)));
  assert.equal(same.kind, "priced", "zelfde slug = zelfde rit");
  const other = await resolveBookingPrice(retourReq({ pickup: "Almere Poort, Amsterdam" }), deps(stored(RETOUR_FP)));
  assert.equal(errorOf(other), "quote_mismatch");
});

test("S3 engine: vervalgrens — expiresAt == nu is verlopen (gelijk aan SQL `expires_at <= now()`)", async () => {
  const atNow = await resolveBookingPrice(retourReq(), deps(stored(RETOUR_FP, { expiresAt: NOW.toISOString() })));
  assert.equal(errorOf(atNow), "quote_expired");
  const justBefore = await resolveBookingPrice(
    retourReq(),
    deps(stored(RETOUR_FP, { expiresAt: new Date(NOW.getTime() + 1).toISOString() }))
  );
  assert.equal(justBefore.kind, "priced");
});

test("S3 engine: passagiers/bagage zitten niet in de prijs — bedrag blijft gelijk, capaciteit bewaakt de RPC", async () => {
  for (const [passengers, luggage] of [[1, 0], [4, 2], [8, 3]] as const) {
    const out = await resolveBookingPrice(retourReq({ passengers, luggage }), deps(stored(RETOUR_FP)));
    assert.equal(out.kind === "priced" && out.priceEuros, 199.3, `${passengers}p/${luggage}k`);
  }
});

test("S3 engine (#87): gemanipuleerde priceBreakdown/event/korting op de request heeft geen effect", async () => {
  const dirty = {
    ...retourReq(),
    priceBreakdown: { subtotalCents: 100, totalCents: 100, adjustments: [{ kind: "night_return", amountCents: 0 }] },
    eventFeeCents: 0,
    discountCents: 19000,
    subtotalCents: 100,
    totalCents: 100,
  } as unknown as BookingPriceRequest;
  const out = await resolveBookingPrice(dirty, deps(stored(RETOUR_FP)));
  assert.equal(out.kind === "priced" && out.priceEuros, 199.3);
  assert.equal(out.kind === "priced" && out.pricingSource, "fixed_route_prices");
});

test("S3 engine: quoteId van alleen spaties → geen lock, routing UIT (geen bindende dynamische prijs)", async () => {
  let reads = 0;
  let allow: boolean | undefined;
  const out = await resolveBookingPrice(
    retourReq({ quoteId: "   " }),
    deps(stored(RETOUR_FP), {
      readSnapshot: async () => {
        reads++;
        return null;
      },
      computeQuote: async (input): Promise<PricingQuoteResult> => {
        allow = input.allowDistanceTariff;
        return { available: false, reason: "route_not_fixed", message: "Offerte op aanvraag", airport: NO_AIRPORT };
      },
    })
  );
  assert.equal(out.kind, "on_request");
  assert.equal(reads, 0);
  assert.equal(allow, false);
});

// ── 2. SQL-garanties (broncode-lock op de migraties) ──────────────────────────

const MIGRATIONS = "supabase/migrations";
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const defines = (fn: string) =>
  files.filter((f) => new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, "i").test(readFileSync(`${MIGRATIONS}/${f}`, "utf8")));
const LOCK_FILE = "20260820100000_fix_quote_lock_luggage_capacity.sql";
const lockSql = readFileSync(`${MIGRATIONS}/${LOCK_FILE}`, "utf8");
const body = lockSql.slice(lockSql.indexOf("as $function$"), lockSql.indexOf("$function$;"));
const at = (needle: string | RegExp) => {
  const i = typeof needle === "string" ? body.indexOf(needle) : body.search(needle);
  assert.ok(i >= 0, `ontbreekt in ${LOCK_FILE}: ${String(needle)}`);
  return i;
};

test("S3 SQL: de geteste migratie is de LAATSTE definitie van create_booking_from_snapshot", () => {
  assert.equal(defines("create_booking_from_snapshot").at(-1), LOCK_FILE);
});

test("S3 SQL: snapshot wordt rij-vergrendeld vóór elke controle (geen dubbele consumptie bij gelijktijdige POST's)", () => {
  assert.match(body, /from public\.price_snapshots\s+where quote_id = p_quote_id\s+for update;/);
  assert.ok(at("for update") < at("QUOTE_MISMATCH"));
});

test("S3 SQL: vingerafdruk wordt gecontroleerd VÓÓR de hergebruiktak (replay met andere rit krijgt de bestaande boeking niet)", () => {
  assert.match(body, /\(v_snap\.route_snapshot->>'fingerprint'\) is distinct from p_expected_fingerprint/);
  assert.ok(at("QUOTE_MISMATCH") < at("if v_snap.consumed_at is not null"));
});

test("S3 SQL: hergebruik na boeking geeft de BESTAANDE boeking terug (reused=true) en maakt geen tweede", () => {
  const reuse = at("return query select v_ref, v_id, v_price, true;");
  assert.ok(reuse < at("public.create_booking("), "hergebruiktak keert terug vóór create_booking");
  assert.match(body, /if v_snap\.booking_id is null then\s+raise exception 'QUOTE_CONSUMED_NO_BOOKING'/);
  assert.match(body, /set consumed_at = pg_catalog\.now\(\), booking_id = v_id\s+where quote_id = p_quote_id/);
  // Tweede vangnet: één boeking per quote_id (en nergens later gedropt).
  const lock0 = readFileSync(`${MIGRATIONS}/20260808111336_booking_quote_lock.sql`, "utf8");
  assert.match(lock0, /create unique index if not exists bookings_quote_id_key\s+on public\.bookings \(quote_id\) where quote_id is not null/);
  for (const f of files) {
    assert.doesNotMatch(readFileSync(`${MIGRATIONS}/${f}`, "utf8"), /drop index[^;]*bookings_quote_id_key/i, f);
  }
});

test("S3 SQL: verlopen en ongeldige bron worden in de DB opnieuw geweigerd (niet alleen in de app)", () => {
  assert.match(body, /if v_snap\.expires_at <= pg_catalog\.now\(\) then\s+raise exception 'QUOTE_EXPIRED'/);
  assert.match(body, /raise exception 'QUOTE_INVALID_SOURCE'/);
  assert.ok(at("QUOTE_EXPIRED") < at("public.create_booking("));
});

test("S3 SQL: bedrag uitsluitend uit snapshot.total_cents; de functie heeft geen prijsparameter", () => {
  const signature = lockSql.slice(lockSql.indexOf("create or replace function"), lockSql.indexOf("returns table"));
  assert.doesNotMatch(signature, /price|amount|total|cents|discount|korting/i);
  assert.match(body, /v_price := pg_catalog\.round\(v_snap\.total_cents::pg_catalog\.numeric \/ 100\.0, 2\);/);
  assert.match(body, /p_vehicle, p_persons, p_luggage, v_price,/);
});

test("S3 SQL ↔ route: elke quote-lock-fout uit de RPC heeft een nette mapping in de route", () => {
  const route = readFileSync("app/api/bookings/route.ts", "utf8");
  const raised = [...body.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]);
  assert.ok(raised.length >= 8);
  for (const code of new Set(raised)) assert.match(route, new RegExp(`\\b${code}:\\s*\\[`), `lockMap mist ${code}`);
  const start = route.indexOf('rpc("create_booking_from_snapshot"');
  const lockCall = route.slice(start, route.indexOf("if (error) {", start));
  assert.match(lockCall, /p_quote_id: lockedQuoteId/);
  assert.doesNotMatch(lockCall, /p_price|priceEuros|body\.(price|total|amount)/i);
});

// ── 3. Betaalbedrag = serversnapshot ───────────────────────────────────────────

test("S3 betaling: snapshot-cents → price_euros (numeric, 2 dec.) → PaymentIntent-cents is verliesvrij", () => {
  for (let cents = 1; cents <= 300_000; cents += 7) {
    const priceEuros = Number((cents / 100).toFixed(2)); // = round(total_cents/100.0, 2) via PostgREST-JSON
    const amount = bookingToAmount({
      bookingId: "11111111-1111-4111-8111-111111111111",
      bookingRef: "T4XI-2099-0001",
      priceEuros,
      paymentStatus: "unpaid",
      stripePaymentIntentId: null,
    });
    assert.ok(amount.ok);
    if (amount.ok && amount.amountCents !== cents) assert.fail(`${cents} → ${priceEuros} → ${amount.amountCents}`);
  }
  assert.equal(eurosToCents(199.3), 19930);
});

test("S3 betaling: create-intent-body kan geen bedrag, korting of breakdown meegeven", () => {
  const parsed = parsePaymentRequest({
    bookingId: "11111111-1111-4111-8111-111111111111",
    locale: "nl",
    total: 1,
    totalCents: 100,
    subtotalCents: 100,
    amountCents: 100,
    discount: 50,
    priceBreakdown: { totalCents: 100 },
    quoteId: QID,
  });
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.ok && Object.keys(parsed.value).sort(), ["bookingId", "locale"]);
  for (const forbidden of ["amount", "price", "currency"]) {
    assert.equal(parsePaymentRequest({ bookingId: "11111111-1111-4111-8111-111111111111", [forbidden]: 1 }).ok, false);
  }
});

// F-46 (docs/experience-2.0/baseline/findings.md): quoteId = uuidv7() met
// Math.random als bron (lib/pricing/engine.ts generateQuoteId ?? uuidv7). Impact is
// beperkt omdat een geraden quoteId alleen bruikbaar is met exact dezelfde rit
// (vingerafdruk), maar het is geen CSPRNG. Wordt een echte test met de fix.
test.todo("F-46: quoteId wordt gegenereerd met een cryptografische RNG (crypto.getRandomValues)");
