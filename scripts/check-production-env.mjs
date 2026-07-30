#!/usr/bin/env node
/**
 * T4XI productie-env preflight — MODES ONLY, drie-staten.
 * ──────────────────────────────────────────────────────
 * Rapporteert nooit volledige waarden. Staten per check:
 *   ✓ PASS          — leesbaar en inhoudelijk correct
 *   ⚠ UNVERIFIABLE  — variabele aanwezig maar waarde niet uitleesbaar (Vercel "Sensitive")
 *   ✗ FAIL          — ontbreekt, leeg waar dat niet mag, of inhoudelijk fout
 *
 * UNVERIFIABLE blokkeert de merge NIET: de boot-guard (assertSafeEnvironment in
 * instrumentation.ts) verifieert de echte waarde bij server-start. Alleen
 * server-secrets kunnen "Sensitive"/UNVERIFIABLE zijn; publieke NEXT_PUBLIC_*-vars
 * en APP_ENV zijn dat nooit → daar geldt leeg/ontbrekend gewoon als FAIL.
 *
 * Flow:
 *   vercel env pull .env.production.local --environment=production
 *   node scripts/check-production-env.mjs
 *   rm .env.production.local
 *
 * Exit: 0 = PASS · 2 = UNVERIFIABLE (geen FAIL) · 1 = FAIL · 3 = bestand niet gevonden.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PROD_SUPABASE_REF = "ajdsiklxfmmgisdvarhv";
const STAGING_SUPABASE_REF = "ztlhydagjqfzkyfiqgio";
const FILE = process.argv[2] ?? ".env.production.local";

function loadEnv(file) {
  if (!existsSync(file)) return null;
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

/** Project-ref uit de Supabase-URL (niet-geheim; staat in de publieke URL). */
function supabaseRef(url) {
  const m = (url ?? "").trim().match(/^https?:\/\/([a-z0-9]+)\.supabase\.(?:co|in|net)\b/i);
  return m ? m[1].toLowerCase() : null;
}

const path = resolve(process.cwd(), FILE);
const env = loadEnv(path);
if (!env) {
  console.error(`\n✗ Bestand niet gevonden: ${FILE}`);
  console.error("  Draai eerst: vercel env pull .env.production.local --environment=production\n");
  process.exit(3);
}

/**
 * Drie-staten-classificatie voor één variabele.
 *   ontbrekend                → FAIL
 *   aanwezig maar leeg + sensitive  → UNVERIFIABLE (Vercel Sensitive: value niet uitleesbaar)
 *   aanwezig maar leeg + publiek    → FAIL
 *   leesbaar                  → validator → PASS/FAIL
 */
function stateOf(key, { sensitive = false, validator = () => true } = {}) {
  if (!(key in env)) return "FAIL";
  const v = (env[key] ?? "").trim();
  if (v === "") return sensitive ? "UNVERIFIABLE" : "FAIL";
  return validator(v) ? "PASS" : "FAIL";
}

const checks = [
  ["APP_ENV = production",                          stateOf("APP_ENV", { validator: (v) => v.toLowerCase() === "production" })],
  ["STRIPE_SECRET_KEY = sk_live_",                  stateOf("STRIPE_SECRET_KEY", { sensitive: true, validator: (v) => v.startsWith("sk_live_") })],
  ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_live_", stateOf("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", { validator: (v) => v.startsWith("pk_live_") })],
  ["STRIPE_WEBHOOK_SECRET = whsec_",                stateOf("STRIPE_WEBHOOK_SECRET", { sensitive: true, validator: (v) => v.startsWith("whsec_") })],
  ["NEXT_PUBLIC_SUPABASE_URL = productie-ref",      stateOf("NEXT_PUBLIC_SUPABASE_URL", { validator: (v) => supabaseRef(v) === PROD_SUPABASE_REF })],
  ["NEXT_PUBLIC_SUPABASE_URL != staging-ref",       stateOf("NEXT_PUBLIC_SUPABASE_URL", { validator: (v) => supabaseRef(v) !== STAGING_SUPABASE_REF })],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY present",         stateOf("NEXT_PUBLIC_SUPABASE_ANON_KEY")],
  ["SUPABASE_SERVICE_ROLE_KEY present",             stateOf("SUPABASE_SERVICE_ROLE_KEY", { sensitive: true })],
];

const SYM = { PASS: "✓", FAIL: "✗", UNVERIFIABLE: "⚠" };
const anyFail = checks.some(([, s]) => s === "FAIL");
const anyUnv = checks.some(([, s]) => s === "UNVERIFIABLE");
const result = anyFail ? "FAIL" : anyUnv ? "UNVERIFIABLE" : "PASS";
const exitCode = anyFail ? 1 : anyUnv ? 2 : 0;

const ref = supabaseRef(env.NEXT_PUBLIC_SUPABASE_URL);
const classification = ref === PROD_SUPABASE_REF ? "production" : ref === STAGING_SUPABASE_REF ? "staging" : "unknown";

console.log("\nT4XI productie-env preflight (modes only — geen waarden)\n");
console.log(`  classificatie (uit Supabase-URL): ${classification}\n`);
for (const [name, s] of checks) console.log(`  ${SYM[s]} ${name}  [${s}]`);

// Informatief: e-mail/ops (nooit boot-kritisch → geen invloed op het resultaat).
const present = (k) => Boolean((env[k] ?? "").trim());
console.log("\n  ── e-mail/ops (informatief, geen invloed op resultaat) ──");
console.log(`  ${present("RESEND_API_KEY") ? "✓" : "⚠"} RESEND_API_KEY ${present("RESEND_API_KEY") ? "present" : "missing → mails worden overgeslagen"}`);
console.log(`  ${present("RESEND_FROM") ? "✓" : "•"} RESEND_FROM    ${present("RESEND_FROM") ? "present" : "(unset → default onboarding@resend.dev)"}`);
console.log(`  ${present("OPS_EMAIL") ? "✓" : "•"} OPS_EMAIL      ${present("OPS_EMAIL") ? "present" : "(unset → default booking@t4xi.nl)"}`);

console.log(`\n  RESULTAAT: ${result}`);
if (result === "UNVERIFIABLE") {
  console.log("  Geen FAIL — enkel Sensitive-secrets niet uitleesbaar; de boot-guard verifieert bij runtime. Merge is toegestaan.");
} else if (result === "FAIL") {
  console.log("  Eén of meer vars ontbreken/onjuist — corrigeer in Vercel vóór de merge.");
}
console.log("");
process.exit(exitCode);
