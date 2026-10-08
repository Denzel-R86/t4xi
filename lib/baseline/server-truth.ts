/**
 * Experience 2.0 — PR 0.4a "Server truth": pure aggregatie van de
 * quote → booking → payment-funnel per ISO-week.
 *
 * Geen IO, geen database, geen env. Het rapportagescript
 * (`scripts/baseline/server-truth.ts`) leest read-only uit productie, zet de
 * rijen om naar de types hieronder en roept deze functies aan. Alles wat dit
 * module verlaat is een aggregaat: geen namen, e-mails, telefoonnummers,
 * adressen of boekingsreferenties.
 *
 * Definities (zie ook docs/experience-2.0/baseline/0.4a-server-truth.md):
 * - quote   = rij in `price_snapshots` (bindende, opgeslagen prijs die de klant
 *             te zien kreeg). Secundair: `pricing_quote_logs` (elke berekening,
 *             ook "op aanvraag" en ook de herberekening bij het boeken).
 * - booking = rij in `bookings` die niet als test is herkend.
 * - betaald = `payment_status = 'paid'` én `paid_at` gevuld.
 */

export const REPORT_TIME_ZONE = "Europe/Amsterdam";

/** Moment waarop de quote-lock (bookings.quote_id verplicht pad) live ging. */
export const QUOTE_LOCK_LIVE_DATE = "2026-08-08";
/** Eerste dag waarop price_snapshots in productie bestond. */
export const SNAPSHOTS_LIVE_DATE = "2026-07-30";

export type SnapshotRow = {
  createdAt: string;
  pricingSource: string;
  totalCents: number;
  /** Vingerafdruk van de prijsbepalende invoer; `null` als hij ontbreekt. */
  fingerprint: string | null;
};

export type QuoteLogRow = {
  createdAt: string;
  available: boolean;
};

export type BookingRow = {
  id: string;
  createdAt: string;
  quoteId: string | null;
  status: string;
  paymentStatus: string;
  hasPaymentIntent: boolean;
  paidAt: string | null;
  amountDueCents: number | null;
  amountPaidCents: number | null;
  priceEuros: number | null;
  /** Expliciete testmarkering in naam, e-mail of notities. */
  testMarker: boolean;
  /** E-maildomein dat intern of een voorbeeld-/testdomein is. */
  internalDomain: boolean;
  /**
   * Gehashte contactsleutels (e-mail, telefoon). Alleen gebruikt om
   * boekingen te koppelen aan een gemarkeerde testboeking; nooit geëxporteerd.
   */
  contactKeys: readonly string[];
};

export type WebhookRow = {
  paymentIntentId: string | null;
  eventType: string;
};

export type TransitionRow = {
  bookingId: string;
  fromStatus: string;
  toStatus: string;
};

export type ExclusionReason = "test_marker" | "internal_domain" | "shared_contact";

// ── Tijd ────────────────────────────────────────────────────────────────────

const dateFmtCache = new Map<string, Intl.DateTimeFormat>();

/** Kalenderdatum (YYYY-MM-DD) van een ISO-moment in de gegeven tijdzone. */
export function localDate(iso: string, timeZone: string = REPORT_TIME_ZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`ongeldige datum: ${iso}`);
  let fmt = dateFmtCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFmtCache.set(timeZone, fmt);
  }
  return fmt.format(d);
}

/** ISO-8601-week ("2026-W31") van een kalenderdatum YYYY-MM-DD. */
export function isoWeekOfDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`ongeldige kalenderdatum: ${ymd}`);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7; // ma=1 … zo=7
  date.setUTCDate(date.getUTCDate() + 4 - dow); // donderdag van deze week
  const isoYear = date.getUTCFullYear();
  const jan1 = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((date.getTime() - jan1) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** ISO-week van een ISO-moment, bepaald in Europe/Amsterdam. */
export function isoWeekKey(iso: string, timeZone: string = REPORT_TIME_ZONE): string {
  return isoWeekOfDate(localDate(iso, timeZone));
}

/** Maandag (YYYY-MM-DD) van een ISO-week. */
export function mondayOfIsoWeek(key: string): string {
  const m = key.match(/^(\d{4})-W(\d{2})$/);
  if (!m) throw new Error(`ongeldige week: ${key}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4.getTime() + ((week - 1) * 7 - (dow - 1)) * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

/** Alle ISO-weken van `from` t/m `to` (inclusief), ook weken zonder data. */
export function weeksBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = new Date(`${mondayOfIsoWeek(from)}T00:00:00Z`).getTime();
  const end = new Date(`${mondayOfIsoWeek(to)}T00:00:00Z`).getTime();
  while (cursor <= end) {
    out.push(isoWeekOfDate(new Date(cursor).toISOString().slice(0, 10)));
    cursor += 7 * 86_400_000;
  }
  return out;
}

// ── Testherkenning ──────────────────────────────────────────────────────────

const TEST_MARKER = /test/i;
const INTERNAL_DOMAIN = /@(t4xi\.nl|example\.(com|org|net|nl)|test\.[a-z]+)$/i;

/** Expliciete testmarkering in vrije tekstvelden. */
export function hasTestMarker(fields: ReadonlyArray<string | null | undefined>): boolean {
  return fields.some((f) => typeof f === "string" && TEST_MARKER.test(f));
}

export function isInternalDomain(email: string | null | undefined): boolean {
  return typeof email === "string" && INTERNAL_DOMAIN.test(email.trim());
}

/**
 * Bepaalt welke boekingen als test worden uitgesloten:
 * 1. expliciete testmarkering (naam/e-mail/notities bevat "test");
 * 2. intern of voorbeeld-e-maildomein;
 * 3. deelt een contactsleutel (e-mail of telefoon) met een boeking uit 1/2 —
 *    één stap, geen transitieve keten, zodat één gedeeld nummer niet de hele
 *    tabel meesleept.
 */
export function classifyExclusions(
  bookings: readonly BookingRow[]
): Map<string, ExclusionReason> {
  const out = new Map<string, ExclusionReason>();
  const testKeys = new Set<string>();
  for (const b of bookings) {
    const reason: ExclusionReason | null = b.testMarker
      ? "test_marker"
      : b.internalDomain
        ? "internal_domain"
        : null;
    if (reason) {
      out.set(b.id, reason);
      for (const k of b.contactKeys) testKeys.add(k);
    }
  }
  for (const b of bookings) {
    if (out.has(b.id)) continue;
    if (b.contactKeys.some((k) => testKeys.has(k))) out.set(b.id, "shared_contact");
  }
  return out;
}

// ── Aggregatie ──────────────────────────────────────────────────────────────

export function isPaid(b: Pick<BookingRow, "paymentStatus" | "paidAt">): boolean {
  return b.paymentStatus === "paid" && b.paidAt !== null;
}

export type WeekRow = {
  week: string;
  weekStart: string;
  quotes: number;
  uniqueQuoteFingerprints: number;
  quotesWithoutFingerprint: number;
  quoteCalculations: number;
  quoteCalculationsAvailable: number;
  bookings: number;
  bookingsWithQuote: number;
  bookingsWithPaymentIntent: number;
  paidBookings: number;
  excludedTestBookings: number;
};

export type Ratio = { numerator: number; denominator: number; pct: number | null };

export function ratio(numerator: number, denominator: number): Ratio {
  return {
    numerator,
    denominator,
    pct: denominator === 0 ? null : Math.round((numerator / denominator) * 1000) / 10,
  };
}

export type Finding = { code: string; count: number; detail: string };

export type ServerTruthReport = {
  generatedAt: string;
  timeZone: string;
  period: {
    first: string | null;
    last: string | null;
    snapshotsFirst: string | null;
    snapshotsLast: string | null;
    quoteLogsFirst: string | null;
    quoteLogsLast: string | null;
    bookingsFirst: string | null;
    bookingsLast: string | null;
  };
  totals: {
    quotes: number;
    uniqueQuoteFingerprints: number;
    quotesWithoutFingerprint: number;
    quoteCalculations: number;
    quoteCalculationsAvailable: number;
    bookingsAll: number;
    bookingsExcluded: number;
    bookings: number;
    bookingsWithQuote: number;
    bookingsWithPaymentIntent: number;
    paidBookings: number;
    paidRevenueCents: number;
    quoteToBooking: Ratio;
    bookingToPaid: Ratio;
    quoteToPaid: Ratio;
    bookingsSinceSnapshots: number;
    quoteToBookingSinceSnapshots: Ratio;
  };
  exclusions: Record<ExclusionReason, number>;
  quotesBySource: Record<string, number>;
  bookingStatusMix: Record<string, number>;
  weeks: WeekRow[];
  findings: Finding[];
};

function minMax(dates: readonly string[]): { first: string | null; last: string | null } {
  if (dates.length === 0) return { first: null, last: null };
  const sorted = [...dates].sort();
  return { first: sorted[0] ?? null, last: sorted[sorted.length - 1] ?? null };
}

function emptyWeek(week: string): WeekRow {
  return {
    week,
    weekStart: mondayOfIsoWeek(week),
    quotes: 0,
    uniqueQuoteFingerprints: 0,
    quotesWithoutFingerprint: 0,
    quoteCalculations: 0,
    quoteCalculationsAvailable: 0,
    bookings: 0,
    bookingsWithQuote: 0,
    bookingsWithPaymentIntent: 0,
    paidBookings: 0,
    excludedTestBookings: 0,
  };
}

export type ServerTruthInput = {
  snapshots: readonly SnapshotRow[];
  quoteLogs: readonly QuoteLogRow[];
  bookings: readonly BookingRow[];
  webhooks: readonly WebhookRow[];
  transitions: readonly TransitionRow[];
  /** PaymentIntent-ids op bookings (inclusief testboekingen); alleen voor de wees-check. */
  bookingPaymentIntents: ReadonlySet<string>;
  generatedAt: string;
};

export function buildServerTruthReport(input: ServerTruthInput): ServerTruthReport {
  const { snapshots, quoteLogs, bookings, webhooks, transitions } = input;
  const excluded = classifyExclusions(bookings);
  const kept = bookings.filter((b) => !excluded.has(b.id));

  // Periode in lokale kalenderdatums.
  const sDates = snapshots.map((s) => localDate(s.createdAt));
  const qDates = quoteLogs.map((q) => localDate(q.createdAt));
  const bDates = bookings.map((b) => localDate(b.createdAt));
  const all = minMax([...sDates, ...qDates, ...bDates]);
  const sRange = minMax(sDates);
  const qRange = minMax(qDates);
  const bRange = minMax(bDates);

  const weeks = new Map<string, WeekRow>();
  if (all.first && all.last) {
    for (const w of weeksBetween(isoWeekOfDate(all.first), isoWeekOfDate(all.last))) {
      weeks.set(w, emptyWeek(w));
    }
  }
  const row = (iso: string): WeekRow => {
    const key = isoWeekKey(iso);
    let r = weeks.get(key);
    if (!r) {
      r = emptyWeek(key);
      weeks.set(key, r);
    }
    return r;
  };

  const fingerprintsPerWeek = new Map<string, Set<string>>();
  const allFingerprints = new Set<string>();
  const quotesBySource: Record<string, number> = {};
  for (const s of snapshots) {
    const r = row(s.createdAt);
    r.quotes += 1;
    quotesBySource[s.pricingSource] = (quotesBySource[s.pricingSource] ?? 0) + 1;
    // Oudere snapshots (vóór de fingerprint-uitbreiding) hebben er geen; die
    // tellen apart en nooit als "uniek".
    if (s.fingerprint === null) {
      r.quotesWithoutFingerprint += 1;
      continue;
    }
    const fp = s.fingerprint;
    let set = fingerprintsPerWeek.get(r.week);
    if (!set) {
      set = new Set();
      fingerprintsPerWeek.set(r.week, set);
    }
    set.add(fp);
    allFingerprints.add(fp);
  }
  for (const [week, set] of fingerprintsPerWeek) {
    const r = weeks.get(week);
    if (r) r.uniqueQuoteFingerprints = set.size;
  }

  for (const q of quoteLogs) {
    const r = row(q.createdAt);
    r.quoteCalculations += 1;
    if (q.available) r.quoteCalculationsAvailable += 1;
  }

  for (const b of bookings) {
    const r = row(b.createdAt);
    if (excluded.has(b.id)) {
      r.excludedTestBookings += 1;
      continue;
    }
    r.bookings += 1;
    if (b.quoteId !== null) r.bookingsWithQuote += 1;
    if (b.hasPaymentIntent) r.bookingsWithPaymentIntent += 1;
    if (isPaid(b)) r.paidBookings += 1;
  }

  const weekRows = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));

  const exclusions: Record<ExclusionReason, number> = {
    test_marker: 0,
    internal_domain: 0,
    shared_contact: 0,
  };
  for (const reason of excluded.values()) exclusions[reason] += 1;

  const bookingStatusMix: Record<string, number> = {};
  for (const b of kept) {
    const k = `${b.status}/${b.paymentStatus}`;
    bookingStatusMix[k] = (bookingStatusMix[k] ?? 0) + 1;
  }

  const paid = kept.filter(isPaid);
  const bookingsWithQuote = kept.filter((b) => b.quoteId !== null).length;
  const bookingsSinceSnapshots = kept.filter(
    (b) => localDate(b.createdAt) >= SNAPSHOTS_LIVE_DATE
  ).length;

  return {
    generatedAt: input.generatedAt,
    timeZone: REPORT_TIME_ZONE,
    period: {
      first: all.first,
      last: all.last,
      snapshotsFirst: sRange.first,
      snapshotsLast: sRange.last,
      quoteLogsFirst: qRange.first,
      quoteLogsLast: qRange.last,
      bookingsFirst: bRange.first,
      bookingsLast: bRange.last,
    },
    totals: {
      quotes: snapshots.length,
      uniqueQuoteFingerprints: allFingerprints.size,
      quotesWithoutFingerprint: snapshots.filter((s) => s.fingerprint === null).length,
      quoteCalculations: quoteLogs.length,
      quoteCalculationsAvailable: quoteLogs.filter((q) => q.available).length,
      bookingsAll: bookings.length,
      bookingsExcluded: excluded.size,
      bookings: kept.length,
      bookingsWithQuote,
      bookingsWithPaymentIntent: kept.filter((b) => b.hasPaymentIntent).length,
      paidBookings: paid.length,
      paidRevenueCents: paid.reduce((sum, b) => sum + (b.amountPaidCents ?? 0), 0),
      quoteToBooking: ratio(bookingsWithQuote, snapshots.length),
      bookingToPaid: ratio(paid.length, kept.length),
      quoteToPaid: ratio(paid.filter((b) => b.quoteId !== null).length, snapshots.length),
      bookingsSinceSnapshots,
      quoteToBookingSinceSnapshots: ratio(bookingsSinceSnapshots, snapshots.length),
    },
    exclusions,
    quotesBySource,
    bookingStatusMix,
    weeks: weekRows,
    findings: [
      ...collectFindings(bookings, transitions),
      ...[orphanWebhookFinding(webhooks, input.bookingPaymentIntents)].filter(
        (f): f is Finding => f !== null
      ),
    ],
  };
}

// ── Findings (afwijkingen; worden NIET gerepareerd) ─────────────────────────

export function collectFindings(
  bookings: readonly BookingRow[],
  transitions: readonly TransitionRow[]
): Finding[] {
  const findings: Finding[] = [];
  const add = (code: string, count: number, detail: string) => {
    if (count > 0) findings.push({ code, count, detail });
  };

  const afterLock = (b: BookingRow) => localDate(b.createdAt) >= QUOTE_LOCK_LIVE_DATE;
  const noQuote = bookings.filter((b) => b.quoteId === null);
  add(
    "booking_without_quote_id_before_lock",
    noQuote.filter((b) => !afterLock(b)).length,
    `Boekingen zonder quote_id aangemaakt vóór de quote-lock (${QUOTE_LOCK_LIVE_DATE}); verwacht.`
  );
  add(
    "booking_without_quote_id_after_lock",
    noQuote.filter(afterLock).length,
    `Boekingen zonder quote_id aangemaakt ná de quote-lock (${QUOTE_LOCK_LIVE_DATE}).`
  );
  add(
    "booking_without_price",
    bookings.filter((b) => b.priceEuros === null).length,
    "Boekingen zonder price_euros (aanvraag/offerte-pad of handmatig)."
  );
  add(
    "payment_pending_without_paid",
    bookings.filter((b) => b.hasPaymentIntent && !isPaid(b) && b.paymentStatus === "pending").length,
    "Boekingen met gekoppelde PaymentIntent die op payment_status 'pending' blijven staan (betaling afgebroken of nooit afgerond)."
  );
  add(
    "paid_amount_mismatch",
    bookings.filter(
      (b) => isPaid(b) && b.amountDueCents !== null && b.amountPaidCents !== b.amountDueCents
    ).length,
    "Betaalde boekingen waarvan amount_paid_cents ≠ amount_due_cents."
  );
  add(
    "paid_without_payment_intent",
    bookings.filter((b) => isPaid(b) && !b.hasPaymentIntent).length,
    "Betaald zonder gekoppelde PaymentIntent."
  );
  add(
    "paid_status_without_paid_at",
    bookings.filter((b) => b.paymentStatus === "paid" && b.paidAt === null).length,
    "payment_status 'paid' zonder paid_at."
  );
  add(
    "paid_but_lifecycle_inquiry",
    bookings.filter((b) => isPaid(b) && b.status === "inquiry").length,
    "Betaalde boekingen waarvan de lifecycle-status nog 'inquiry' is (payment_status en status zijn bewust orthogonaal; betaling zet de status niet door)."
  );

  const transitionsByBooking = new Map<string, TransitionRow[]>();
  for (const t of transitions) {
    const list = transitionsByBooking.get(t.bookingId) ?? [];
    list.push(t);
    transitionsByBooking.set(t.bookingId, list);
  }
  add(
    "status_without_transition_audit",
    bookings.filter((b) => b.status !== "inquiry" && !transitionsByBooking.has(b.id)).length,
    "Boekingen met een status ≠ 'inquiry' zonder enige rij in booking_status_transitions."
  );
  const knownIds = new Set(bookings.map((b) => b.id));
  add(
    "transition_without_booking",
    transitions.filter((t) => !knownIds.has(t.bookingId)).length,
    "Statusovergangen die naar een onbekende booking verwijzen."
  );
  add(
    "completed_unpaid",
    bookings.filter((b) => b.status === "completed" && !isPaid(b)).length,
    "Boekingen met status 'completed' die niet betaald zijn."
  );

  return findings;
}

/**
 * Telt webhook-PaymentIntents die bij geen enkele boeking horen. Alleen het
 * aantal verlaat deze functie, nooit de ids.
 */
export function orphanWebhookFinding(
  webhooks: readonly WebhookRow[],
  bookingPaymentIntents: ReadonlySet<string>
): Finding | null {
  const orphanPis = new Set(
    webhooks
      .map((w) => w.paymentIntentId)
      .filter((pi): pi is string => pi !== null && !bookingPaymentIntents.has(pi))
  );
  if (orphanPis.size === 0) return null;
  return {
    code: "payment_without_booking",
    count: orphanPis.size,
    detail: "Stripe-webhook-PaymentIntents (stripe_webhook_events) zonder bijbehorende boeking.",
  };
}

// ── Markdown ────────────────────────────────────────────────────────────────

export function formatRatio(r: Ratio): string {
  if (r.pct === null) return `${r.numerator} / ${r.denominator} (n.v.t.)`;
  return `${r.numerator} / ${r.denominator} (${r.pct.toLocaleString("nl-NL")}%)`;
}

export function renderWeeklyTable(report: ServerTruthReport): string {
  const head =
    "| ISO-week | Week vanaf | Quotes (snapshots) | Unieke fingerprints | Zonder fingerprint | Berekeningen (logs) | Bookings | — met quote_id | Betaald | Quote → booking | Booking → betaald | Uitgesloten test |\n" +
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|";
  const lines = report.weeks.map((w) =>
    [
      w.week,
      w.weekStart,
      w.quotes,
      w.uniqueQuoteFingerprints,
      w.quotesWithoutFingerprint,
      w.quoteCalculations,
      w.bookings,
      w.bookingsWithQuote,
      w.paidBookings,
      formatRatio(ratio(w.bookingsWithQuote, w.quotes)),
      formatRatio(ratio(w.paidBookings, w.bookings)),
      w.excludedTestBookings,
    ].join(" | ")
  );
  return [head, ...lines.map((l) => `| ${l} |`)].join("\n");
}
