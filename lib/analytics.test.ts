import assert from "node:assert/strict";
import test from "node:test";
import { track } from "./analytics";

type TestWindow = {
  __t4xiStatisticsConsent?: boolean;
  plausible?: (event: string, options?: unknown) => void;
  dataLayer?: Array<Record<string, unknown>>;
};

function withWindow(windowValue: TestWindow, run: () => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowValue });
  try {
    run();
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("analytics-events blijven uit zonder keuze of zonder statistiektoestemming", () => {
  for (const consent of [undefined, false]) {
    const dataLayer: Array<Record<string, unknown>> = [];
    let plausibleCalls = 0;
    withWindow(
      {
        __t4xiStatisticsConsent: consent,
        dataLayer,
        plausible: () => { plausibleCalls += 1; },
      },
      () => track("quote_requested"),
    );
    assert.deepEqual(dataLayer, []);
    assert.equal(plausibleCalls, 0);
  }
});

test("analytics-events worden uitsluitend met actuele statistiektoestemming verstuurd", () => {
  const dataLayer: Array<Record<string, unknown>> = [];
  const windowValue: TestWindow = { __t4xiStatisticsConsent: true, dataLayer };
  withWindow(windowValue, () => {
    track("quote_shown", { airport: true });
    windowValue.__t4xiStatisticsConsent = false;
    track("booking_started");
  });
  assert.deepEqual(dataLayer, [{ event: "quote_shown", airport: true }]);
});

test("intrekken blokkeert ook een reeds aanwezige Plausible-provider", () => {
  const events: string[] = [];
  const windowValue: TestWindow = {
    __t4xiStatisticsConsent: true,
    plausible: (event) => events.push(event),
  };
  withWindow(windowValue, () => {
    track("quote_requested");
    windowValue.__t4xiStatisticsConsent = false;
    track("booking_submitted");
  });
  assert.deepEqual(events, ["quote_requested"]);
});

// ── GA4 rechtstreeks via gtag (2026-11-21) ──────────────────────────────────
// Empirisch vastgesteld: zonder GTM bereikt een los `{ event }`-object in de
// dataLayer GA4 niet. Met een geladen gtag moet track() dus `gtag('event', …)`
// aanroepen en géén object meer in de dataLayer zetten.

type GtagWindow = TestWindow & { gtag?: (...args: unknown[]) => void };

test("met gtag aanwezig gaat een event via gtag('event'), niet als dataLayer-object", () => {
  const calls: unknown[][] = [];
  const dataLayer: Array<Record<string, unknown>> = [];
  const windowValue: GtagWindow = {
    __t4xiStatisticsConsent: true,
    dataLayer,
    gtag: (...args: unknown[]) => { calls.push(args); },
  };
  withWindow(windowValue, () => track("quote_shown", { airport: true, stops: 0 }));
  assert.deepEqual(calls, [["event", "quote_shown", { airport: true, stops: 0 }]]);
  assert.deepEqual(dataLayer, []);
});

test("gtag-events blijven uit zonder of na intrekking van statistiektoestemming", () => {
  const calls: unknown[][] = [];
  const windowValue: GtagWindow = {
    __t4xiStatisticsConsent: false,
    gtag: (...args: unknown[]) => { calls.push(args); },
  };
  withWindow(windowValue, () => {
    track("booking_started");
    windowValue.__t4xiStatisticsConsent = undefined;
    track("booking_submitted");
  });
  assert.deepEqual(calls, []);
});

test("een gtag die gooit breekt de gebruikersflow nooit", () => {
  const windowValue: GtagWindow = {
    __t4xiStatisticsConsent: true,
    gtag: () => { throw new Error("gtag kapot"); },
  };
  assert.doesNotThrow(() => withWindow(windowValue, () => track("quote_shown")));
});

// ── Funnelmeting (meetplan Fase 6, 2026-11-22) ─────────────────────────────
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { classifyContactHref, pageContextFor, priceKindFor } from "./analytics";
import { reportQuoteRequested, reportQuoteResult, resetQuoteReportingForTests } from "../components/shared/useRouteQuote";

test("pageContextFor: paginacategorie en taal zonder persoonsgegevens", () => {
  assert.deepEqual(pageContextFor("/"), { page_context: "home", lang: "nl" });
  assert.deepEqual(pageContextFor("/en"), { page_context: "home", lang: "en" });
  assert.deepEqual(pageContextFor("/tarieven"), { page_context: "tarieven", lang: "nl" });
  assert.deepEqual(pageContextFor("/en/boeken"), { page_context: "boeken", lang: "en" });
  assert.deepEqual(pageContextFor("/contact"), { page_context: "contact", lang: "nl" });
  assert.deepEqual(pageContextFor("/zakelijk-vervoer"), { page_context: "zakelijk", lang: "nl" });
  assert.deepEqual(pageContextFor("/taxi-almere-schiphol"), { page_context: "landingspagina", lang: "nl" });
  assert.deepEqual(pageContextFor("/over-ons"), { page_context: "overig", lang: "nl" });
});

test("classifyContactHref: alleen het linktype, nooit het nummer", () => {
  assert.equal(classifyContactHref("tel:+31634744522"), "phone_click");
  assert.equal(classifyContactHref("https://wa.me/31634744522?text=hoi"), "whatsapp_click");
  assert.equal(classifyContactHref("https://api.whatsapp.com/send?phone=31"), "whatsapp_click");
  assert.equal(classifyContactHref("whatsapp://send?phone=31"), "whatsapp_click");
  assert.equal(classifyContactHref("https://g.page/r/abc/review"), "review_click");
  assert.equal(classifyContactHref("https://search.google.com/local/writereview?placeid=x"), "review_click");
  assert.equal(classifyContactHref("mailto:booking@t4xi.nl"), null);
  assert.equal(classifyContactHref("/boeken"), null);
  assert.equal(classifyContactHref("https://example.com/wa.me/"), null);
  assert.equal(classifyContactHref(null), null);
});

test("priceKindFor vertaalt de bron naar een categorie", () => {
  assert.equal(priceKindFor("fixed_route_prices", false), "vaste_route");
  assert.equal(priceKindFor("distance_tariff", false), "afstand");
  assert.equal(priceKindFor("distance_tariff", true), "op_aanvraag");
  assert.equal(priceKindFor(undefined, false), "onbekend");
});

test("track voegt page_context en lang toe als er een locatie is", () => {
  const calls: unknown[][] = [];
  const w = {
    __t4xiStatisticsConsent: true,
    location: { pathname: "/en/tarieven" },
    gtag: (...args: unknown[]) => { calls.push(args); },
  };
  withWindow(w as TestWindow, () => track("quote_shown", { airport: false }));
  assert.deepEqual(calls, [["event", "quote_shown", { page_context: "tarieven", lang: "en", airport: false }]]);
});

test("quote-hook meldt één quote_requested per pagina en één resultaat per unieke rit", () => {
  resetQuoteReportingForTests();
  const calls: unknown[][] = [];
  const w = {
    __t4xiStatisticsConsent: true,
    location: { pathname: "/boeken" },
    gtag: (...args: unknown[]) => { calls.push(args); },
  };
  withWindow(w as TestWindow, () => {
    reportQuoteRequested();
    reportQuoteRequested();
    reportQuoteResult("rit-A", { onRequest: false, source: "distance_tariff", airport: false, returnTrip: false, night: false });
    reportQuoteResult("rit-A", { onRequest: false, source: "distance_tariff", airport: false, returnTrip: false, night: false });
    reportQuoteResult("rit-B", { onRequest: true, airport: true, returnTrip: true });
  });
  const names = calls.map((c) => c[1]);
  assert.deepEqual(names, ["quote_requested", "quote_shown", "quote_on_request"]);
  assert.deepEqual(calls[1]![2], { page_context: "boeken", lang: "nl", airport: false, trip_type: "enkel", price_kind: "afstand", night: false });
  assert.deepEqual(calls[2]![2], { page_context: "boeken", lang: "nl", airport: true, trip_type: "retour", price_kind: "op_aanvraag" });
});

test("geen enkel track()-event in de code geeft persoonsgegevens mee", () => {
  const forbidden = /\b(pickup|dropoff|address|adres|postcode|email|phone|telefoon|naam|name|flight|vlucht|bookingId|bookingRef|quoteId|date|time|message)\s*:/i;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(p) && !/\.test\./.test(p)) files.push(p);
    }
  };
  walk("components");
  let checked = 0;
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\btrack\(\s*"[a-z_]+"\s*(?:,\s*\{([\s\S]*?)\})?\s*\)/g)) {
      checked += 1;
      assert.doesNotMatch(m[1] ?? "", forbidden, `${file}: ${m[0].slice(0, 120)}`);
    }
  }
  assert.ok(checked >= 8, `verwacht minstens 8 track()-aanroepen, gevonden ${checked}`);
});
