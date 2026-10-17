/**
 * Secret-patronen voor de build-output-scan (S1, scripts/scan-build-secrets.ts).
 *
 * Doel: geen server-geheim in de browser. Twee bronnen:
 *   1. de client-bundels in `.next/static` (alles wat de browser kan downloaden);
 *   2. de waarden van `NEXT_PUBLIC_*` (die Next in diezelfde bundels inlijnt).
 * Plus: een `NEXT_PUBLIC_*`-NAAM die op een geheim wijst is al fout, ook als de
 * waarde (nog) leeg is.
 *
 * Bewust GEEN treffer: Stripe publishable keys (pk_live_/pk_test_), de Supabase
 * anon-key (JWT met role=anon), Sanity project-ID's. Die zijn publiek bedoeld.
 */

export type SecretFinding = { pattern: string; where: string; excerpt: string };

type Pattern = { name: string; re: RegExp };

export const SECRET_PATTERNS: Pattern[] = [
  { name: "stripe-secret-key", re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{10,}/g },
  { name: "stripe-webhook-secret", re: /\bwhsec_[A-Za-z0-9]{16,}/g },
  { name: "supabase-service-name", re: /SUPABASE_SERVICE|SUPABASE_SECRET/g },
  { name: "service_role", re: /service_role/g },
  { name: "supabase-secret-key", re: /\bsb_secret_[A-Za-z0-9_-]{10,}/g },
  { name: "private-key-block", re: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g },
  { name: "aws-access-key-id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: "slack-token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { name: "resend-api-key", re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/g },
  { name: "sanity-token", re: /\bsk[A-Za-z0-9]{78,}\b/g },
];

const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

/** Namen die een geheim suggereren mogen nooit NEXT_PUBLIC_ zijn. */
export const SECRET_NAME_RE = /SECRET|SERVICE|PRIVATE|PASSWORD|PASSWD|TOKEN|WEBHOOK|(?<!PUBLISHABLE_|ANON_)API_KEY$|_SK$/;

function excerpt(text: string, index: number, length: number): string {
  const raw = text.slice(index, index + Math.min(length, 24));
  // Nooit het volledige geheim teruggeven: het rapport kan in CI-logs belanden.
  return raw.length > 10 ? `${raw.slice(0, 10)}…(${length} tekens)` : raw;
}

function jwtRole(token: string): string | null {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as { role?: unknown };
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

/** Alle treffers in één tekst (bundel of env-waarde). */
export function scanText(text: string, where: string): SecretFinding[] {
  const out: SecretFinding[] = [];
  for (const { name, re } of SECRET_PATTERNS) {
    for (const m of text.matchAll(re)) out.push({ pattern: name, where, excerpt: excerpt(text, m.index ?? 0, m[0].length) });
  }
  for (const m of text.matchAll(JWT_RE)) {
    const role = jwtRole(m[0]);
    if (role && role !== "anon" && role !== "authenticated") {
      out.push({ pattern: `jwt-role-${role}`, where, excerpt: excerpt(text, m.index ?? 0, m[0].length) });
    }
  }
  return out;
}

/** NEXT_PUBLIC_*-namen en -waarden uit een env-object. */
export function scanPublicEnv(env: Record<string, string | undefined>): SecretFinding[] {
  const out: SecretFinding[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("NEXT_PUBLIC_")) continue;
    const bare = key.slice("NEXT_PUBLIC_".length);
    if (SECRET_NAME_RE.test(bare)) out.push({ pattern: "secret-like-public-name", where: `env:${key}`, excerpt: key });
    if (value) out.push(...scanText(value, `env:${key}`));
  }
  return out;
}

/** NEXT_PUBLIC_*-namen die de broncode leest (`process.env.NEXT_PUBLIC_<NAAM>`). */
export function publicEnvNamesInSource(source: string): string[] {
  return [...new Set([...source.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)].map((m) => m[1]))];
}
