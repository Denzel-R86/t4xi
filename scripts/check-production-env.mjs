#!/usr/bin/env node
/**
 * T4XI productie-env preflight — MODES ONLY.
 * ──────────────────────────────────────────
 * Rapporteert uitsluitend modes/prefixes/refs/classificatie — NOOIT volledige
 * waarden, ook niet bij een fout. Bedoeld om vóór livegang te bevestigen dat de
 * productie-omgeving de juiste variabelen gebruikt.
 *
 * Veilige flow:
 *   vercel env pull .env.production.local --environment=production
 *   node scripts/check-production-env.mjs
 *   rm .env.production.local
 *
 * `.env.production.local` is git-ignored (.env*.local). Exit 0 = PASS, 1 = FAIL,
 * 2 = bestand niet gevonden.
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

/** Modus uit het prefix — nooit de sleutel zelf. */
function stripeMode(key) {
  const k = (key ?? "").trim();
  if (!k) return "missing";
  if (/^(sk|pk|rk)_test_/.test(k)) return "test";
  if (/^(sk|pk|rk)_live_/.test(k)) return "live";
  return "unknown";
}

/** Project-ref uit de Supabase-URL (ref is niet-geheim; staat in de publieke URL). */
function supabaseRef(url) {
  const m = (url ?? "").trim().match(/^https?:\/\/([a-z0-9]+)\.supabase\.(?:co|in|net)\b/i);
  return m ? m[1].toLowerCase() : null;
}

const path = resolve(process.cwd(), FILE);
const env = loadEnv(path);
if (!env) {
  console.error(`\n✗ Bestand niet gevonden: ${FILE}`);
  console.error("  Draai eerst: vercel env pull .env.production.local --environment=production\n");
  process.exit(2);
}

const secret = stripeMode(env.STRIPE_SECRET_KEY);
const publishable = stripeMode(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
const whsec = (env.STRIPE_WEBHOOK_SECRET ?? "").trim();
const webhook = whsec ? (whsec.startsWith("whsec_") ? "present (whsec_)" : "present (WRONG PREFIX)") : "missing";
const appEnv = ((env.APP_ENV ?? env.NEXT_PUBLIC_APP_ENV ?? "").trim()) || "(unset)";
const ref = supabaseRef(env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL);
const classification = ref === PROD_SUPABASE_REF ? "production" : ref === STAGING_SUPABASE_REF ? "staging" : "unknown";
const serviceRolePresent = Boolean((env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim());

// PASS-criteria voor een PRODUCTIE-deploy.
const checks = [
  ["APP_ENV = production", appEnv === "production"],
  ["Stripe secret mode = live", secret === "live"],
  ["Stripe publishable mode = live", publishable === "live"],
  ["Webhook secret present + whsec_ prefix", webhook === "present (whsec_)"],
  ["Supabase project-ref = productie", ref === PROD_SUPABASE_REF],
  ["Supabase project-ref != staging", ref !== STAGING_SUPABASE_REF],
  ["Service-role key present", serviceRolePresent],
];
const pass = checks.every(([, ok]) => ok);

console.log("\nT4XI productie-env preflight (modes only — geen waarden)\n");
console.log(`  APP_ENV:                 ${appEnv}`);
console.log(`  classificatie:           ${classification}`);
console.log(`  Stripe secret mode:      ${secret}`);
console.log(`  Stripe publishable mode: ${publishable}`);
console.log(`  Webhook secret:          ${webhook}`);
console.log(`  Supabase project-ref:    ${ref ?? "(onherkenbaar)"}`);
console.log(`  Service-role key:        ${serviceRolePresent ? "present" : "missing"}`);
console.log("");
for (const [name, ok] of checks) console.log(`  ${ok ? "✓" : "✗"} ${name}`);

// ── Informatief: e-mail/ops (NIET boot-kritisch → geen invloed op PASS/FAIL) ──
// Ontbreekt RESEND_API_KEY → transactionele mails worden overgeslagen, maar de
// boeking/betaling blijft werken. Daarom een waarschuwing, geen FAIL.
const present = (k) => Boolean((env[k] ?? "").trim());
console.log("\n  ── e-mail/ops (informatief, geen invloed op PASS/FAIL) ──");
console.log(`  ${present("RESEND_API_KEY") ? "✓" : "⚠"} RESEND_API_KEY ${present("RESEND_API_KEY") ? "present" : "missing → mails worden overgeslagen"}`);
console.log(`  ${present("RESEND_FROM") ? "✓" : "•"} RESEND_FROM    ${present("RESEND_FROM") ? "present" : "(unset → default onboarding@resend.dev sandbox)"}`);
console.log(`  ${present("OPS_EMAIL") ? "✓" : "•"} OPS_EMAIL      ${present("OPS_EMAIL") ? "present" : "(unset → default booking@t4xi.nl)"}`);

console.log(`\n  RESULTAAT: ${pass ? "PASS" : "FAIL"}  (gate = boot-guard-eisen; e-mail/ops apart hierboven)\n`);
process.exit(pass ? 0 : 1);
