/**
 * T4XI omgevings-guard (Sprint 7.5 — FASE C/D, correctieronde)
 * ────────────────────────────────────────────────────────────
 * Twee harde, code-afgedwongen invarianten die PRODUCTIE beschermen:
 *
 *   1. Stripe env/mode-guard — de COMBINATIE van APP_ENV, de server-side
 *      STRIPE_SECRET_KEY (sk_/rk_) en de publishable NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
 *      (pk_) moet consistent zijn:
 *        · development/staging → uitsluitend TEST-sleutels (sk_test_ + pk_test_).
 *        · production          → uitsluitend LIVE-sleutels (sk_live_ + pk_live_).
 *        · secret- en publishable-modus moeten ALTIJD gelijk zijn
 *          (sk_test_+pk_live_ en sk_live_+pk_test_ zijn nooit toegestaan).
 *      Detectie gebeurt PUUR op prefix. Sleutelwaarden komen nooit in errors,
 *      logs of responses — een onveilige combinatie meldt enkel de generieke
 *      tekst "Unsafe Stripe environment configuration.".
 *
 *   2. Supabase productie-guard — in élke niet-productie-omgeving mag de
 *      Supabase-URL NIET naar het productieproject wijzen
 *      (ref `ajdsiklxfmmgisdvarhv`, project t4xi-address-system). Zo kan een
 *      staging-deploy nooit stil productie muteren. Productie mét de productie-ref
 *      blijft geldig.
 *
 * SUBTILITEIT — waarom niet op NODE_ENV vertrouwen:
 *   Een staging-deploy van Next.js draait met NODE_ENV=production (build-modus).
 *   Zou de guard op NODE_ENV afgaan, dan zou staging als "productie" gelden en de
 *   guard UITSCHAKELEN — precies verkeerd. Daarom is `APP_ENV` de autoriteit;
 *   NODE_ENV is enkel de fallback voor lokaal draaien.
 *
 * BUILD-VEILIGHEID: ontbrekende/onbekende sleutels worden hier NIET afgekeurd —
 * `next build` mag niet crashen op afwezige config. De payment-laag zelf faalt
 * veilig bij ontbrekende sleutels (getStripeServer gooit, stripe-client degradeert).
 * Deze guard keurt uitsluitend AANWEZIGE, onveilige combinaties af.
 */

/** De productie-Supabase project-ref. Mag in niet-productie NOOIT de bron zijn. */
export const PRODUCTION_SUPABASE_REF = "ajdsiklxfmmgisdvarhv";

/** Generieke, lekvrije foutmelding — bevat nooit sleutelwaarden of env-namen. */
const UNSAFE_STRIPE_MESSAGE = "Unsafe Stripe environment configuration.";

export type AppEnv = "development" | "staging" | "production";
export type StripeKeyMode = "test" | "live" | "unknown";

/** Env-achtige bron. `process.env` voldoet; tests geven een deelverzameling. */
export type EnvLike = Record<string, string | undefined>;

/**
 * Bepaalt de logische app-omgeving. `APP_ENV` (of `NEXT_PUBLIC_APP_ENV`) is
 * leidend; alleen als die ontbreekt vallen we terug op NODE_ENV. Zo blijft een
 * staging-deploy (NODE_ENV=production) correct als niet-productie herkend.
 * Onbekende waarden en NODE_ENV=test gelden als 'development' (niet-productie).
 */
export function getAppEnv(env: EnvLike = process.env): AppEnv {
  const explicit = (env.APP_ENV ?? env.NEXT_PUBLIC_APP_ENV ?? "").trim().toLowerCase();
  if (explicit === "production" || explicit === "prod") return "production";
  if (explicit === "staging" || explicit === "stage") return "staging";
  if (explicit === "development" || explicit === "dev") return "development";

  // Geen (herkenbare) APP_ENV → val terug op NODE_ENV (lokaal/CI).
  const node = (env.NODE_ENV ?? "").trim().toLowerCase();
  if (node === "production") return "production";
  return "development";
}

/** True alleen voor de echte productie-omgeving. */
export function isProductionEnv(env: EnvLike = process.env): boolean {
  return getAppEnv(env) === "production";
}

/**
 * Leidt de modus (test/live) van een Stripe-sleutel af uit het prefix. Werkt voor
 * secret (sk_), restricted (rk_) én publishable (pk_) sleutels. Retourneert
 * 'unknown' voor een lege, ontbrekende of niet-herkende sleutel.
 */
export function stripeKeyMode(key: string | undefined | null): StripeKeyMode {
  const k = (key ?? "").trim();
  if (/^(sk|pk|rk)_test_/.test(k)) return "test";
  if (/^(sk|pk|rk)_live_/.test(k)) return "live";
  return "unknown";
}

/**
 * Stripe env/mode-guard (puur, testbaar, build-veilig).
 * Gooit een GENERIEKE fout bij een onveilige, AANWEZIGE combinatie:
 *   · niet-productie + een live-sleutel (secret of publishable);
 *   · productie + een test-sleutel (secret of publishable);
 *   · secret- en publishable-modus verschillen (beide bekend).
 * Onbekende/ontbrekende sleutels worden overgeslagen (geen build-crash).
 */
export function assertStripeEnvironment(
  appEnv: AppEnv,
  secretKey: string | undefined | null,
  publishableKey: string | undefined | null
): void {
  const secret = stripeKeyMode(secretKey);
  const publishable = stripeKeyMode(publishableKey);
  const prod = appEnv === "production";

  // 1. Elke bekende sleutel moet bij de omgeving passen.
  const mismatchesEnv = (mode: StripeKeyMode) =>
    mode !== "unknown" && (prod ? mode === "test" : mode === "live");
  if (mismatchesEnv(secret) || mismatchesEnv(publishable)) {
    throw new Error(UNSAFE_STRIPE_MESSAGE);
  }

  // 2. Secret en publishable mogen nooit uiteenlopen (beide bekend).
  if (secret !== "unknown" && publishable !== "unknown" && secret !== publishable) {
    throw new Error(UNSAFE_STRIPE_MESSAGE);
  }
}

/**
 * Haalt de project-ref uit een Supabase-URL (`https://<ref>.supabase.co`).
 * Retourneert null als de URL leeg of niet herkenbaar is.
 */
export function extractSupabaseRef(url: string | undefined | null): string | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  const m = u.match(/^https?:\/\/([a-z0-9]+)\.supabase\.(?:co|in|net)\b/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Supabase productie-guard (puur, testbaar).
 * Gooit als een niet-productie-omgeving naar het productieproject wijst. Zo kan
 * een staging-/development-deploy nooit stilletjes productie muteren. De
 * productie-ref is niet-geheim en mag in de melding staan; er komt geen key in.
 */
export function assertSupabaseNotProductionInNonProd(
  appEnv: AppEnv,
  supabaseUrl: string | undefined | null
): void {
  if (appEnv === "production") return;
  const ref = extractSupabaseRef(supabaseUrl);
  if (ref && ref === PRODUCTION_SUPABASE_REF) {
    throw new Error(
      `[env-guard] Supabase productie-ref '${PRODUCTION_SUPABASE_REF}' geweigerd in ` +
        `omgeving '${appEnv}'. Staging/development mag NOOIT naar productie wijzen — ` +
        "zet NEXT_PUBLIC_SUPABASE_URL naar het staging-project."
    );
  }
}

/**
 * Boot-guard: leest process.env en past beide invarianten toe. Roep dit aan op
 * een server-boot-pad (bv. de dev:staging-runner) zodat een fout-geconfigureerde
 * omgeving meteen faalt in plaats van stil naar productie/live te praten.
 * Leest geen enkele sleutel uit; geeft nooit een secret terug.
 */
export function assertSafeEnvironment(env: EnvLike = process.env): void {
  const appEnv = getAppEnv(env);
  assertStripeEnvironment(appEnv, env.STRIPE_SECRET_KEY, env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  assertSupabaseNotProductionInNonProd(appEnv, env.NEXT_PUBLIC_SUPABASE_URL);
}
