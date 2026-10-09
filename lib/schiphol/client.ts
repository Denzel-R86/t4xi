/**
 * Schiphol Public Flight API — server-side client (v4 OAuth2-gateway).
 *
 * DUNNE HTTP-laag boven de Schiphol-gateway `https://api.schiphol.nl/public/public-flights/v4`.
 * Bevat GEEN normalisatie of businesslogica (dat doet lib/schiphol/service.ts) — hij
 * bouwt de request, zet de bearer-auth en geeft een ruw, getypeerd resultaat terug.
 *
 * AUTH: de v4-gateway gebruikt een kortlevend OAuth2 client-credentials JWT
 * (`Authorization: Bearer <token>`), opgehaald en gecachet in lib/schiphol/auth.ts.
 * De oude `app_id`/`app_key`- en `ResourceVersion`-headers bestaan niet meer; er is
 * GEEN fallback naar die oude auth.
 *
 * SERVER-ONLY: de credentials worden via auth.ts uit process.env gelezen en gaan
 * uitsluitend in de token-request. Ze komen NOOIT in de respons, in een error of in
 * een log. Importeer dit bestand niet in client-componenten.
 */

import type { RawSchipholFlightsResponse } from "./types";
import {
  getSchipholAccessToken,
  resetSchipholTokenCache,
  schipholCredentials,
  type SchipholCredentials,
  type TokenProviderDeps,
  type TokenResult,
} from "./auth";

const DEFAULT_BASE_URL = "https://api.schiphol.nl/public/public-flights/v4";
const DEFAULT_TIMEOUT_MS = 8000;

/** Leest een env-var en trimt; lege/afwezige waarde → undefined. */
function envTrim(name: string): string | undefined {
  const v = (process.env[name] ?? "").trim();
  return v === "" ? undefined : v;
}

// Re-export zodat bestaande importeurs (service.ts) één ingang houden.
export { schipholCredentials, resetSchipholTokenCache };
export type { SchipholCredentials };

/**
 * Parseert de HTTP `Retry-After`-header: een geheel aantal seconden, of een
 * HTTP-datum. Retourneert seconden (>= 0) of undefined bij een lege/ongeldige waarde.
 */
export function parseRetryAfter(value: string | null): number | undefined {
  const raw = (value ?? "").trim();
  if (raw === "") return undefined;
  if (/^\d+$/.test(raw)) return Number(raw);
  const when = Date.parse(raw);
  if (Number.isNaN(when)) return undefined;
  return Math.max(0, Math.ceil((when - Date.now()) / 1000));
}

/** Injecteerbare afhankelijkheden — maakt de client testbaar zonder netwerk. */
export type SchipholClientDeps = {
  /** Fetch voor de API-call (en, zonder eigen injectie, voor de tokenacquisitie). */
  fetchImpl?: typeof fetch;
  credentials?: SchipholCredentials | null;
  baseUrl?: string;
  timeoutMs?: number;
  /** Vooraf opgehaald bearer-token; slaat de OAuth-tokenacquisitie over (tests). */
  accessToken?: string;
  /** Override voor de tokenacquisitie (tests). Standaard: de echte OAuth-provider. */
  tokenProvider?: (deps: TokenProviderDeps) => Promise<TokenResult>;
  /** Override tokenendpoint/audience (acceptance-omgeving). */
  tokenUrl?: string;
  audience?: string;
};

/** Uitkomst van een ruwe client-call — geen exceptions voor verwachte gevallen. */
export type SchipholClientResult =
  | { ok: true; status: number; data: RawSchipholFlightsResponse }
  | { ok: false; reason: "not_configured" }
  | { ok: false; reason: "unauthorized"; status: number }
  | { ok: false; reason: "http_error"; status: number; retryAfterSeconds?: number }
  | { ok: false; reason: "network_error" }
  | { ok: false; reason: "invalid_json"; status: number };

/** Mapt een mislukte tokenacquisitie op het bijbehorende client-resultaat. */
function clientFailureFromToken(
  token: Exclude<TokenResult, { ok: true }>
): Exclude<SchipholClientResult, { ok: true }> {
  switch (token.reason) {
    case "not_configured":
      return { ok: false, reason: "not_configured" };
    case "unauthorized":
      return { ok: false, reason: "unauthorized", status: token.status };
    case "network_error":
      return { ok: false, reason: "network_error" };
    case "invalid_response":
      return { ok: false, reason: "http_error", status: token.status };
  }
}

/** Haalt een bearer-token op: expliciete override → injectie → echte provider. */
async function resolveToken(
  deps: SchipholClientDeps,
  credentials: SchipholCredentials
): Promise<TokenResult> {
  if (deps.accessToken) return { ok: true, token: deps.accessToken };
  const provider = deps.tokenProvider ?? getSchipholAccessToken;
  return provider({
    credentials,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.tokenUrl ? { tokenUrl: deps.tokenUrl } : {}),
    ...(deps.audience ? { audience: deps.audience } : {}),
    ...(deps.timeoutMs ? { timeoutMs: deps.timeoutMs } : {}),
  });
}

/** Eén GET naar `/flights` met het meegegeven token. Geen retry, geen tokenlogica. */
async function requestFlights(
  query: Record<string, string>,
  token: string,
  opts: { fetchImpl: typeof fetch; baseUrl: string; timeoutMs: number }
): Promise<SchipholClientResult> {
  const url = new URL(`${opts.baseUrl}/flights`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  let res: Response;
  try {
    res = await opts.fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
  } catch {
    // Timeout of netwerkfout — geen upstream-status beschikbaar.
    return { ok: false, reason: "network_error" };
  } finally {
    clearTimeout(timer);
  }

  // Token geweigerd (verlopen/ingetrokken) → apart van een generieke http-fout.
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "unauthorized", status: res.status };
  }
  if (!res.ok) {
    // 429: honoreer de Retry-After-header (seconden of HTTP-datum) zodat de
    // poller gericht kan backoff'en in plaats van blind opnieuw te proberen.
    const retryAfterSeconds =
      res.status === 429 ? parseRetryAfter(res.headers.get("retry-after")) : undefined;
    return {
      ok: false,
      reason: "http_error",
      status: res.status,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    };
  }

  // 204 No Content: defensief behandeld als een lege trefferset (→ not_found),
  // net als een 200 met `flights: []`. Geen fout en geen ongeldige JSON.
  if (res.status === 204) {
    return { ok: true, status: 204, data: { flights: [] } };
  }

  try {
    const data = (await res.json()) as RawSchipholFlightsResponse;
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, reason: "invalid_json", status: res.status };
  }
}

/**
 * Vraagt vluchten op bij Schiphol met de opgegeven queryparameters
 * (bv. { flightName, scheduleDate, flightDirection, page }). Puur transport: geen
 * normalisatie. Haalt eerst een bearer-token op; bij een 401 op de API-call (token
 * net verlopen/ingetrokken) wordt de tokencache één keer gewist en de call opnieuw
 * geprobeerd met een vers token. Faalt nooit met een exception voor verwachte
 * gevallen — die komen terug als een getypeerd resultaat.
 */
export async function fetchSchipholFlights(
  query: Record<string, string>,
  deps: SchipholClientDeps = {}
): Promise<SchipholClientResult> {
  const credentials = deps.credentials ?? schipholCredentials();
  if (!credentials) return { ok: false, reason: "not_configured" };

  const opts = {
    fetchImpl: deps.fetchImpl ?? fetch,
    // Default = productie-gateway; override via env (bv. acceptance) of deps (tests).
    baseUrl: deps.baseUrl ?? envTrim("SCHIPHOL_API_BASE_URL") ?? DEFAULT_BASE_URL,
    timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const tokenResult = await resolveToken(deps, credentials);
    if (!tokenResult.ok) return clientFailureFromToken(tokenResult);

    const result = await requestFlights(query, tokenResult.token, opts);

    // 401 op de eerste poging met een (mogelijk gecachet) token: wis de cache en
    // haal één keer een vers token op. Een expliciet meegegeven token retryen we niet.
    if (
      !result.ok &&
      result.reason === "unauthorized" &&
      attempt === 0 &&
      !deps.accessToken
    ) {
      resetSchipholTokenCache();
      continue;
    }
    return result;
  }

  // Onbereikbaar: de lus retourneert altijd binnen de twee pogingen.
  return { ok: false, reason: "unauthorized", status: 401 };
}
