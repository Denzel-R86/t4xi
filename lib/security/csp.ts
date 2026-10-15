/**
 * Nonce-CSP in REPORT-ONLY (Experience 2.0 · S1, masterplan §9).
 *
 * Twee CSP-headers leven naast elkaar:
 *   · `Content-Security-Policy` (next.config.mjs) — ONGEWIJZIGD en afgedwongen,
 *     met `'unsafe-inline'`. Die bepaalt wat de browser werkelijk blokkeert.
 *   · `Content-Security-Policy-Report-Only` (proxy.ts, deze module) — per request
 *     een nonce + `'strict-dynamic'`. De browser blokkeert hiermee NIETS; hij meldt
 *     alleen wat onder deze policy geblokkeerd zou zijn (console + report-uri).
 * Een browser evalueert elke policy apart: een resource moet door alle
 * afgedwongen policies heen; report-only policies rapporteren alleen. Een nonce
 * op een script schaadt de afgedwongen policy niet (`'unsafe-inline'` staat
 * daar nonce-loze én genoncede inline scripts toe, zolang die policy zelf GEEN
 * nonce bevat — voeg er dus nooit een nonce aan toe zolang `'unsafe-inline'`
 * nog nodig is: een nonce zet `'unsafe-inline'` in die policy uit).
 *
 * Next.js 16 leest de nonce uit de REQUEST-header `content-security-policy`
 * of — als die ontbreekt — `content-security-policy-report-only`
 * (next/dist/server/app-render/app-render.js) en zet hem op zijn eigen
 * framework-/chunk-/inline-scripts. Dat werkt alleen op DYNAMISCH gerenderde
 * pagina's; statisch voorgerenderde HTML heeft geen nonce (zie F-47).
 *
 * Pure functies, geen I/O: getest in csp.test.ts.
 */

export const CSP_REPORT_PATH = "/api/csp-report";

export type CspSources = {
  sanityProjectId: string;
  sanityDataset: string;
  /** Exacte https-origin van het Supabase-project, of null. */
  supabaseOrigin: string | null;
};

const SANITY_PROJECT_RE = /^[a-z0-9]+$/;
const SANITY_DATASET_RE = /^[a-z0-9_-]+$/;
/** base64/base64url, 16–64 tekens: dezelfde tekenset die Next accepteert. */
const NONCE_RE = /^[A-Za-z0-9+/_-]{16,64}={0,2}$/;

/**
 * Leest de publieke bronnen met dezelfde strikte validatie als next.config.mjs:
 * een environment-waarde mag nooit een extra origin of directive injecteren.
 * Ongeldig → null (de proxy laat de report-only header dan weg; de afgedwongen
 * CSP en de build-guard in next.config.mjs blijven de autoriteit).
 */
export function cspSourcesFromEnv(env: Record<string, string | undefined>): CspSources | null {
  const sanityProjectId = env.NEXT_PUBLIC_SANITY_PROJECT_ID?.trim() || "95pzjxjq";
  const sanityDataset = env.NEXT_PUBLIC_SANITY_DATASET?.trim() || "production";
  if (!SANITY_PROJECT_RE.test(sanityProjectId) || !SANITY_DATASET_RE.test(sanityDataset)) return null;
  let supabaseOrigin: string | null = null;
  try {
    const raw = env.NEXT_PUBLIC_SUPABASE_URL;
    if (raw) {
      const parsed = new URL(raw);
      if (parsed.protocol === "https:") supabaseOrigin = parsed.origin;
    }
  } catch {
    supabaseOrigin = null;
  }
  return { sanityProjectId, sanityDataset, supabaseOrigin };
}

/** 128 bit uit de CSPRNG, base64. Uniek per request. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** De report-only policy. Deterministisch op de nonce na. */
export function buildReportOnlyCsp(nonce: string, sources: CspSources, opts: { isDev: boolean }): string {
  if (!NONCE_RE.test(nonce)) throw new Error("Ongeldige CSP-nonce.");
  const { sanityProjectId, sanityDataset, supabaseOrigin } = sources;
  const stripeJs = "https://js.stripe.com https://*.js.stripe.com";
  const link = "https://link.com https://*.link.com";
  return [
    "default-src 'self'",
    // Nonce + strict-dynamic: alleen scripts met de nonce, plus wat díé scripts
    // laden (Next-chunks, Stripe.js via loadStripe). 'self' en de hosts zijn
    // alleen fallback voor CSP2-browsers; CSP3 negeert ze naast strict-dynamic.
    // Dev: React/Next gebruiken eval voor foutstacks.
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'self' ${stripeJs}${opts.isDev ? " 'unsafe-eval'" : ""}`,
    // Stijlen blijven zoals afgedwongen: React style-attributen en Stripe/next-font
    // inline-stijlen. Een nonce hier zou 'unsafe-inline' uitschakelen. Buiten S1.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src 'self' data: blob: https://cdn.sanity.io/images/${sanityProjectId}/${sanityDataset}/ https://*.stripe.com https://*.link.com`,
    "worker-src 'self' blob:",
    [
      "connect-src 'self'",
      supabaseOrigin ?? "",
      "https://api.pdok.nl https://places.googleapis.com",
      "https://api.stripe.com https://maps.googleapis.com",
      link,
      `https://${sanityProjectId}.api.sanity.io https://${sanityProjectId}.apicdn.sanity.io wss://${sanityProjectId}.api.sanity.io`,
    ].filter(Boolean).join(" "),
    `frame-src 'self' ${stripeJs} https://hooks.stripe.com ${link}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Gelijk aan de afgedwongen header + X-Frame-Options SAMEORIGIN (Presentation).
    "frame-ancestors 'self'",
    `report-uri ${CSP_REPORT_PATH}`,
  ].join("; ");
}
