// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY. Persistentielaag voor de prijs-snapshot (Sprint 7.6 — PR 7.6.3C).
// Schrijft parent (price_snapshots) + alle adjustments (price_snapshot_adjustments)
// ATOMAIR weg via de SECURITY DEFINER RPC create_price_snapshot — één DB-transactie,
// nooit losse niet-transactionele inserts. Uitsluitend met de service-role key.
//
// FAILURE-MODUS (7.6.3C, tijdelijke backward-compatible degradatie):
//   De preview mag blijven werken ZONDER quoteId als opslag faalt — maar een fout
//   wordt NOOIT stil ingeslikt. Elke faalpad logt de vaste code
//   PRICE_SNAPSHOT_PERSIST_FAILED met UITSLUITEND veilige metadata (geen
//   routeSnapshot, geen adressen/namen/e-mail/telefoon). `quoteId` wordt alleen
//   teruggegeven wanneer de DB de opslag heeft bevestigd. Vanaf de latere
//   booking-koppeling wordt een geldige, gepersisteerde quoteId VERPLICHT en
//   verdwijnt deze legacy fallback. Zie docs/architecture/price-snapshot-contract.md.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  validateSnapshot,
  type PriceSnapshot,
  type RouteSnapshot,
  type StoredSnapshot,
} from "@/lib/pricing/snapshot";

/** Alleen `.rpc` is nodig → smalle, injecteerbare vorm voor tests. */
export type SnapshotRpcClient = Pick<SupabaseClient, "rpc">;

/** Alleen `.from` is nodig voor read/consume → smalle, injecteerbare vorm voor tests. */
export type SnapshotTableClient = Pick<SupabaseClient, "from">;

/** Vaste, alert-bare foutcode voor mislukte snapshot-opslag. */
export const SNAPSHOT_PERSIST_FAILED = "PRICE_SNAPSHOT_PERSIST_FAILED" as const;

export type SnapshotPersistReason =
  | "no_service_role_client"
  | "validation_failed"
  | "rpc_error"
  | "rpc_exception"
  | "invalid_rpc_response";

/**
 * Wat er over een mislukte persist wordt gelogd. BEWUST alleen veilige metadata —
 * GEEN routeSnapshot, adressen, namen, e-mail, telefoon of andere persoonsgegevens.
 * `quoteId` is een ondoorzichtige server-UUID (geen PII) en dient als correlatiesleutel.
 */
export type SnapshotPersistFailure = {
  code: typeof SNAPSHOT_PERSIST_FAILED;
  reason: SnapshotPersistReason;
  quoteId: string;
  pricingVersion: string;
  pricingSource: string;
  dbErrorCode: string | null;
  at: string; // ISO-8601 UTC
};

export type PersistSnapshotDeps = {
  client?: SnapshotRpcClient | null;
  /** Injecteerbaar voor tests; default logt via de server-logger (console.error). */
  logFailure?: (failure: SnapshotPersistFailure) => void;
};

/** Default: één regel via de server-logger. Vercel/log-drain vangt console.error →
 *  alert/telling op de vaste code. Uitsluitend veilige velden, geen PII. */
function defaultLogFailure(f: SnapshotPersistFailure): void {
  console.error(`[price-snapshot] ${f.code}`, {
    reason: f.reason,
    quoteId: f.quoteId,
    pricingVersion: f.pricingVersion,
    pricingSource: f.pricingSource,
    dbErrorCode: f.dbErrorCode,
    at: f.at,
  });
}

/** Service-role client (server-only). Zelfde patroon als /api/bookings. */
function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Veilig een tekstcode uit een onbekende fout/response halen (nooit de message). */
function errorCodeOf(value: unknown): string | null {
  if (value && typeof value === "object" && "code" in value) {
    const c = (value as { code?: unknown }).code;
    if (typeof c === "string") return c;
    if (typeof c === "number") return String(c);
  }
  return null;
}

/**
 * Slaat een PriceSnapshot ATOMAIR op via de RPC `create_price_snapshot`
 * (parent + children in één transactie). Retourneert `true` UITSLUITEND wanneer de
 * database de opslag heeft bevestigd. Bij elk faalpad (ontbrekende client,
 * validatiefout, RPC-fout, RPC-exception, ongeldige RPC-response) wordt de vaste
 * code PRICE_SNAPSHOT_PERSIST_FAILED gelogd (veilige metadata) en `false`
 * geretourneerd — de preview breekt nooit. Er is GEEN update-pad (alleen de
 * insert-RPC): de snapshot is immutabel.
 */
export async function persistPriceSnapshot(
  snapshot: PriceSnapshot,
  deps: PersistSnapshotDeps = {}
): Promise<boolean> {
  const log = deps.logFailure ?? defaultLogFailure;
  const fail = (reason: SnapshotPersistReason, dbErrorCode: string | null): false => {
    log({
      code: SNAPSHOT_PERSIST_FAILED,
      reason,
      quoteId: snapshot.quoteId,
      pricingVersion: snapshot.pricingVersion,
      pricingSource: snapshot.pricingSource,
      dbErrorCode,
      at: new Date().toISOString(),
    });
    return false;
  };

  // 1. App-laag validatie vóór de insert (DB oordeelt niet inhoudelijk).
  if (!validateSnapshot(snapshot).ok) return fail("validation_failed", null);

  const client = deps.client ?? serviceRoleClient();
  if (!client) return fail("no_service_role_client", null);

  // 2. Atomaire opslag via de RPC. Elke fout blijft binnen deze functie (geen throw
  //    naar de preview), maar wordt geregistreerd — nooit stil ingeslikt.
  let result: unknown;
  try {
    result = await client.rpc("create_price_snapshot", {
      p_quote_id: snapshot.quoteId,
      p_pricing_version: snapshot.pricingVersion,
      p_pricing_source: snapshot.pricingSource,
      p_currency: snapshot.currency,
      p_subtotal_cents: snapshot.subtotalCents,
      p_total_cents: snapshot.totalCents,
      p_route_snapshot: snapshot.routeSnapshot,
      p_calculated_at: snapshot.calculatedAt,
      p_expires_at: snapshot.expiresAt,
      p_created_at: snapshot.createdAt,
      p_adjustments: snapshot.adjustments,
    });
  } catch (e) {
    return fail("rpc_exception", errorCodeOf(e));
  }

  if (!result || typeof result !== "object" || !("error" in result)) {
    return fail("invalid_rpc_response", null);
  }
  const { error } = result as { error: unknown };
  if (error) return fail("rpc_error", errorCodeOf(error));

  return true;
}

// ── Read + atomic consume (voor de booking-quote-lock) ───────────────────────

export type ReadSnapshotDeps = { client?: SnapshotTableClient | null };

const SNAPSHOT_COLS =
  "quote_id, pricing_version, pricing_source, currency, subtotal_cents, total_cents, route_snapshot, calculated_at, expires_at";

function rowToStored(row: Record<string, unknown>): StoredSnapshot {
  return {
    quoteId: String(row.quote_id),
    pricingVersion: String(row.pricing_version),
    pricingSource: String(row.pricing_source),
    currency: String(row.currency),
    subtotalCents: Number(row.subtotal_cents),
    totalCents: Number(row.total_cents),
    routeSnapshot: row.route_snapshot as RouteSnapshot,
    calculatedAt: String(row.calculated_at),
    expiresAt: String(row.expires_at),
  };
}

/**
 * Leest een snapshot NIET-destructief uit price_snapshots (service-role). Retourneert
 * `null` als de quoteId niet bestaat, er geen client is, of de query faalt. Doet géén
 * geldigheids-/vingerafdrukcontrole — dat is checkSnapshotUsable (puur).
 */
export async function readPriceSnapshot(
  quoteId: string,
  deps: ReadSnapshotDeps = {}
): Promise<StoredSnapshot | null> {
  const client = deps.client ?? serviceRoleClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("price_snapshots")
      .select(SNAPSHOT_COLS)
      .eq("quote_id", quoteId)
      .maybeSingle();
    if (error || !data) return null;
    return rowToStored(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

// Consumeren gebeurt niet meer app-zijdig via DELETE, maar transactioneel in de
// RPC create_booking_from_snapshot (snapshot vergrendelen + markeren als gebruikt +
// aan de boeking koppelen, in één transactie). Zie migratie 20260807120000.
