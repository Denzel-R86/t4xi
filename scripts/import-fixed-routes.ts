/**
 * T4XI Route Import Engine
 * ─────────────────────────
 * Importeert vaste routes uit een CSV naar public.fixed_route_prices — idempotent,
 * met validatie en een dry-run modus. Bedoeld om (t.z.t.) honderden routes te
 * importeren zonder handmatige SQL.
 *
 * Gebruik:
 *   npm run pricing:import -- --file data/pricing/fixed-routes.template.csv --dry-run
 *   npm run pricing:import -- --file data/pricing/fixed-routes.template.csv
 *
 * CSV-kolommen (header verplicht):
 *   pickup_slug, dropoff_slug, vehicle_class_slug, service_type, price,
 *   return_price, distance_km, estimated_duration_min, source_label, active
 *
 * Env (uit .env.local of shell):
 *   NEXT_PUBLIC_SUPABASE_URL          (verplicht)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY     (voldoende voor --dry-run: alleen lezen)
 *   SUPABASE_SERVICE_ROLE_KEY         (verplicht voor echte import: schrijven)
 *
 * Idempotentie: matcht op (pickup_location_id, dropoff_location_id,
 * vehicle_class_id, active). Bestaat er al een actieve rij → UPDATE, anders INSERT.
 * Opnieuw importeren maakt dus nooit duplicaten.
 *
 * 'service_type' wordt gevalideerd tegen de toegestane set en opgeslagen in de
 * gelijknamige kolom (airport, intercity, day_trip, hotel_transfer,
 * business_transfer, vip_transfer, hourly_chauffeur).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── kleine .env-loader (geen dependency) ─────────────────────────────────────
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

// ── argumenten ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (name: string) => argv.includes(`--${name}`);
const getOpt = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const DRY_RUN = hasFlag("dry-run");
const FILE = getOpt("file");

// ── CSV-parser (RFC4180-achtig: quotes, embedded komma's, "" escape) ─────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "") || rows.length === 0) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }
  return rows;
}

const ALLOWED_SERVICE_TYPES = [
  "airport",
  "intercity",
  "day_trip",
  "hotel_transfer",
  "business_transfer",
  "vip_transfer",
  "hourly_chauffeur",
] as const;

const REQUIRED_COLUMNS = [
  "pickup_slug",
  "dropoff_slug",
  "vehicle_class_slug",
  "service_type",
  "price",
  "return_price",
  "distance_km",
  "estimated_duration_min",
  "source_label",
  "active",
] as const;

type RouteInput = {
  line: number;
  pickup_slug: string;
  dropoff_slug: string;
  vehicle_class_slug: string;
  service_type: string;
  price: number;
  return_price: number | null;
  distance_km: number;
  estimated_duration_min: number;
  source_label: string | null;
  active: boolean;
};

function parseBool(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "ja";
}

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!FILE) fail("Geen --file opgegeven. Gebruik: --file <pad-naar-csv> [--dry-run]");
  const path = resolve(process.cwd(), FILE);
  if (!existsSync(path)) fail(`CSV-bestand niet gevonden: ${path}`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) fail("NEXT_PUBLIC_SUPABASE_URL ontbreekt (zet in .env.local).");
  if (!DRY_RUN && !serviceRole) {
    fail(
      "Echte import vereist SUPABASE_SERVICE_ROLE_KEY (schrijven naar fixed_route_prices). " +
        "Gebruik --dry-run om zonder key te valideren, of zet de key in .env.local."
    );
  }
  // Lege string telt als "afwezig" → gebruik || (niet ??) voor de fallback.
  const key = (DRY_RUN ? serviceRole || anon : serviceRole) || "";
  if (!key) fail("Geen Supabase key beschikbaar (anon of service_role).");
  const supabase: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\nT4XI Route Import — ${DRY_RUN ? "DRY-RUN (geen writes)" : "IMPORT (writes)"}`);
  console.log(`Bestand: ${path}\n`);

  // 1. CSV lezen + header valideren
  const grid = parseCsv(readFileSync(path, "utf8"));
  if (grid.length < 2) fail("CSV bevat geen datarijen.");
  const header = grid[0].map((h) => h.trim());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) fail(`Ontbrekende kolommen in header: ${missing.join(", ")}`);
  const idx = Object.fromEntries(header.map((h, i) => [h, i])) as Record<string, number>;

  // 2. Rijen parsen + valideren
  const errors: string[] = [];
  const routes: RouteInput[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    const line = r + 1;
    const get = (col: string) => (cells[idx[col]] ?? "").trim();

    const pickup = get("pickup_slug");
    const dropoff = get("dropoff_slug");
    const vclass = get("vehicle_class_slug");
    const serviceType = get("service_type");
    const priceStr = get("price");
    const returnStr = get("return_price");
    const distStr = get("distance_km");
    const durStr = get("estimated_duration_min");
    const label = get("source_label");
    const activeStr = get("active");

    const rowErrors: string[] = [];
    if (!pickup) rowErrors.push("pickup_slug verplicht");
    if (!dropoff) rowErrors.push("dropoff_slug verplicht");
    if (pickup && dropoff && pickup === dropoff) rowErrors.push("pickup en dropoff zijn gelijk");
    if (!vclass) rowErrors.push("vehicle_class_slug verplicht");
    if (!serviceType) rowErrors.push("service_type verplicht");
    else if (!ALLOWED_SERVICE_TYPES.includes(serviceType as (typeof ALLOWED_SERVICE_TYPES)[number]))
      rowErrors.push(`service_type '${serviceType}' ongeldig (toegestaan: ${ALLOWED_SERVICE_TYPES.join(", ")})`);

    const price = Number(priceStr);
    if (!priceStr || !Number.isFinite(price) || price <= 0) rowErrors.push("price moet > 0 zijn");

    let returnPrice: number | null = null;
    if (returnStr !== "") {
      returnPrice = Number(returnStr);
      if (!Number.isFinite(returnPrice) || returnPrice <= 0) rowErrors.push("return_price moet > 0 zijn");
      else if (Number.isFinite(price) && returnPrice < price) rowErrors.push("return_price moet >= price zijn");
    }

    const distance = Number(distStr);
    if (!distStr || !Number.isFinite(distance) || distance <= 0) rowErrors.push("distance_km moet > 0 zijn");

    const duration = Number(durStr);
    if (!durStr || !Number.isInteger(duration) || duration <= 0)
      rowErrors.push("estimated_duration_min moet een positief geheel getal zijn");

    if (rowErrors.length) {
      errors.push(`  regel ${line}: ${rowErrors.join("; ")}`);
      continue;
    }

    routes.push({
      line,
      pickup_slug: pickup,
      dropoff_slug: dropoff,
      vehicle_class_slug: vclass,
      service_type: serviceType,
      price,
      return_price: returnPrice,
      distance_km: distance,
      estimated_duration_min: duration,
      source_label: label || null,
      active: activeStr === "" ? true : parseBool(activeStr),
    });
  }

  // 3. Referenties ophalen (locations + vehicle_classes) en resolven
  const [{ data: locs, error: locErr }, { data: classes, error: clsErr }] = await Promise.all([
    supabase.from("locations").select("id, slug, active"),
    supabase.from("vehicle_classes").select("id, code, active"),
  ]);
  if (locErr) fail(`Kon locations niet lezen: ${locErr.message}`);
  if (clsErr) fail(`Kon vehicle_classes niet lezen: ${clsErr.message}`);

  const locMap = new Map<string, string>();
  for (const l of locs ?? []) if (l.active) locMap.set(l.slug, l.id);
  const clsMap = new Map<string, string>();
  for (const c of classes ?? []) if (c.active) clsMap.set(c.code, c.id);

  type Resolved = RouteInput & { pickupId: string; dropoffId: string; classId: string };
  const resolved: Resolved[] = [];
  for (const rt of routes) {
    const pickupId = locMap.get(rt.pickup_slug);
    const dropoffId = locMap.get(rt.dropoff_slug);
    const classId = clsMap.get(rt.vehicle_class_slug);
    const refErrors: string[] = [];
    if (!pickupId) refErrors.push(`onbekende pickup_slug '${rt.pickup_slug}'`);
    if (!dropoffId) refErrors.push(`onbekende dropoff_slug '${rt.dropoff_slug}'`);
    if (!classId) refErrors.push(`onbekende vehicle_class_slug '${rt.vehicle_class_slug}'`);
    if (refErrors.length) {
      errors.push(`  regel ${rt.line}: ${refErrors.join("; ")}`);
      continue;
    }
    resolved.push({ ...rt, pickupId: pickupId!, dropoffId: dropoffId!, classId: classId! });
  }

  // 4. Validatie-uitkomst
  if (errors.length) {
    console.error(`Validatie mislukt (${errors.length} probleem/problemen):`);
    console.error(errors.join("\n"));
    fail("Geen wijzigingen doorgevoerd. Corrigeer de CSV en probeer opnieuw.");
  }
  console.log(`Gevalideerd: ${resolved.length} route(s), 0 fouten.`);

  // 5. Bestaande actieve routes ophalen → insert vs update bepalen (idempotent)
  const { data: existing, error: exErr } = await supabase
    .from("fixed_route_prices")
    .select("id, pickup_location_id, dropoff_location_id, vehicle_class_id, active")
    .eq("active", true);
  if (exErr) fail(`Kon bestaande routes niet lezen: ${exErr.message}`);
  const existingMap = new Map<string, string>();
  for (const e of existing ?? []) {
    existingMap.set(`${e.pickup_location_id}|${e.dropoff_location_id}|${e.vehicle_class_id}`, e.id);
  }

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; fields: Record<string, unknown> }[] = [];
  const plan: string[] = [];
  for (const r of resolved) {
    const fields = {
      pickup_location_id: r.pickupId,
      dropoff_location_id: r.dropoffId,
      vehicle_class_id: r.classId,
      service_type: r.service_type,
      price: r.price,
      return_price: r.return_price,
      distance_km: r.distance_km,
      estimated_duration_min: r.estimated_duration_min,
      source_label: r.source_label,
      active: r.active,
    };
    const existingId = existingMap.get(`${r.pickupId}|${r.dropoffId}|${r.classId}`);
    if (existingId) {
      toUpdate.push({ id: existingId, fields });
      plan.push(`  UPDATE  ${r.pickup_slug} → ${r.dropoff_slug} [${r.vehicle_class_slug}]  €${r.price}/${r.return_price ?? "—"}`);
    } else {
      toInsert.push(fields);
      plan.push(`  INSERT  ${r.pickup_slug} → ${r.dropoff_slug} [${r.vehicle_class_slug}]  €${r.price}/${r.return_price ?? "—"}`);
    }
  }

  console.log(`\nPlan: ${toInsert.length} insert(s), ${toUpdate.length} update(s)`);
  console.log(plan.join("\n"));

  if (DRY_RUN) {
    console.log(`\n✓ DRY-RUN voltooid. Geen wijzigingen doorgevoerd.\n`);
    return;
  }

  // 6. Uitvoeren (service_role)
  if (toInsert.length) {
    const { error } = await supabase.from("fixed_route_prices").insert(toInsert);
    if (error) fail(`Insert mislukt: ${error.message}`);
  }
  for (const u of toUpdate) {
    const { error } = await supabase.from("fixed_route_prices").update(u.fields).eq("id", u.id);
    if (error) fail(`Update mislukt (id ${u.id}): ${error.message}`);
  }

  console.log(`\n✓ Import voltooid: ${toInsert.length} toegevoegd, ${toUpdate.length} bijgewerkt.\n`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
