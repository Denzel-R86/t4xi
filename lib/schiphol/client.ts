/**
 * Schiphol Public Flight API — server-side client (Sprint: Schiphol API foundation).
 *
 * DUNNE HTTP-laag boven `https://api.schiphol.nl/public-flights`. Bevat GEEN
 * normalisatie of businesslogica (dat doet lib/schiphol/service.ts) — hij bouwt
 * de request, zet de auth-headers en geeft een ruw, getypeerd resultaat terug.
 *
 * SERVER-ONLY: de credentials (SCHIPHOL_APP_ID / SCHIPHOL_API_KEY) worden uit
 * process.env gelezen en gaan uitsluitend in de request-headers. Ze komen NOOIT
 * in de respons, in een error of in een log. Importeer dit bestand niet in
 * client-componenten.
 */

import type { RawSchipholFlightsResponse } from "./types";

const DEFAULT_BASE_URL = "https://api.schiphol.nl/public-flights";
/** Vereiste API-versieheader van de Schiphol-API. */
const RESOURCE_VERSION = "v4";
const DEFAULT_TIMEOUT_MS = 8000;

export type SchipholCredentials = { appId: string; apiKey: string };

/** Injecteerbare afhankelijkheden — maakt de client testbaar zonder netwerk. */
export type SchipholClientDeps = {
  fetchImpl?: typeof fetch;
  credentials?: SchipholCredentials | null;
  baseUrl?: string;
  timeoutMs?: number;
};

/** Uitkomst van een ruwe client-call — geen exceptions voor verwachte gevallen. */
export type SchipholClientResult =
  | { ok: true; status: number; data: RawSchipholFlightsResponse }
  | { ok: false; reason: "not_configured" }
  | { ok: false; reason: "unauthorized"; status: number }
  | { ok: false; reason: "http_error"; status: number }
  | { ok: false; reason: "network_error" }
  | { ok: false; reason: "invalid_json"; status: number };

/**
 * Leest de Schiphol-credentials uit de omgeving. Retourneert null zodra één van
 * beide ontbreekt — de aanroeper vertaalt dat naar "not_configured" (nooit een
 * halfbakken request naar de upstream).
 */
export function schipholCredentials(
  env: Record<string, string | undefined> = process.env
): SchipholCredentials | null {
  const appId = (env.SCHIPHOL_APP_ID ?? "").trim();
  const apiKey = (env.SCHIPHOL_API_KEY ?? "").trim();
  if (!appId || !apiKey) return null;
  return { appId, apiKey };
}

/**
 * Vraagt vluchten op bij Schiphol met de opgegeven queryparameters
 * (bv. { flightName, scheduleDate, flightDirection, page }). Puur transport:
 * geen normalisatie. Faalt nooit met een exception voor verwachte gevallen —
 * die komen terug als een getypeerd resultaat.
 */
export async function fetchSchipholFlights(
  query: Record<string, string>,
  deps: SchipholClientDeps = {}
): Promise<SchipholClientResult> {
  const credentials = deps.credentials ?? schipholCredentials();
  if (!credentials) return { ok: false, reason: "not_configured" };

  const fetchImpl = deps.fetchImpl ?? fetch;
  const baseUrl = deps.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const url = new URL(`${baseUrl}/flights`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        ResourceVersion: RESOURCE_VERSION,
        app_id: credentials.appId,
        app_key: credentials.apiKey,
      },
      signal: controller.signal,
    });
  } catch {
    // Timeout of netwerkfout — geen upstream-status beschikbaar.
    return { ok: false, reason: "network_error" };
  } finally {
    clearTimeout(timer);
  }

  // Credentials aanwezig maar geweigerd → apart van een generieke http-fout,
  // zodat de health-check en het endpoint dit gericht kunnen melden.
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "unauthorized", status: res.status };
  }
  if (!res.ok) {
    return { ok: false, reason: "http_error", status: res.status };
  }

  try {
    const data = (await res.json()) as RawSchipholFlightsResponse;
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, reason: "invalid_json", status: res.status };
  }
}
