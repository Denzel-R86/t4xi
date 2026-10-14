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
 *
 * v2 (F-31): optioneel retour (`returnTrip: true` + `returnDate` + `returnTime`), zodat
 * ook een retour uit de RouteFinder zonder adres of retourmoment in de URL naar /boeken
 * gaat. Geschreven wordt altijd v2 onder `HANDOFF_KEY`; een v1-item (onder de oude
 * sleutel, uit een tabblad van vóór de uitrol) wordt nog gelezen als enkele rit.
 */

export const HANDOFF_KEY = "t4xi:handoff:v2";
/** v1-sleutel: alleen nog lezen (achterwaartse compatibiliteit) en opruimen. */
export const LEGACY_HANDOFF_KEY = "t4xi:handoff:v1";
export const HANDOFF_VERSION = 2;
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

type HandoffBase = {
  pickup: string;
  dropoff: string;
  date: string;
  time: string;
  persons: number;
  luggage: string;
  /** Server-quote-lock van de hero; `null` bij offerte op aanvraag of fout. */
  quoteId: string | null;
};
/** Retourdeel (v2). Een enkele rit heeft deze velden niet (of `returnTrip: false` bij schrijven). */
export type HandoffReturn = { returnTrip: true; returnDate: string; returnTime: string };
export type HandoffRide = HandoffBase & (HandoffReturn | { returnTrip?: false });

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

/**
 * Bouwt een gevalideerde rit uit onbekende invoer; alleen bekende velden.
 * Een enkele rit krijgt géén retourvelden (ook niet als er losse `returnDate`/
 * `returnTime` in de invoer staan); een retour vereist een geldige datum én tijd.
 */
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
  const base: HandoffBase = { pickup, dropoff, date, time, persons, luggage, quoteId: quoteId ?? null };
  const { returnTrip, returnDate, returnTime } = r;
  if (returnTrip === undefined || returnTrip === false) return base;
  if (returnTrip !== true) return null;
  if (typeof returnDate !== "string" || !DATE_RE.test(returnDate)) return null;
  if (typeof returnTime !== "string" || !TIME_RE.test(returnTime)) return null;
  return { ...base, returnTrip: true, returnDate, returnTime };
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
  if (v !== HANDOFF_VERSION && v !== 1) return null;
  if (typeof writtenAt !== "number" || !Number.isFinite(writtenAt)) return null;
  if (writtenAt > now + MAX_CLOCK_SKEW_MS || now - writtenAt >= HANDOFF_TTL_MS) return null;
  if (v === 1) {
    // v1 kende geen retour: eventuele retourvelden worden genegeerd → enkele rit.
    return validateHandoffRide({ ...(data as Record<string, unknown>), returnTrip: false });
  }
  return validateHandoffRide(data);
}

/** Ruwe waarde: v2 eerst, anders een v1-item van vóór de uitrol. */
function readRaw(storage: StorageLike): string | null {
  return storage.getItem(HANDOFF_KEY) ?? storage.getItem(LEGACY_HANDOFF_KEY);
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
    storage.removeItem(LEGACY_HANDOFF_KEY);
    return true;
  } catch {
    return false; // quota / private mode
  }
}

export function readHandoff(opts: Opts = {}): HandoffRide | null {
  const storage = opts.storage === undefined ? sessionStore() : opts.storage;
  if (!storage) return null;
  try {
    return parseHandoff(readRaw(storage), opts.now ?? Date.now());
  } catch {
    return null;
  }
}

/**
 * Na een geslaagde boeking (of als een nieuwe rit niet geschreven kan worden): de
 * rit hoeft niet langer in het tabblad te staan. Ruimt v2 én v1 op.
 */
export function clearHandoff(opts: Opts = {}): void {
  const storage = opts.storage === undefined ? sessionStore() : opts.storage;
  for (const key of [HANDOFF_KEY, LEGACY_HANDOFF_KEY]) {
    try {
      storage?.removeItem(key);
    } catch {
      // niets te doen
    }
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
    raw = storage ? readRaw(storage) : null;
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

type RideFields = Omit<HandoffBase, "quoteId"> & { returnTrip: boolean; returnDate: string; returnTime: string };

/**
 * Is de rit nog exact die uit de handoff? Zelfde velden én zelfde ritsoort; bij een
 * retour ook hetzelfde retourmoment (v2). Een enkele rit die retour wordt (of
 * andersom) is een andere rit.
 */
export function handoffRideUnchanged(
  initial: Partial<RideFields>,
  current: Partial<RideFields>
): boolean {
  const keys = ["pickup", "dropoff", "date", "time", "persons", "luggage"] as const;
  if (!keys.every((k) => initial[k] !== undefined && initial[k] === current[k])) return false;
  if (Boolean(initial.returnTrip) !== Boolean(current.returnTrip)) return false;
  if (!current.returnTrip) return true;
  return (["returnDate", "returnTime"] as const).every((k) => initial[k] !== undefined && initial[k] === current[k]);
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
