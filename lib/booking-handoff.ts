import { LUGGAGE_PIECES } from "@/lib/pricing/luggage";

/**
 * Handoff hero → /boeken zonder adressen in de URL (Experience 2.0 PR 2.3, masterplan §7).
 *
 * De zin schrijft de rit naar `sessionStorage` (per tabblad, weg bij sluiten) en
 * navigeert naar `/boeken?h=1`. Vrije adressen (mogelijk een woonadres) komen zo
 * nooit in browsergeschiedenis, serverlogs, analytics of Referer.
 *
 * Vertrouwen: storage is clientinvoer. Bij lezen wordt alles opnieuw gevalideerd en
 * wordt een vers object opgebouwd uit uitsluitend de bekende velden — een `price`
 * (of elk ander extra veld) in storage wordt dus nooit gelezen. Ongeldig, verlopen,
 * andere versie of onleesbaar → `null` (leeg formulier), nooit een exceptie.
 * De prijs op /boeken komt altijd uit `/api/pricing/quote`; `quoteId` is alleen
 * het bewijs dat er voor exact deze rit een server-quote was.
 */

export const HANDOFF_KEY = "t4xi:handoff:v1";
export const HANDOFF_VERSION = 1;
/** Doel van de "Bevestig"-knop zodra de zin compleet is. */
export const HANDOFF_HREF = "/boeken?h=1";
/**
 * = `QUOTE_TTL_MS` (lib/pricing/snapshot.ts, 15 min). Die module is SERVER-ONLY en
 * wordt daarom niet in de clientbundel geïmporteerd; `lib/booking-handoff.test.ts`
 * vergrendelt de gelijkheid, zodat een TTL-wijziging aan de serverkant deze test breekt.
 */
export const HANDOFF_TTL_MS = 15 * 60 * 1000;
/** Kleine klokscheefte die een `writtenAt` in de toekomst nog mag hebben. */
const MAX_CLOCK_SKEW_MS = 60 * 1000;

export type HandoffRide = {
  pickup: string;
  dropoff: string;
  date: string;
  time: string;
  persons: number;
  luggage: string;
  /** Server-quote-lock van de hero; `null` bij offerte op aanvraag of fout. */
  quoteId: string | null;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Opts = { storage?: StorageLike | null; now?: number };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const QUOTE_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const LUGGAGE = new Set([...Object.keys(LUGGAGE_PIECES), "overleg"]);

function address(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length >= 3 && s.length <= 200 && !CONTROL_RE.test(s) ? s : null;
}

/** Bouwt een gevalideerde rit uit onbekende invoer; alleen bekende velden. */
export function validateHandoffRide(input: unknown): HandoffRide | null {
  if (typeof input !== "object" || input === null) return null;
  const r = input as Record<string, unknown>;
  const pickup = address(r.pickup);
  const dropoff = address(r.dropoff);
  const { date, time, persons, luggage, quoteId } = r;
  if (!pickup || !dropoff) return null;
  if (typeof date !== "string" || !DATE_RE.test(date)) return null;
  if (typeof time !== "string" || !TIME_RE.test(time)) return null;
  if (typeof persons !== "number" || !Number.isInteger(persons) || persons < 1 || persons > 4) return null;
  if (typeof luggage !== "string" || !LUGGAGE.has(luggage)) return null;
  if (quoteId !== null && (typeof quoteId !== "string" || !QUOTE_ID_RE.test(quoteId))) return null;
  return { pickup, dropoff, date, time, persons, luggage, quoteId: quoteId ?? null };
}

/** Pure lezer: ruwe storage-waarde → rit, of `null`. */
export function parseHandoff(raw: string | null, now: number): HandoffRide | null {
  if (!raw || raw.length > 4096) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { v, writtenAt } = data as Record<string, unknown>;
  if (v !== HANDOFF_VERSION) return null;
  if (typeof writtenAt !== "number" || !Number.isFinite(writtenAt)) return null;
  if (writtenAt > now + MAX_CLOCK_SKEW_MS || now - writtenAt >= HANDOFF_TTL_MS) return null;
  return validateHandoffRide(data);
}

function sessionStore(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // storage geblokkeerd (bv. cookies uit)
  }
}

/** Schrijft de rit; `false` als de rit ongeldig is of storage niet werkt. */
export function writeHandoff(ride: HandoffRide, opts: Opts = {}): boolean {
  const valid = validateHandoffRide(ride);
  const storage = opts.storage === undefined ? sessionStore() : opts.storage;
  if (!valid || !storage) return false;
  try {
    storage.setItem(HANDOFF_KEY, JSON.stringify({ v: HANDOFF_VERSION, writtenAt: opts.now ?? Date.now(), ...valid }));
    return true;
  } catch {
    return false; // quota / private mode
  }
}

export function readHandoff(opts: Opts = {}): HandoffRide | null {
  const storage = opts.storage === undefined ? sessionStore() : opts.storage;
  if (!storage) return null;
  try {
    return parseHandoff(storage.getItem(HANDOFF_KEY), opts.now ?? Date.now());
  } catch {
    return null;
  }
}

/** Na een geslaagde boeking: de rit hoeft niet langer in het tabblad te staan. */
export function clearHandoff(opts: Opts = {}): void {
  const storage = opts.storage === undefined ? sessionStore() : opts.storage;
  try {
    storage?.removeItem(HANDOFF_KEY);
  } catch {
    // niets te doen
  }
}

/* ── Snapshot voor useSyncExternalStore (stabiele referentie per ruwe waarde) ── */
let cachedRaw: string | null | undefined;
let cachedRide: HandoffRide | null = null;
let cachedAt = 0;
/** Herbeoordeel de TTL periodiek, ook als de ruwe waarde gelijk bleef (terug in de geschiedenis). */
const SNAPSHOT_RECHECK_MS = 30 * 1000;

export function handoffSnapshot(): HandoffRide | null {
  const storage = sessionStore();
  let raw: string | null = null;
  try {
    raw = storage?.getItem(HANDOFF_KEY) ?? null;
  } catch {
    raw = null;
  }
  const now = Date.now();
  if (raw !== cachedRaw || now - cachedAt > SNAPSHOT_RECHECK_MS) {
    cachedRaw = raw;
    cachedAt = now;
    cachedRide = parseHandoff(raw, now);
  }
  return cachedRide;
}

/* ── Voorlopige prijs in het geheugen (géén storage) ──────────────────────────
 * Bij een client-side navigatie hero → /boeken leeft dezelfde JS-context door. De
 * hero onthoudt de prijs die de server zojuist voor `quoteId` gaf; /boeken mag die
 * als VOORLOPIG tonen terwijl de hook verifiërend herrekent (besluit eigenaar, #70).
 * Niets hiervan komt uit storage: na een herlaadactie is het geheugen leeg en wacht
 * /boeken gewoon op de server. Boeken kan alleen op de quote van de hook. */
export type ShownPrice = { price: number; expiresAt: number };
let shown: ({ quoteId: string } & ShownPrice) | null = null;

/** `now` = moment waarop de server de prijs gaf; de quote verloopt na de quote-TTL. */
export function rememberShownPrice(quoteId: string, price: number, now: number = Date.now()): void {
  shown = Number.isFinite(price) && price > 0 ? { quoteId, price, expiresAt: now + HANDOFF_TTL_MS } : null;
}

export function shownPriceFor(quoteId: string | null, now: number = Date.now()): ShownPrice | null {
  if (!quoteId || shown?.quoteId !== quoteId || now >= shown.expiresAt) return null;
  return { price: shown.price, expiresAt: shown.expiresAt };
}

type RideFields = Omit<HandoffRide, "quoteId"> & { returnTrip: boolean };

/** Is de rit nog exact die uit de hero (enkele rit, zelfde velden)? */
export function handoffRideUnchanged(
  initial: Partial<Omit<RideFields, "returnTrip">>,
  current: Partial<RideFields>
): boolean {
  if (current.returnTrip) return false;
  const keys = ["pickup", "dropoff", "date", "time", "persons", "luggage"] as const;
  return keys.every((k) => initial[k] !== undefined && initial[k] === current[k]);
}

export type QuoteOutcome =
  | { status: "idle" | "loading" }
  | { status: "ready"; price: number }
  | { status: "onrequest" | "error" };

/**
 * Voorlopige prijs: alléén zolang de server voor deze rit nog níét geantwoord heeft
 * (`settled` = de hook gaf al ooit een uitkomst — ready, onrequest of error — sinds
 * /boeken opende), de rit ongewijzigd is en de onthouden quote niet verlopen is.
 * Eenmaal vervallen komt hij nooit terug. Anders `null`: alleen de server telt.
 */
export function provisionalPrice(opts: {
  shown: ShownPrice | null | undefined;
  now: number;
  settled: boolean;
  rideUnchanged: boolean;
  quote: QuoteOutcome;
}): number | null {
  const { shown: s, now, settled, rideUnchanged, quote } = opts;
  if (!s || settled || !rideUnchanged || now >= s.expiresAt) return null;
  return quote.status === "idle" || quote.status === "loading" ? s.price : null;
}

/**
 * Melding "prijs bijgewerkt": de server antwoordde voor dezelfde rit met een ánder
 * bedrag dan de hero toonde. De getoonde prijs is dan al die van de server.
 */
export function priceWasUpdated(opts: {
  shown: ShownPrice | null | undefined;
  rideUnchanged: boolean;
  quote: QuoteOutcome;
}): boolean {
  const { shown: s, rideUnchanged, quote } = opts;
  return s != null && rideUnchanged && quote.status === "ready" && quote.price !== s.price;
}
