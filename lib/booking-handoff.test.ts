import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { QUOTE_TTL_MS } from "@/lib/pricing/snapshot";
import {
  HANDOFF_HREF,
  HANDOFF_KEY,
  HANDOFF_TTL_MS,
  parseHandoff,
  priceWhileVerifying,
  readHandoff,
  rememberShownPrice,
  shownPriceFor,
  writeHandoff,
  clearHandoff,
  type HandoffRide,
} from "./booking-handoff";

// PR 2.3 (masterplan §7): handoff hero → /boeken via sessionStorage.

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: () => m.get(HANDOFF_KEY) ?? null,
  };
}

const RIDE: HandoffRide = {
  pickup: "Testlaan 1, Almere",
  dropoff: "Schiphol",
  date: "2026-11-12",
  time: "14:30",
  persons: 2,
  luggage: "1-2-koffers",
  quoteId: "q_abc-123",
};
const T0 = Date.UTC(2026, 9, 1, 8, 0, 0);

test("TTL = quote-TTL van de server (lib/pricing/snapshot.ts)", () => {
  assert.equal(HANDOFF_TTL_MS, QUOTE_TTL_MS);
  assert.equal(HANDOFF_KEY, "t4xi:handoff:v1");
  assert.equal(HANDOFF_HREF, "/boeken?h=1");
});

test("round-trip: schrijven → lezen geeft exact dezelfde rit", () => {
  const storage = memoryStorage();
  assert.equal(writeHandoff(RIDE, { storage, now: T0 }), true);
  assert.deepEqual(readHandoff({ storage, now: T0 + 1000 }), RIDE);
  const stored = JSON.parse(storage.raw()!);
  assert.equal(stored.v, 1);
  assert.equal(stored.writtenAt, T0);
  assert.equal("price" in stored, false, "er staat nooit een prijs in storage");
});

test("quoteId null (offerte op aanvraag) blijft geldig", () => {
  const storage = memoryStorage();
  writeHandoff({ ...RIDE, quoteId: null }, { storage, now: T0 });
  assert.equal(readHandoff({ storage, now: T0 })?.quoteId, null);
});

test("verlopen TTL → leeg; net binnen de TTL → geldig", () => {
  const storage = memoryStorage();
  writeHandoff(RIDE, { storage, now: T0 });
  assert.ok(readHandoff({ storage, now: T0 + HANDOFF_TTL_MS - 1 }));
  assert.equal(readHandoff({ storage, now: T0 + HANDOFF_TTL_MS }), null);
  // writtenAt ver in de toekomst (geknoeid) → leeg
  assert.equal(readHandoff({ storage, now: T0 - 5 * 60 * 1000 }), null);
});

test("gemanipuleerde storage: prijs en extra velden worden genegeerd", () => {
  const raw = JSON.stringify({ v: 1, writtenAt: T0, ...RIDE, price: 1, amount: "€ 1,00", isAdmin: true });
  const ride = parseHandoff(raw, T0);
  assert.deepEqual(ride, RIDE);
  assert.equal(Object.keys(ride!).sort().join(","), "date,dropoff,luggage,persons,pickup,quoteId,time");
});

test("gemanipuleerde storage: ongeldige velden → leeg, nooit een exceptie", () => {
  const base = { v: 1, writtenAt: T0, ...RIDE };
  const bad: unknown[] = [
    "{niet-json",
    "null",
    "42",
    "[]",
    JSON.stringify({ ...base, pickup: "ab" }),
    JSON.stringify({ ...base, pickup: "x".repeat(201) }),
    JSON.stringify({ ...base, dropoff: "Schip\u0000hol" }),
    JSON.stringify({ ...base, date: "12-11-2026" }),
    JSON.stringify({ ...base, time: "25:00" }),
    JSON.stringify({ ...base, persons: 5 }),
    JSON.stringify({ ...base, persons: "2" }),
    JSON.stringify({ ...base, luggage: "kist" }),
    JSON.stringify({ ...base, quoteId: "<script>" }),
    JSON.stringify({ ...base, quoteId: undefined }),
    JSON.stringify({ ...base, writtenAt: "nu" }),
    "x".repeat(5000),
  ];
  for (const raw of bad) assert.equal(parseHandoff(raw as string, T0), null, String(raw).slice(0, 60));
  assert.equal(parseHandoff(null, T0), null);
});

test("versie-mismatch → leeg", () => {
  for (const v of [0, 2, "1", undefined]) {
    assert.equal(parseHandoff(JSON.stringify({ ...RIDE, v, writtenAt: T0 }), T0), null);
  }
});

test("storage weigert (quota/geblokkeerd) → write false, read null, geen crash", () => {
  const broken = {
    getItem: () => { throw new Error("SecurityError"); },
    setItem: () => { throw new Error("QuotaExceededError"); },
    removeItem: () => { throw new Error("SecurityError"); },
  };
  assert.equal(writeHandoff(RIDE, { storage: broken }), false);
  assert.equal(readHandoff({ storage: broken }), null);
  assert.doesNotThrow(() => clearHandoff({ storage: broken }));
  assert.equal(writeHandoff(RIDE, { storage: null }), false);
  // Ongeldige rit wordt niet weggeschreven
  const storage = memoryStorage();
  assert.equal(writeHandoff({ ...RIDE, persons: 9 }, { storage }), false);
  assert.equal(storage.raw(), null);
});

test("clearHandoff verwijdert de rit", () => {
  const storage = memoryStorage();
  writeHandoff(RIDE, { storage, now: T0 });
  clearHandoff({ storage });
  assert.equal(readHandoff({ storage, now: T0 }), null);
});

test("prijs in geheugen alleen voor exact dezelfde quoteId", () => {
  rememberShownPrice("q_abc-123", 89);
  assert.equal(shownPriceFor("q_abc-123"), 89);
  assert.equal(shownPriceFor("q_other"), null);
  assert.equal(shownPriceFor(null), null);
  rememberShownPrice("q_x", Number.NaN);
  assert.equal(shownPriceFor("q_x"), null);
});

test("prijs tijdens verificatie: alleen ongewijzigde enkele rit en alleen tot de hook antwoordt", () => {
  const initial = { pickup: RIDE.pickup, dropoff: RIDE.dropoff, date: RIDE.date, time: RIDE.time, persons: 2, luggage: RIDE.luggage };
  const current = { ...initial, returnTrip: false };
  assert.equal(priceWhileVerifying({ price: 89, initial, current, quoteStatus: "loading" }), 89);
  assert.equal(priceWhileVerifying({ price: 89, initial, current, quoteStatus: "idle" }), 89);
  for (const status of ["ready", "onrequest", "error"]) {
    assert.equal(priceWhileVerifying({ price: 89, initial, current, quoteStatus: status }), null, status);
  }
  assert.equal(priceWhileVerifying({ price: 89, initial, current: { ...current, persons: 3 }, quoteStatus: "loading" }), null);
  assert.equal(priceWhileVerifying({ price: 89, initial, current: { ...current, returnTrip: true }, quoteStatus: "loading" }), null);
  assert.equal(priceWhileVerifying({ price: null, initial, current, quoteStatus: "loading" }), null);
  // Zonder handoff-beginwaarden (gewone deep-link) nooit een prijs
  assert.equal(priceWhileVerifying({ price: 89, initial: {}, current: {}, quoteStatus: "loading" }), null);
});

test("lock: SentencePattern zet geen vrij adres meer in de href", () => {
  const src = readFileSync("components/booking-sentence/SentencePattern.tsx", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /[?&](pickup|dropoff|van|naar)=/, "geen adres-queryparameter in de zin");
  assert.doesNotMatch(code, /encodeURIComponent\(\s*(pickup|dropoff|from|to)/);
  assert.match(code, /const href = quoteReady && pickup && dropoff \? HANDOFF_HREF : confirmHref;/);
  assert.match(code, /writeHandoff\(\{/);
  assert.match(code, /router\.push\(HANDOFF_HREF\)/);
});

test("lock: /boeken leest de handoff alleen met ?h=1 en behoudt de publieke deep-links", () => {
  const page = readFileSync("app/[locale]/boeken/page.tsx", "utf8");
  assert.match(page, /fromHandoff=\{first\(query\?\.h\) === "1"\}/);
  assert.match(page, /first\(query\?\.pickup\) \?\? first\(query\?\.van\)/);
  assert.match(page, /first\(query\?\.dropoff\) \?\? first\(query\?\.naar\)/);
  const entry = readFileSync("components/booking/handoff/BookingEntry.tsx", "utf8");
  assert.match(entry, /if \(!ride\) return <BookingSection key="query" \{\.\.\.queryProps\} \/>;/);
  assert.doesNotMatch(entry, /\bprice:\s*ride\./, "prijs nooit uit storage");
});

test("view transition: alleen bij ondersteuning en zonder reduced motion, 250ms", () => {
  const css = readFileSync("components/booking/handoff/handoff.css", "utf8");
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*@view-transition \{\s*navigation: auto;/);
  assert.match(css, /@supports \(view-transition-name: none\)/);
  assert.match(css, /--hx-handoff: 250ms;/);
  const vt = readFileSync("components/booking/handoff/view-transition.ts", "utf8");
  assert.match(vt, /prefers-reduced-motion: reduce/);
  assert.match(vt, /typeof doc\.startViewTransition !== "function"/);
});
