/**
 * Bewijst dat een echte database dezelfde vaste-routetarieven draagt als de
 * canonieke baseline in de migratieketen.
 *
 * Waarom dit een script is en geen unit test: de 722 bestaande pricingtests mocken
 * de database. Daardoor kon een verse installatie 47 in plaats van 89 routes
 * opleveren zonder dat één test viel. Deze verificatie vraagt de database zelf.
 *
 *   npx tsx scripts/pricing/verify-canonical-baseline.ts
 *
 * Verwacht NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY. Leest alleen;
 * schrijft nooit. Exitcode 1 bij afwijking, zodat CI erop kan falen.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BASELINE = "supabase/migrations/20260928120000_pricing_canonical_baseline.sql";

/** De business-fingerprint van de productiestate die op 2026-09-28 is gecanoniseerd. */
const CANONICAL_FINGERPRINT = "33f15a3daf68e071ad363791ea529c68";

type Row = {
  pickup: string;
  dropoff: string;
  vclass: string;
  price: string;
  returnPrice: string;
  active: string;
};

const keyOf = (r: Row): string => `${r.pickup}>${r.dropoff}:${r.vclass}`;

/**
 * Veld voor veld, gelijk aan `order by pickup, dropoff, vclass` in de database.
 * Sorteren op de samengestelde sleutel geeft een andere orde — '-' komt vóór '>'
 * — en daarmee een andere hash dan de canonieke fingerprint.
 */
function sortRows(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    if (a.pickup !== b.pickup) return a.pickup < b.pickup ? -1 : 1;
    if (a.dropoff !== b.dropoff) return a.dropoff < b.dropoff ? -1 : 1;
    return a.vclass < b.vclass ? -1 : a.vclass > b.vclass ? 1 : 0;
  });
}

function fingerprint(rows: Row[]): string {
  const payload = sortRows(rows)
    .map((r) => `${keyOf(r)}=${r.price}/${r.returnPrice}/${r.active}`)
    .join("|");
  return createHash("md5").update(payload).digest("hex");
}

/** De canonieke set zoals de migratie hem vastlegt. */
function expectedRows(): Row[] {
  const sql = readFileSync(BASELINE, "utf8");
  const block = /insert into _canonical_pricing values\n([\s\S]*?);\n/.exec(sql);
  if (!block) throw new Error("canonieke dataset niet gevonden in de baseline-migratie");
  return block[1]
    .trim()
    .split("\n")
    .map((line) => {
      const f = line.trim().replace(/,$/, "").replace(/^\(|\)$/g, "").split(",");
      const [pickup, dropoff, vclass, price, returnPrice, active] = f.map((x) =>
        x.trim().replace(/^'|'$/g, ""),
      );
      return {
        pickup,
        dropoff,
        vclass,
        price,
        returnPrice: returnPrice === "null" ? "-" : returnPrice,
        active,
      };
    });
}

/** Wat de database werkelijk draagt, opgehaald via de stabiele business key. */
async function actualRows(): Promise<Row[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY vereist");
  const client = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await client.from("fixed_route_prices").select(
    `price, return_price, active,
     pickup:locations!fixed_route_prices_pickup_location_id_fkey ( slug ),
     dropoff:locations!fixed_route_prices_dropoff_location_id_fkey ( slug ),
     vclass:vehicle_classes ( code )`,
  );
  if (error) throw new Error(`query mislukt: ${error.message}`);

  return (data ?? []).map((r: Record<string, unknown>) => {
    const pickup = (r.pickup as { slug: string } | null)?.slug;
    const dropoff = (r.dropoff as { slug: string } | null)?.slug;
    const vclass = (r.vclass as { code: string } | null)?.code;
    if (!pickup || !dropoff || !vclass) {
      throw new Error("een prijsrij mist een slug of vehicle-class code");
    }
    // Numeric komt als number terug; de baseline noteert twee decimalen.
    const price = Number(r.price).toFixed(2);
    const returnPrice = r.return_price == null ? "-" : Number(r.return_price).toFixed(2);
    return { pickup, dropoff, vclass, price, returnPrice, active: String(r.active) };
  });
}

async function main(): Promise<void> {
  const expected = expectedRows();
  const actual = await actualRows();

  const expectedKeys = new Set(expected.map(keyOf));
  const actualKeys = new Set(actual.map(keyOf));
  const missing = [...expectedKeys].filter((k) => !actualKeys.has(k));
  const extra = [...actualKeys].filter((k) => !expectedKeys.has(k));

  const expectedFp = fingerprint(expected);
  const actualFp = fingerprint(actual);

  console.log(`canonieke rijen : ${expected.length}  fingerprint ${expectedFp}`);
  console.log(`database rijen  : ${actual.length}  fingerprint ${actualFp}`);
  console.log(`vereist         : ${CANONICAL_FINGERPRINT}`);
  if (missing.length) console.error(`ONTBREKEND (${missing.length}): ${missing.slice(0, 10).join(", ")}`);
  if (extra.length) console.error(`ONVERWACHT (${extra.length}): ${extra.slice(0, 10).join(", ")}`);

  if (expectedFp !== actualFp || missing.length || extra.length) {
    const drift = actual
      .filter((a) => {
        const e = expected.find((x) => keyOf(x) === keyOf(a));
        return e && (e.price !== a.price || e.returnPrice !== a.returnPrice || e.active !== a.active);
      })
      .slice(0, 10);
    for (const d of drift) {
      const e = expected.find((x) => keyOf(x) === keyOf(d))!;
      console.error(`DRIFT ${keyOf(d)}: canoniek ${e.price}/${e.returnPrice}/${e.active} vs database ${d.price}/${d.returnPrice}/${d.active}`);
    }
    console.error("FAIL — de database wijkt af van de canonieke prijsbaseline");
    process.exit(1);
  }
  if (expectedFp !== CANONICAL_FINGERPRINT) {
    console.error(`FAIL — de baseline levert ${expectedFp} in plaats van de gecanoniseerde ${CANONICAL_FINGERPRINT}`);
    process.exit(1);
  }
  console.log("PASS — database en canonieke baseline zijn business-identiek");
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
