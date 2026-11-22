import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import {
  bookingRideKey,
  funnelKey,
  reportBookingStarted,
  reportPaymentCompleted,
  reportQuoteRequested,
  reportQuoteResult,
  resetFunnelForTests,
  type QuoteOutcome,
} from "./analytics-funnel";
import { reportQuoteVisible } from "../components/shared/useRouteQuote";

/**
 * Funnelmeting met lokale deduplicatie (PR #110, herzien 2026-11-22).
 * Nummering volgt de tien gevraagde scenario's uit de review.
 */

type Call = [string, string, Record<string, unknown>];

function makeStorage(opts: { throws?: boolean } = {}) {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => {
      if (opts.throws) throw new Error("blocked");
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (opts.throws) throw new Error("blocked");
      data.set(k, v);
    },
    data,
  };
}

function makeWindow(path = "/boeken", storage = makeStorage()) {
  const calls: Call[] = [];
  const w = {
    __t4xiStatisticsConsent: true as boolean | undefined,
    location: { pathname: path },
    sessionStorage: storage,
    gtag: (...args: unknown[]) => { calls.push(args as Call); },
  };
  return { w, calls, storage };
}

function withWindow<T>(w: unknown, run: () => T): T {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: w });
  try {
    return run();
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

const names = (calls: Call[]) => calls.map((c) => c[1]);
const shown: QuoteOutcome = { onRequest: false, airport: false, returnTrip: false, priceKind: "afstand", night: false };
const onReq: QuoteOutcome = { onRequest: true, airport: true, returnTrip: true, priceKind: "op_aanvraag" };

beforeEach(() => resetFunnelForTests());

// 1
test("1. twee verschillende ritten op dezelfde pagina tellen allebei", () => {
  const { w, calls } = makeWindow();
  withWindow(w, () => {
    reportQuoteRequested(funnelKey("rit-A"));
    reportQuoteResult(funnelKey("rit-A"), shown);
    reportQuoteRequested(funnelKey("rit-B"));
    reportQuoteResult(funnelKey("rit-B"), shown);
  });
  assert.deepEqual(names(calls), ["quote_requested", "quote_shown", "quote_requested", "quote_shown"]);
});

// 2
test("2. herhaalde identieke aanvragen tellen één keer", () => {
  const { w, calls } = makeWindow();
  withWindow(w, () => {
    for (let i = 0; i < 3; i += 1) reportQuoteRequested(funnelKey("zelfde-rit"));
  });
  assert.deepEqual(names(calls), ["quote_requested"]);
});

// 3
test("3. een geannuleerde debounce telt niet: melden gebeurt pas in de timer-callback", () => {
  const src = readFileSync("components/shared/useRouteQuote.ts", "utf8");
  const timer = src.indexOf("const timer = setTimeout(async () => {");
  const report = src.indexOf("if (reportFunnel) reportQuoteRequested(rideKey);");
  const cleanup = src.indexOf("clearTimeout(timer);");
  assert.ok(timer >= 0 && report > timer, "quote_requested staat binnen de debounce-callback");
  assert.ok(cleanup > report, "de cleanup annuleert de timer vóórdat er gemeld kan worden");
  // Vóór de timer (in de effect-body zelf) wordt niets gemeld.
  const effectStart = src.lastIndexOf("useEffect(() => {", timer);
  assert.doesNotMatch(src.slice(effectStart, timer), /reportQuoteRequested/);
});

// 4
test("4. gewijzigde prijsbepalende invoer is een nieuwe rit", () => {
  const base = { pickup: "Stationsplein 1, Almere", dropoff: "Schiphol", date: "2026-12-01", time: "06:00" };
  const k1 = bookingRideKey(base);
  for (const change of [
    { pickup: "Havenstraat 1, Huizen" },
    { dropoff: "Rotterdam Centraal" },
    { date: "2026-12-02" },
    { time: "06:15" },
  ]) {
    assert.notEqual(bookingRideKey({ ...base, ...change }), k1);
  }
  assert.notEqual(funnelKey(JSON.stringify({ luggage: "handbagage" })), funnelKey(JSON.stringify({ luggage: "1-2-koffers" })));
  assert.notEqual(funnelKey(JSON.stringify({ returnTrip: false })), funnelKey(JSON.stringify({ returnTrip: true })));
  const { w, calls } = makeWindow();
  withWindow(w, () => {
    reportQuoteRequested(funnelKey(JSON.stringify({ ...base, luggage: "handbagage" })));
    reportQuoteRequested(funnelKey(JSON.stringify({ ...base, luggage: "1-2-koffers" })));
  });
  assert.deepEqual(names(calls), ["quote_requested", "quote_requested"]);
});

// 5
test("5. rerenders en Strict Mode (dubbele effecten) geven geen extra events", () => {
  const { w, calls } = makeWindow();
  withWindow(w, () => {
    const key = funnelKey("rit-strict");
    // Strict Mode draait effecten twee keer; React-rerenders roepen het
    // zichtbaarheidseffect opnieuw aan met dezelfde quote.
    reportQuoteRequested(key);
    reportQuoteRequested(key);
    reportQuoteResult(key, shown);
    reportQuoteResult(key, shown);
    reportQuoteResult(key, shown);
  });
  assert.deepEqual(names(calls), ["quote_requested", "quote_shown"]);
});

test("5b. een quote zonder funnel-koppeling (bijv. idle of uit een andere bron) meldt niets", () => {
  const { w, calls } = makeWindow();
  withWindow(w, () => {
    reportQuoteVisible({ status: "idle" });
    reportQuoteVisible({ status: "onrequest", airport: { isTransfer: false, direction: null } });
  });
  assert.equal(calls.length, 0);
});

// 6
test("6. twee opeenvolgende resultaten met dezelfde status tellen allebei", () => {
  const { w, calls } = makeWindow("/tarieven");
  withWindow(w, () => {
    reportQuoteResult(funnelKey("rit-1"), onReq);
    reportQuoteResult(funnelKey("rit-2"), onReq);
  });
  assert.deepEqual(names(calls), ["quote_on_request", "quote_on_request"]);
});

test("6b. dezelfde rit op een andere pagina telt opnieuw", () => {
  const { w, calls } = makeWindow("/");
  withWindow(w, () => {
    reportQuoteRequested(funnelKey("rit-X"));
    w.location.pathname = "/boeken";
    reportQuoteRequested(funnelKey("rit-X"));
  });
  assert.deepEqual(names(calls), ["quote_requested", "quote_requested"]);
});

// 7
test("7. herhaalde betaalbevestiging (polling, remount, herladen) telt één keer", () => {
  const storage = makeStorage();
  const key = funnelKey("payment:booking-123");
  const first = makeWindow("/boeken", storage);
  withWindow(first.w, () => {
    reportPaymentCompleted(key, { value: 66, currency: "EUR" });
    reportPaymentCompleted(key, { value: 66, currency: "EUR" });
  });
  // "Remount"/herladen: nieuwe paginastatus, zelfde sessionStorage.
  resetFunnelForTests();
  const second = makeWindow("/boeken", storage);
  withWindow(second.w, () => reportPaymentCompleted(key, { value: 66, currency: "EUR" }));
  assert.deepEqual(names(first.calls), ["payment_completed"]);
  assert.equal(second.calls.length, 0);
  assert.deepEqual(first.calls[0]![2], { page_context: "boeken", lang: "nl", value: 66, currency: "EUR" });
});

test("7b. geblokkeerde opslag: deduplicatie valt terug op het geheugen", () => {
  const { w, calls } = makeWindow("/boeken", makeStorage({ throws: true }));
  withWindow(w, () => {
    reportPaymentCompleted("abc", { value: 1, currency: "EUR" });
    reportPaymentCompleted("abc", { value: 1, currency: "EUR" });
  });
  assert.deepEqual(names(calls), ["payment_completed"]);
});

test("booking_started telt één keer per rit over homepage, routezoeker en /boeken", () => {
  const storage = makeStorage();
  const ride = bookingRideKey({ pickup: "A", dropoff: "B", date: "2026-12-01", time: "06:00" });
  const home = makeWindow("/", storage);
  withWindow(home.w, () => reportBookingStarted(ride, { price_kind: "vaste_prijs" }));
  const boeken = makeWindow("/boeken", storage);
  withWindow(boeken.w, () => reportBookingStarted(ride, { trip_type: "enkel" }));
  const other = makeWindow("/boeken", storage);
  withWindow(other.w, () => reportBookingStarted(bookingRideKey({ pickup: "A", dropoff: "C", date: "2026-12-01", time: "06:00" })));
  assert.deepEqual(names(home.calls), ["booking_started"]);
  assert.equal(boeken.calls.length, 0);
  assert.deepEqual(names(other.calls), ["booking_started"]);
});

// 8
test("8. zonder of na intrekking van statistiektoestemming: niets verstuurd en niets gemarkeerd", () => {
  const { w, calls } = makeWindow();
  withWindow(w, () => {
    w.__t4xiStatisticsConsent = undefined;
    reportQuoteRequested("k1");
    reportQuoteResult("k1", shown);
    reportBookingStarted("k1");
    reportPaymentCompleted("k1", { value: 1, currency: "EUR" });
    w.__t4xiStatisticsConsent = false;
    reportQuoteRequested("k1");
    assert.equal(calls.length, 0);
    // Later toestemming: dezelfde rit wordt nu wél gemeld (niet eerder gemarkeerd).
    w.__t4xiStatisticsConsent = true;
    reportQuoteRequested("k1");
    reportQuoteResult("k1", shown);
  });
  assert.deepEqual(names(calls), ["quote_requested", "quote_shown"]);
});

// 9
test("9. /tarieven telt quote_requested alleen bij een geldige, volledige berekening", () => {
  const src = readFileSync("components/tarieven/RouteFinder.tsx", "utf8");
  assert.match(src, /if \(pickup && dropoff && detailsComplete\) reportQuoteRequested\(rideFingerprint\);/);
  assert.doesNotMatch(src, /track\("quote_requested"\)/);
  assert.match(src, /reportFunnel: false/);
  // Resultaat per rit, niet per status.
  assert.match(src, /const key = `\$\{rideFingerprint\}-\$\{view\}`;/);
});

// 10
test("10. geen persoonsgegevens of ritsleutels in de verstuurde events", () => {
  const { w, calls } = makeWindow("/en/boeken");
  const secretRide = JSON.stringify({ pickup: "Stationsplein 1, 1315KS Almere", date: "2026-12-01", time: "06:00" });
  const key = funnelKey(secretRide);
  withWindow(w, () => {
    reportQuoteRequested(key);
    reportQuoteResult(key, { ...shown, stops: 1 });
    reportBookingStarted(key, { trip_type: "enkel" });
    reportPaymentCompleted(key, { value: 66, currency: "EUR" });
  });
  const allowed = new Set(["page_context", "lang", "airport", "trip_type", "price_kind", "night", "stops", "value", "currency", "send_to"]);
  for (const [, , props] of calls) {
    for (const [k, v] of Object.entries(props ?? {})) {
      assert.ok(allowed.has(k), `onverwachte parameter ${k}`);
      assert.notEqual(v, key, "de lokale ritsleutel mag nooit mee");
      assert.doesNotMatch(String(v), /Almere|1315|2026-12|06:00/);
    }
  }
  assert.equal(calls[0]![2].lang, "en");
});

test("10b. de funnelhelpers in componenten krijgen nooit persoonsgegevens als parameter", () => {
  const files = [
    "components/tarieven/RouteFinder.tsx",
    "components/booking-sentence/SentencePattern.tsx",
    "components/booking/BookingSection.tsx",
    "components/booking/PaymentStep.tsx",
  ];
  const forbidden = /\b(pickup|dropoff|address|adres|postcode|email|phone|telefoon|naam|name|flight|vlucht|bookingId|bookingRef|quoteId|date|time|message)\s*:/i;
  let checked = 0;
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/report(?:BookingStarted|PaymentCompleted)\(/g)) {
      const end = src.indexOf(");", m.index);
      // De ritsleutel (bookingRideKey/funnelKey) gebruikt ritgegevens alleen
      // lokaal als hash; de rest van de aanroep zijn de GA4-parameters.
      const params = src
        .slice(m.index, end)
        .replace(/bookingRideKey\(\{[\s\S]*?\}\)/g, "")
        .replace(/funnelKey\([^)]*\)/g, "");
      checked += 1;
      assert.doesNotMatch(params, forbidden, `${file}: ${params.slice(0, 120)}`);
    }
  }
  assert.ok(checked >= 4, `verwacht minstens 4 aanroepen, gevonden ${checked}`);
});
