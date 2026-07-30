// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY. Persistentielaag voor de prijs-snapshot (Sprint 7.6 — PR 7.6.3C).
// Schrijft parent (price_snapshots) + alle adjustments (price_snapshot_adjustments)
// ATOMAIR weg via de SECURITY DEFINER RPC create_price_snapshot — één DB-transactie,
// nooit losse niet-transactionele inserts. Uitsluitend met de service-role key.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validateSnapshot, type PriceSnapshot } from "@/lib/pricing/snapshot";

/** Alleen `.rpc` is nodig → smalle, injecteerbare vorm voor tests. */
export type SnapshotRpcClient = Pick<SupabaseClient, "rpc">;

export type PersistSnapshotDeps = {
  client?: SnapshotRpcClient | null;
};

/** Service-role client (server-only). Zelfde patroon als /api/bookings. */
function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Slaat een PriceSnapshot ATOMAIR op via de RPC `create_price_snapshot`
 * (parent + children in één transactie). BEST-EFFORT: retourneert `false` — en
 * blokkeert de preview nooit — bij een ontbrekende service-role client, een
 * validatiefout, of een RPC-fout (alle gelogd). Retourneert `true` alleen wanneer
 * de opslag door de database is bevestigd. Er is GEEN update-pad: de RPC doet
 * uitsluitend inserts; de snapshot is immutabel.
 */
export async function persistPriceSnapshot(
  snapshot: PriceSnapshot,
  deps: PersistSnapshotDeps = {}
): Promise<boolean> {
  // 1. App-laag validatie vóór de insert (DB oordeelt niet inhoudelijk).
  const v = validateSnapshot(snapshot);
  if (!v.ok) {
    console.warn(`[price-snapshot] ongeldige snapshot, niet opgeslagen: ${v.error}`);
    return false;
  }

  const client = deps.client ?? serviceRoleClient();
  if (!client) return false; // geen service-role key → stil overslaan (zoals logQuote)

  const { error } = await client.rpc("create_price_snapshot", {
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

  if (error) {
    console.warn(`[price-snapshot] opslaan mislukt (${error.code ?? "?"}): ${error.message}`);
    return false;
  }
  return true;
}
