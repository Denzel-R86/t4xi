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
      () => track("routezoeker_gestart"),
    );
    assert.deepEqual(dataLayer, []);
    assert.equal(plausibleCalls, 0);
  }
});

test("analytics-events worden uitsluitend met actuele statistiektoestemming verstuurd", () => {
  const dataLayer: Array<Record<string, unknown>> = [];
  const windowValue: TestWindow = { __t4xiStatisticsConsent: true, dataLayer };
  withWindow(windowValue, () => {
    track("prijs_gevonden", { airport: true });
    windowValue.__t4xiStatisticsConsent = false;
    track("boeking_geklikt");
  });
  assert.deepEqual(dataLayer, [{ event: "prijs_gevonden", airport: true }]);
});

test("intrekken blokkeert ook een reeds aanwezige Plausible-provider", () => {
  const events: string[] = [];
  const windowValue: TestWindow = {
    __t4xiStatisticsConsent: true,
    plausible: (event) => events.push(event),
  };
  withWindow(windowValue, () => {
    track("routezoeker_gestart");
    windowValue.__t4xiStatisticsConsent = false;
    track("boeking_voltooid");
  });
  assert.deepEqual(events, ["routezoeker_gestart"]);
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
  withWindow(windowValue, () => track("prijs_gevonden", { airport: true, stops: 0 }));
  assert.deepEqual(calls, [["event", "prijs_gevonden", { airport: true, stops: 0 }]]);
  assert.deepEqual(dataLayer, []);
});

test("gtag-events blijven uit zonder of na intrekking van statistiektoestemming", () => {
  const calls: unknown[][] = [];
  const windowValue: GtagWindow = {
    __t4xiStatisticsConsent: false,
    gtag: (...args: unknown[]) => { calls.push(args); },
  };
  withWindow(windowValue, () => {
    track("boeking_geklikt");
    windowValue.__t4xiStatisticsConsent = undefined;
    track("boeking_voltooid");
  });
  assert.deepEqual(calls, []);
});

test("een gtag die gooit breekt de gebruikersflow nooit", () => {
  const windowValue: GtagWindow = {
    __t4xiStatisticsConsent: true,
    gtag: () => { throw new Error("gtag kapot"); },
  };
  assert.doesNotThrow(() => withWindow(windowValue, () => track("prijs_gevonden")));
});
