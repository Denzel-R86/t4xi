/**
 * Schiphol Public Flight API — OAuth2 client-credentials tokenprovider (v4-gateway).
 *
 * De v4-gateway authenticeert met een KORTLEVEND JWT bearer token (OAuth2
 * `client_credentials`) in plaats van de oude `app_id`/`app_key`-headers. Dit is de
 * ENIGE plek die het token ophaalt en in-process cachet tot net vóór de expiry.
 *
 * SERVER-ONLY: `SCHIPHOL_CLIENT_ID` / `SCHIPHOL_CLIENT_SECRET` worden uit
 * process.env gelezen en gaan uitsluitend in de token-request-body. Ze komen NOOIT
 * in een respons, in een error of in een log. Importeer dit bestand niet in
 * client-componenten.
 */

/** Productie-tokenendpoint (Auth0). Override via SCHIPHOL_TOKEN_URL voor acceptance. */
const DEFAULT_TOKEN_URL = "https://api.auth.schiphol.nl/oauth/token";
/** Productie-audience. Override via SCHIPHOL_AUDIENCE voor acceptance. */
const DEFAULT_AUDIENCE = "https://api.schiphol.nl/public";
const DEFAULT_TIMEOUT_MS = 8000;
/** Fallback-levensduur als de respons geen bruikbare `expires_in` bevat (30 min). */
const DEFAULT_EXPIRES_IN_SEC = 1800;
/** Vernieuw het token iets vóór de echte expiry (klokverschil / latency). */
const EXPIRY_SKEW_SEC = 60;

/** Leest een env-var en trimt; lege/afwezige waarde → undefined. */
function envTrim(name: string): string | undefined {
  const v = (process.env[name] ?? "").trim();
  return v === "" ? undefined : v;
}

export type SchipholCredentials = { clientId: string; clientSecret: string };

/**
 * Leest de Schiphol-credentials uit de omgeving. Retourneert null zodra één van
 * beide ontbreekt — de aanroeper vertaalt dat naar "not_configured" (nooit een
 * halfbakken token-request).
 */
export function schipholCredentials(
  env: Record<string, string | undefined> = process.env
): SchipholCredentials | null {
  const clientId = (env.SCHIPHOL_CLIENT_ID ?? "").trim();
  const clientSecret = (env.SCHIPHOL_CLIENT_SECRET ?? "").trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Uitkomst van een tokenacquisitie — geen exceptions voor verwachte gevallen. */
export type TokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not_configured" }
  | { ok: false; reason: "unauthorized"; status: number }
  | { ok: false; reason: "network_error" }
  | { ok: false; reason: "invalid_response"; status: number };

/** Injecteerbare afhankelijkheden — maakt de provider testbaar zonder netwerk. */
export type TokenProviderDeps = {
  fetchImpl?: typeof fetch;
  credentials?: SchipholCredentials | null;
  tokenUrl?: string;
  audience?: string;
  timeoutMs?: number;
  /** Testinjectie: huidige tijd in ms (standaard Date.now). */
  now?: () => number;
};

type CacheEntry = { token: string; expiresAtMs: number };
/** In-process cache per (tokenUrl|audience|clientId). Deelt het token binnen een warme lambda. */
const tokenCache = new Map<string, CacheEntry>();

function cacheKey(tokenUrl: string, audience: string, clientId: string): string {
  return `${tokenUrl}|${audience}|${clientId}`;
}

/**
 * Wist de tokencache. Voor tests en voor 401-invalidatie: als de upstream een
 * (gecachet) token afwijst, forceert dit een verse acquisitie bij de volgende call.
 */
export function resetSchipholTokenCache(): void {
  tokenCache.clear();
}

/**
 * Haalt (of hergebruikt) een geldig bearer-token. Cachet tot `EXPIRY_SKEW_SEC`
 * vóór de door de upstream opgegeven expiry. Faalt nooit met een exception voor
 * verwachte gevallen — die komen terug als een getypeerd resultaat.
 */
export async function getSchipholAccessToken(deps: TokenProviderDeps = {}): Promise<TokenResult> {
  const credentials = deps.credentials ?? schipholCredentials();
  if (!credentials) return { ok: false, reason: "not_configured" };

  const fetchImpl = deps.fetchImpl ?? fetch;
  // Default = productie; override via env (bv. acceptance) of deps (tests).
  const tokenUrl = deps.tokenUrl ?? envTrim("SCHIPHOL_TOKEN_URL") ?? DEFAULT_TOKEN_URL;
  const audience = deps.audience ?? envTrim("SCHIPHOL_AUDIENCE") ?? DEFAULT_AUDIENCE;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = deps.now ?? Date.now;

  const key = cacheKey(tokenUrl, audience, credentials.clientId);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAtMs > now()) {
    return { ok: true, token: cached.token };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        audience,
      }),
      signal: controller.signal,
    });
  } catch {
    // Timeout of netwerkfout — geen upstream-status beschikbaar.
    return { ok: false, reason: "network_error" };
  } finally {
    clearTimeout(timer);
  }

  // Verkeerde client_id/secret → apart van een generieke fout, zodat de
  // health-check dit gericht als "unauthorized" kan melden.
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "unauthorized", status: res.status };
  }
  if (!res.ok) {
    return { ok: false, reason: "invalid_response", status: res.status };
  }

  let body: { access_token?: unknown; expires_in?: unknown };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, reason: "invalid_response", status: res.status };
  }

  const token = typeof body.access_token === "string" ? body.access_token.trim() : "";
  if (!token) return { ok: false, reason: "invalid_response", status: res.status };

  const expiresInSec =
    typeof body.expires_in === "number" && body.expires_in > 0
      ? body.expires_in
      : DEFAULT_EXPIRES_IN_SEC;
  const ttlMs = Math.max(0, expiresInSec - EXPIRY_SKEW_SEC) * 1000;
  tokenCache.set(key, { token, expiresAtMs: now() + ttlMs });
  return { ok: true, token };
}
