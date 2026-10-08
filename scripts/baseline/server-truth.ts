/**
 * Experience 2.0 — PR 0.4a "Server truth" — VOLLEDIG READ-ONLY.
 *
 * Quote → booking → payment-conversie per ISO-week (Europe/Amsterdam) uit
 * price_snapshots, pricing_quote_logs, bookings, booking_status_transitions en
 * stripe_webhook_events. Alleen SELECT via PostgREST; geen insert/update/
 * delete/rpc, geen schemawijziging.
 *
 * Draaien (env wordt door Node geladen, het bestand wordt niet gekopieerd):
 *   node --env-file=<pad>/.env.local --import tsx scripts/baseline/server-truth.ts
 *   … --json=docs/experience-2.0/baseline/0.4a-server-truth.json
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL (of SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
 * Het script stopt hard als de URL niet naar het productieproject wijst —
 * deze nulmeting hoort bij productie, niet bij staging.
 *
 * Output bevat uitsluitend aggregaten. Namen, e-mails, telefoonnummers,
 * adressen, boekings- en PaymentIntent-ids blijven in het geheugen en worden
 * nergens weggeschreven of gelogd.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  buildServerTruthReport,
  formatRatio,
  hasTestMarker,
  isInternalDomain,
  renderWeeklyTable,
  type BookingRow,
  type QuoteLogRow,
  type SnapshotRow,
  type TransitionRow,
  type WebhookRow,
} from "@/lib/baseline/server-truth";
import { PRODUCTION_PROJECT_REF } from "@/lib/pricing/event-report-target";

type Row = Record<string, unknown>;

const PAGE = 1000;

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function req(v: unknown, field: string): string {
  const s = str(v);
  if (s === null) throw new Error(`onverwacht schema: ${field} ontbreekt`);
  return s;
}
function hashKey(kind: string, value: string): string {
  return createHash("sha256").update(`${kind}:${value}`).digest("hex");
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const ref = url.replace(/^https:\/\/([a-z0-9]+)\.supabase\.co.*$/, "$1");
  if (ref !== PRODUCTION_PROJECT_REF) {
    throw new Error(
      `VEILIGHEIDSSTOP: verwacht productie-ref '${PRODUCTION_PROJECT_REF}', kreeg '${ref || "(leeg)"}'.`
    );
  }
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ontbreekt.");

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /** Enige databasetoegang van dit script: gepagineerde SELECT. */
  async function selectAll(table: string, columns: string): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from(table)
        .select(columns)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`SELECT ${table} faalde: ${error.code ?? ""} ${error.message}`);
      const rows = (data ?? []) as unknown as Row[];
      out.push(...rows);
      if (rows.length < PAGE) return out;
    }
  }

  const [snapRaw, logRaw, bookingRaw, transRaw] = await Promise.all([
    selectAll("price_snapshots", "created_at,pricing_source,total_cents,fp:route_snapshot->>fingerprint"),
    selectAll("pricing_quote_logs", "created_at,quoted_price,error_code"),
    selectAll(
      "bookings",
      "id,created_at,quote_id,status,payment_status,stripe_payment_intent_id,paid_at,amount_due_cents,amount_paid_cents,price_euros,customer_name,customer_email,customer_phone,notes"
    ),
    selectAll("booking_status_transitions", "booking_id,from_status,to_status,created_at"),
  ]);
  const { data: whData, error: whErr } = await db
    .from("stripe_webhook_events")
    .select("payment_intent_id,event_type");
  if (whErr) throw new Error(`SELECT stripe_webhook_events faalde: ${whErr.message}`);

  const snapshots: SnapshotRow[] = snapRaw.map((r) => ({
    createdAt: req(r.created_at, "price_snapshots.created_at"),
    pricingSource: str(r.pricing_source) ?? "unknown",
    totalCents: num(r.total_cents) ?? 0,
    fingerprint: str(r.fp),
  }));

  const quoteLogs: QuoteLogRow[] = logRaw.map((r) => ({
    createdAt: req(r.created_at, "pricing_quote_logs.created_at"),
    available: num(r.quoted_price) !== null && r.error_code == null,
  }));

  const bookingPaymentIntents = new Set<string>();
  const bookings: BookingRow[] = bookingRaw.map((r) => {
    const email = str(r.customer_email)?.trim().toLowerCase() ?? null;
    const phoneDigits = (str(r.customer_phone) ?? "").replace(/[^0-9]/g, "");
    const pi = str(r.stripe_payment_intent_id);
    if (pi) bookingPaymentIntents.add(pi);
    const contactKeys: string[] = [];
    if (email) contactKeys.push(hashKey("email", email));
    if (phoneDigits.length >= 8) contactKeys.push(hashKey("phone", phoneDigits.slice(-9)));
    return {
      id: req(r.id, "bookings.id"),
      createdAt: req(r.created_at, "bookings.created_at"),
      quoteId: str(r.quote_id),
      status: str(r.status) ?? "unknown",
      paymentStatus: str(r.payment_status) ?? "unknown",
      hasPaymentIntent: pi !== null,
      paidAt: str(r.paid_at),
      amountDueCents: num(r.amount_due_cents),
      amountPaidCents: num(r.amount_paid_cents),
      priceEuros: num(r.price_euros),
      testMarker: hasTestMarker([str(r.customer_name), email, str(r.notes)]),
      internalDomain: isInternalDomain(email),
      contactKeys,
    };
  });

  const transitions: TransitionRow[] = transRaw.map((r) => ({
    bookingId: req(r.booking_id, "booking_status_transitions.booking_id"),
    fromStatus: str(r.from_status) ?? "unknown",
    toStatus: str(r.to_status) ?? "unknown",
  }));
  const webhooks: WebhookRow[] = ((whData ?? []) as unknown as Row[]).map((r) => ({
    paymentIntentId: str(r.payment_intent_id),
    eventType: str(r.event_type) ?? "unknown",
  }));

  const report = buildServerTruthReport({
    snapshots,
    quoteLogs,
    bookings,
    webhooks,
    transitions,
    bookingPaymentIntents,
    generatedAt: new Date().toISOString(),
  });

  const jsonArg = process.argv.find((a) => a.startsWith("--json="));
  if (jsonArg) {
    const path = resolve(process.cwd(), jsonArg.slice("--json=".length));
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`JSON geschreven: ${path}`);
  }

  const t = report.totals;
  const p = report.period;
  console.log(`# Server truth — productie (${PRODUCTION_PROJECT_REF})\n`);
  console.log(`Gegenereerd: ${report.generatedAt} · weken in ${report.timeZone}\n`);
  console.log(`Periode met data: ${p.first} – ${p.last}`);
  console.log(`- price_snapshots: ${p.snapshotsFirst} – ${p.snapshotsLast}`);
  console.log(`- pricing_quote_logs: ${p.quoteLogsFirst} – ${p.quoteLogsLast}`);
  console.log(`- bookings: ${p.bookingsFirst} – ${p.bookingsLast}\n`);
  console.log("| Totaal | Aantal |\n|---|---:|");
  console.log(`| Quotes (price_snapshots) | ${t.quotes} |`);
  console.log(`| Unieke quote-fingerprints | ${t.uniqueQuoteFingerprints} (zonder fingerprint: ${t.quotesWithoutFingerprint}) |`);
  console.log(`| Prijsberekeningen (pricing_quote_logs) | ${t.quoteCalculations} (beschikbaar: ${t.quoteCalculationsAvailable}) |`);
  console.log(`| Bookings totaal / uitgesloten als test / geteld | ${t.bookingsAll} / ${t.bookingsExcluded} / ${t.bookings} |`);
  console.log(`| Bookings met quote_id | ${t.bookingsWithQuote} |`);
  console.log(`| Bookings met PaymentIntent | ${t.bookingsWithPaymentIntent} |`);
  console.log(`| Betaald | ${t.paidBookings} (omzet € ${(t.paidRevenueCents / 100).toFixed(2)}) |`);
  console.log(`| Quote → booking (via quote_id) | ${formatRatio(t.quoteToBooking)} |`);
  console.log(`| Quote → booking (bookings sinds snapshots live, ongeacht quote_id) | ${formatRatio(t.quoteToBookingSinceSnapshots)} |`);
  console.log(`| Booking → betaald | ${formatRatio(t.bookingToPaid)} |`);
  console.log(`| Quote → betaald | ${formatRatio(t.quoteToPaid)} |\n`);
  console.log(`Uitsluitingen: ${JSON.stringify(report.exclusions)}`);
  console.log(`Quotes per bron: ${JSON.stringify(report.quotesBySource)}`);
  console.log(`Statusmix (geteld): ${JSON.stringify(report.bookingStatusMix)}\n`);
  console.log(renderWeeklyTable(report));
  console.log("\n## Findings\n");
  for (const f of report.findings) console.log(`- \`${f.code}\`: ${f.count} — ${f.detail}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
