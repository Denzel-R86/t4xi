/**
 * T4XI expliciete staging-runner (Sprint 7.5 — FASE 4)
 * ─────────────────────────────────────────────────────
 * Start `next dev` tegen het STAGING-project zonder dat `.env.local` de
 * stagingwaarden kan overschrijven.
 *
 * WAAROM GEEN kaal `.env.staging.local`-bestand: bewezen met @next/env
 * (loadEnvConfig) dat Next een `.env.staging.local` NIET automatisch laadt
 * ('staging' is geen NODE_ENV), terwijl `.env.local` bij `next dev` wél laadt.
 * Een naïeve wrapper zou dus productiewaarden uit `.env.local` laten winnen.
 *
 * DE VEILIGE OPLOSSING: variabelen die al in process.env staan worden door Next
 * NIET overschreven (ook empirisch bewezen). Deze runner leest daarom
 * `.env.staging.local`, injecteert de waarden HARD in process.env vóór Next start
 * en neutraliseert zo conflicterende `.env.local`-waarden voor exact die keys.
 * Daarna valideert hij de omgeving (assertSafeEnvironment) en start `next dev`.
 *
 * Gebruik:  npm run dev:staging
 * Vereist:  .env.staging.local (git-ignored) met de staging-waarden.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { assertSafeEnvironment, getAppEnv } from "@/lib/config/environment";

const ENV_FILE = ".env.staging.local";

/** Sleutels die staging expliciet moet leveren zodat `.env.local` ze niet vult. */
const REQUIRED_KEYS = [
  "APP_ENV",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

function fail(msg: string): never {
  // Nooit sleutelwaarden loggen — alleen namen/omgeving.
  console.error(`\n✗ dev:staging — ${msg}\n`);
  process.exit(1);
}

/** Minimalistische .env-parser (geen dependency), quotes worden gestript. */
function parseEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

function main(): void {
  const path = resolve(process.cwd(), ENV_FILE);
  if (!existsSync(path)) {
    fail(`${ENV_FILE} ontbreekt. Maak het aan met de staging-waarden (zie .env.example).`);
  }

  const parsed = parseEnvFile(path);

  const missing = REQUIRED_KEYS.filter((k) => !parsed[k] || parsed[k].trim() === "");
  if (missing.length) fail(`${ENV_FILE} mist verplichte sleutel(s): ${missing.join(", ")}`);

  if ((parsed.APP_ENV ?? "").trim().toLowerCase() !== "staging") {
    fail(`${ENV_FILE} moet APP_ENV=staging bevatten (gevonden: '${parsed.APP_ENV ?? ""}').`);
  }

  // HARD injecteren: process.env wint van elke latere Next-laad van .env.local.
  for (const [k, v] of Object.entries(parsed)) process.env[k] = v;
  // NODE_ENV blijft door Next op 'development' gezet; APP_ENV stuurt de guard.

  // Fail-fast: onveilige combinatie (prod-ref of live-sleutel) → stop vóór start.
  try {
    assertSafeEnvironment(process.env);
  } catch (e) {
    fail((e as Error).message);
  }

  console.log(`\n▶ dev:staging — omgeving '${getAppEnv(process.env)}', Supabase/Stripe uit ${ENV_FILE} geïnjecteerd.\n`);

  const bin = resolve(process.cwd(), "node_modules/.bin/next");
  const child = spawn(bin, ["dev"], { stdio: "inherit", env: process.env });
  child.on("exit", (code) => process.exit(code ?? 0));
}

main();
