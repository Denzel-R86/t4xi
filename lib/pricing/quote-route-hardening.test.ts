import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POST as quote } from "@/app/api/pricing/quote/route";
import { resolveQuoteWith, type ResolveQuoteDeps } from "@/lib/pricing/service";

const routeSource = readFileSync("app/api/pricing/quote/route.ts", "utf8");
let requestSequence = 0;

function post(body: unknown, ip = `198.51.100.${++requestSequence}`): Request {
  return new Request("https://www.t4xi.nl/api/pricing/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function assertPrivateNoStore(response: Response): void {
  const value = response.headers.get("cache-control") ?? "";
  assert.match(value, /\bprivate\b/);
  assert.match(value, /\bno-store\b/);
}

test("quote: datum en tijd moeten samen worden aangeleverd", async () => {
  for (const extra of [{ date: "2026-08-10" }, { time: "08:00" }]) {
    const response = await quote(post({ pickup: "Amsterdam", dropoff: "Schiphol", ...extra }));
    assert.equal(response.status, 400);
    assertPrivateNoStore(response);
  }
});

test("quote: fout formaat, tijd en onbestaande kalenderdatum geven 400", async () => {
  for (const extra of [
    { date: "10-08-2026", time: "08:00" },
    { date: "2026-08-10", time: "99:99" },
    { date: "2026-02-31", time: "08:00" },
  ]) {
    const response = await quote(post({ pickup: "Amsterdam", dropoff: "Schiphol", ...extra }));
    assert.equal(response.status, 400);
    assertPrivateNoStore(response);
  }
});

test("quote: alle responsepaden lopen door de private/no-store helper", () => {
  assert.equal(routeSource.match(/NextResponse\.json/g)?.length, 1);
  assert.match(routeSource, /private, no-store, max-age=0/);
});

test("quote: body en adresvelden zijn begrensd vóór prijsberekening of logging", async () => {
  const oversized = await quote(post({ pickup: "x".repeat(9_000), dropoff: "Schiphol" }));
  assert.equal(oversized.status, 413);
  assertPrivateNoStore(oversized);
  const oversizedBody = await oversized.json();
  assert.equal(oversizedBody.error, "payload_too_large");
  assert.equal("price" in oversizedBody, false);
  assert.equal("quoteId" in oversizedBody, false);

  const longAddress = await quote(post({ pickup: "x".repeat(301), dropoff: "Schiphol" }));
  assert.equal(longAddress.status, 400);
  assertPrivateNoStore(longAddress);
  const longAddressBody = await longAddress.json();
  assert.match(longAddressBody.message, /maximaal 300 tekens/);
  assert.equal("price" in longAddressBody, false);
  assert.equal("quoteId" in longAddressBody, false);
});

test("quote: vehicleClass uit de publieke body wordt genegeerd en server-side vastgezet", async () => {
  assert.doesNotMatch(routeSource, /const \{[^}]*\bvehicleClass\b[^}]*\} = body/);
  assert.doesNotMatch(routeSource, /body(?:\.vehicleClass|\[\s*["']vehicleClass["']\s*\])/);
  assert.doesNotMatch(routeSource, /\.\.\.body\b/);
  assert.match(routeSource, /const PUBLIC_QUOTE_VEHICLE_CLASS = DEFAULT_VEHICLE_CLASS/);
  assert.match(routeSource, /vehicleClass: PUBLIC_QUOTE_VEHICLE_CLASS/);

  // Ook een bestaand alternatief (`business`), een verzonnen klasse en een
  // niet-string worden niet als publieke input geïnterpreteerd. Deze verzoeken
  // stranden alle drie op hetzelfde ontbrekende pickup-veld, nooit op klasse.
  for (const vehicleClass of ["business", "gratis-klasse", { code: "business" }]) {
    const response = await quote(post({ vehicleClass }));
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.message, /pickup/);
    assert.doesNotMatch(body.message, /vehicleClass/);
  }
});

test("pricing-service: onbekende interne voertuigklasse faalt vóór vaste-route- of Google-opzoeking", async () => {
  let fixedRouteCalls = 0;
  let routingCalls = 0;
  const deps: ResolveQuoteDeps = {
    findLocation: async (raw) => ({
      id: `${raw}-id`,
      slug: raw.toLowerCase(),
      name: raw,
      active: true,
      location_type: "district",
      city_id: null,
    }),
    findVehicleClass: async () => null,
    findFixedRoute: async () => {
      fixedRouteCalls += 1;
      return null;
    },
    getRoute: async () => {
      routingCalls += 1;
      return { distanceKm: 20, durationMin: 30 };
    },
  };

  const result = await resolveQuoteWith(
    { pickup: "Amsterdam", dropoff: "Schiphol", vehicleClass: "gratis-klasse" },
    deps
  );
  assert.equal(result.available, false);
  assert.equal(!result.available && result.reason, "invalid_input");
  assert.equal(fixedRouteCalls, 0);
  assert.equal(routingCalls, 0, "onbekende klassen mogen nooit een betaalde route-call bereiken");
});

// ── 2026-08-19 (audit PR #23): server-side afdwinging van datum/tijd/bagage ──
// bewijst dat het rechtstreeks aanroepen van de API (UI omzeild) NOOIT alsnog
// een prijs, quoteId of snapshot oplevert zonder deze drie geldige velden.

test("quote: ontbrekende bagagecategorie geeft 400, geen prijs", async () => {
  const response = await quote(
    post({ pickup: "Amsterdam", dropoff: "Schiphol", date: "2099-01-01", time: "10:00" })
  );
  assert.equal(response.status, 400);
  assertPrivateNoStore(response);
  const body = await response.json();
  assert.equal(body.available, false);
  assert.equal("price" in body, false);
  assert.equal("quoteId" in body, false);
});

test("quote: ongeldige bagagecategorie geeft 400 (niet stil terugvallen op een default)", async () => {
  for (const luggageCategory of ["", "extra-grote-bagage", "handbagage; drop table", null, 42]) {
    const response = await quote(
      post({ pickup: "Amsterdam", dropoff: "Schiphol", date: "2099-01-01", time: "10:00", luggageCategory })
    );
    assert.equal(response.status, 400, `luggageCategory=${JSON.stringify(luggageCategory)} moet 400 geven`);
  }
});

test("quote: retourstructuur is vóór de prijs-lock gelijk aan de boekingsvalidatie", async () => {
  const base = {
    pickup: "Amsterdam Centrum",
    dropoff: "Schiphol Airport",
    date: "2099-01-10",
    time: "09:00",
    luggageCategory: "handbagage",
  };
  const cases = [
    { ...base, returnTrip: true },
    {
      ...base,
      returnTrip: false,
      returnDate: "2099-01-11",
      returnTime: "10:00",
    },
    {
      ...base,
      returnTrip: true,
      returnDate: "2099-01-10",
      returnTime: "08:59",
    },
  ];

  for (const body of cases) {
    const response = await quote(post(body));
    assert.equal(response.status, 400);
    assertPrivateNoStore(response);
    const payload = await response.json();
    assert.equal("price" in payload, false);
    assert.equal("quoteId" in payload, false);
  }
});

test("quote: 'overleg' (offerte-op-aanvraag-bagage) is een GELDIGE, bewuste keuze — geen 400 op basis van bagage alleen", async () => {
  // 'overleg' is geen bindende categorie (zie lib/pricing/luggage.ts), maar wél
  // een bewuste, geldige keuze — mag dus niet op de bagage-check zelf stranden.
  const response = await quote(
    post({ pickup: "Amsterdam", dropoff: "Schiphol", date: "2099-01-01", time: "10:00", luggageCategory: "overleg" })
  );
  const body = await response.json();
  assert.equal(response.status, 404);
  assert.equal(body.available, false);
  assert.equal(body.message, "Offerte op aanvraag");
  assert.equal("price" in body, false);
  assert.equal("quoteId" in body, false);
});

test("quote: 4 passagiers + 3 koffers wordt handmatig beoordeeld en numerieke bagage-input wordt genegeerd", async () => {
  const response = await quote(post({
    pickup: "Amsterdam",
    dropoff: "Schiphol",
    date: "2099-01-01",
    time: "10:00",
    passengers: 4,
    luggage: 0,
    luggageCategory: "3-koffers",
  }));
  const body = await response.json();
  assert.equal(response.status, 404);
  assert.equal(body.available, false);
  assert.equal("price" in body, false);
  assert.equal("quoteId" in body, false);
  assert.doesNotMatch(routeSource, /const \{[^}]*\bluggage\b[^}]*\} = body/);
  assert.match(routeSource, /luggageClass\.kind === "binding" \? \{ luggage: luggageClass\.pieces \}/);
});

test("quote: geldige bagage, maar datum in het verleden → 400, geen prijs (bypass van de UI mag nooit een prijs opleveren)", async () => {
  const response = await quote(
    post({ pickup: "Amsterdam", dropoff: "Schiphol", date: "2020-01-01", time: "10:00", luggageCategory: "handbagage" })
  );
  assert.equal(response.status, 400);
  assertPrivateNoStore(response);
  const body = await response.json();
  assert.equal(body.available, false);
  assert.match(body.message, /verleden/);
  assert.equal("price" in body, false);
  assert.equal("quoteId" in body, false);
});

test("quote: gisteren (relatief t.o.v. nu) wordt geweigerd — bewijst dat de grens dynamisch is, geen hardcoded jaartal", async () => {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 2); // 2 dagen marge voor tijdzone-afronding rond middernacht
  const yyyy = yesterday.getUTCFullYear();
  const mm = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(yesterday.getUTCDate()).padStart(2, "0");
  const response = await quote(
    post({ pickup: "Amsterdam", dropoff: "Schiphol", date: `${yyyy}-${mm}-${dd}`, time: "10:00", luggageCategory: "handbagage" })
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.message, /verleden/);
});

// ── 2026-08-19 (audit-correctie): VOLLEDIG vertrekmoment (datum + tijd), niet ──
// alleen de datum — "vandaag, een uur geleden" moet net zo geweigerd worden
// als "gisteren". Testhulp zet een echt instant om naar Amsterdamse
// wandkloktijd-strings, puur om het testverzoek op te bouwen (géén tweede
// productie-tijdimplementatie — uitsluitend Intl, hier ter plekke).
function toAmsterdamDateTime(instant: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

test("quote: VANDAAG met een reeds VERSTREKEN tijd → 400 (datum alleen zou dit gemist hebben)", async () => {
  const { date, time } = toAmsterdamDateTime(new Date(Date.now() - 15 * 60 * 1000));
  const response = await quote(
    post({ pickup: "Amsterdam", dropoff: "Schiphol", date, time, luggageCategory: "handbagage" })
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.message, /verleden/);
  assert.equal("price" in body, false);
  assert.equal("quoteId" in body, false);
});

test("quote: VANDAAG met een toekomstige tijd → toegestaan (geen 'verleden'-afwijzing)", async () => {
  const { date, time } = toAmsterdamDateTime(new Date(Date.now() + 60 * 60 * 1000));
  const response = await quote(
    post({ pickup: "Amsterdam", dropoff: "Schiphol", date, time, luggageCategory: "handbagage" })
  );
  const body = await response.json().catch(() => ({}));
  assert.notEqual(response.status, 400, `verwacht geen 400 voor een toekomstig moment vandaag (kreeg: ${JSON.stringify(body)})`);
});

test("quote: MORGEN → toegestaan (geen 'verleden'-afwijzing)", async () => {
  const { date, time } = toAmsterdamDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const response = await quote(
    post({ pickup: "Amsterdam", dropoff: "Schiphol", date, time, luggageCategory: "handbagage" })
  );
  const body = await response.json().catch(() => ({}));
  assert.notEqual(response.status, 400, `verwacht geen 400 voor morgen (kreeg: ${JSON.stringify(body)})`);
});

test("quote: niet-bestaande Amsterdamse zomertijd-wandkloktijd (DST-overgang) → 400, fail-closed — niet stilzwijgend een ander instant kiezen", async () => {
  // 2027-03-28 02:30 bestaat niet in Amsterdam (klok springt 02:00 → 03:00).
  // amsterdamDepartureIso() geeft hiervoor al null (bestaand, getest gedrag) —
  // dit bewijst dat de route die weigering doorzet naar een 400, nooit een
  // prijs op basis van een geraden/verkeerd instant.
  const response = await quote(
    post({ pickup: "Amsterdam", dropoff: "Schiphol", date: "2027-03-28", time: "02:30", luggageCategory: "handbagage" })
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal("price" in body, false);
  assert.equal("quoteId" in body, false);
});

test("quote: vaste route (Amsterdam → Schiphol) is GEEN uitzondering op de volledige-vertrekmoment-check", async () => {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 2);
  const { date } = toAmsterdamDateTime(yesterday);
  const response = await quote(
    post({ pickup: "Amsterdam Centraal", dropoff: "Schiphol", date, time: "10:00", luggageCategory: "handbagage" })
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.message, /verleden/);
});

test("quote: maximaal 20 pogingen per minuut per IP; daarna 429 met Retry-After", async () => {
  const ip = "203.0.113.250";
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const response = await quote(post({}, ip));
    assert.equal(response.status, 400, `poging ${attempt} hoort nog door de limiter te komen`);
  }

  const limited = await quote(post({}, ip));
  assert.equal(limited.status, 429);
  assertPrivateNoStore(limited);
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
  const body = await limited.json();
  assert.equal(body.available, false);
  assert.equal(body.error, "rate_limited");
  assert.equal("price" in body, false);
  assert.equal("quoteId" in body, false);
});
