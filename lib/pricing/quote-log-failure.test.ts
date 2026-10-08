import { test } from "node:test";
import assert from "node:assert/strict";
import {
  logQuote,
  reportQuoteLogFailure,
  type PricingQuoteInput,
  type PricingQuoteResult,
  type QuoteLogClient,
} from "@/lib/pricing/service";

/**
 * F-05: `logQuote` negeerde insertfouten. Nu wordt een verloren quote-logregel
 * gelogd — zonder PII (geen adressen, geen ruwe foutmelding) — en blijft het
 * gedrag verder gelijk (nooit gooien, nooit blokkeren).
 */

const PICKUP = "Voorbeeldstraat 1, Voorbeeldstad";
const DROPOFF = "Schiphol";

const input: PricingQuoteInput = { pickup: PICKUP, dropoff: DROPOFF };
const result: PricingQuoteResult = {
  available: false,
  reason: "route_not_fixed",
  message: "Offerte op aanvraag",
  airport: {
    pickupIsAirport: false,
    dropoffIsAirport: true,
    isAirportPickup: false,
    isAirportDropoff: true,
    isAirportTransfer: true,
    flightDirection: "departure",
  },
};

function fakeLogger(response: { error: { code?: string; message?: string } | null }) {
  const rows: unknown[] = [];
  const client: QuoteLogClient = {
    from: () => ({
      insert: async (row) => {
        rows.push(row);
        return response;
      },
    }),
  };
  return { client, rows };
}

async function withConsole(fn: () => Promise<void> | void) {
  const lines: string[] = [];
  const error = console.error;
  console.error = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.error = error;
  }
  return lines;
}

test("logQuote: geslaagde insert logt niets", async () => {
  const l = fakeLogger({ error: null });
  const lines = await withConsole(() => logQuote(input, result, null, null, () => l.client));
  assert.equal(l.rows.length, 1);
  assert.deepEqual(lines, []);
});

test("logQuote: insertfout wordt gelogd met code, zonder adres of ruwe melding", async () => {
  const l = fakeLogger({
    error: { code: "23514", message: `new row violates check constraint, failing row (${PICKUP})` },
  });
  const lines = await withConsole(() => logQuote(input, result, null, null, () => l.client));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /stage=insert, code=23514/);
  assert.ok(!lines[0].includes(PICKUP));
  assert.ok(!lines[0].includes("violates"));
});

test("logQuote: insertfout gooit niet (gedrag gelijk)", async () => {
  const l = fakeLogger({ error: { code: "PGRST301" } });
  await withConsole(async () => {
    await assert.doesNotReject(() => logQuote(input, result, null, null, () => l.client));
  });
});

test("logQuote: zonder log-client stil overslaan (ongewijzigd)", async () => {
  const lines = await withConsole(() => logQuote(input, result, null, null, () => null));
  assert.deepEqual(lines, []);
});

test("reportQuoteLogFailure: uitzondering → alleen de foutnaam", async () => {
  const lines = await withConsole(() =>
    reportQuoteLogFailure("exception", new TypeError(`fetch failed for ${PICKUP}`))
  );
  assert.deepEqual(lines, ["[pricing] quote-log niet opgeslagen (stage=exception, code=TypeError)."]);
});

test("reportQuoteLogFailure: onverwachte code-vorm wordt niet doorgegeven", async () => {
  const lines = await withConsole(() =>
    reportQuoteLogFailure("insert", { code: `x ${PICKUP} y` })
  );
  assert.match(lines[0], /code=onbekend/);
  assert.ok(!lines[0].includes(PICKUP));
});

test("getPricingQuote: de fire-and-forget-catch slikt fouten niet meer stil in", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("lib/pricing/service.ts", "utf8");
  assert.ok(!src.includes("logQuote(input, result, shadow, pickupApproach).catch(() => {})"));
  assert.match(src, /logQuote\(input, result, shadow, pickupApproach\)\.catch\(\(e: unknown\) =>\s*reportQuoteLogFailure\("exception", e\)/);
});
