// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY. Haalt de werkelijke rij-afstand + rijtijd op via de Google Routes
// API v2 (`directions/v2:computeRoutes`), traffic-aware met een gepland vertrek.
//
// VEILIG VANGNET: zonder GOOGLE_MAPS_API_KEY, bij een timeout of bij welke fout dan
// ook geeft deze module `null` terug. De prijsservice valt dan terug op "offerte op
// aanvraag" — exact het gedrag van vóór deze feature. Zo kan de code live staan
// vóórdat de key is geconfigureerd, zonder de bestaande flow te breken.
//
// Privacy/veiligheid: adressen gaan alleen naar Google om de afstand te bepalen;
// er wordt niets gelogd. De API-key gaat via de X-Goog-Api-Key request-header en
// blijft server-side — nooit NEXT_PUBLIC, nooit in een URL of naar de browser.
// ─────────────────────────────────────────────────────────────────────────────

export type DrivingRoute = {
  /** Rij-afstand in kilometer (1 decimaal). */
  distanceKm: number;
  /** Geschatte rijtijd in minuten (afgerond), traffic-aware. */
  durationMin: number;
};

const COMPUTE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const TIMEOUT_MS = 4000;

// Alleen deze twee velden opvragen (verplichte field mask; scheelt kosten + payload).
const FIELD_MASK = "routes.distanceMeters,routes.duration";

type ComputeRoutesResponse = {
  routes?: {
    distanceMeters?: number;
    // Routes API v2 levert duration als protobuf-string, bijv. "1234s".
    duration?: string;
  }[];
};

/** Parseert een Routes-API duration ("1234s") naar seconden; null als onbruikbaar. */
function parseDurationSeconds(duration: string | undefined): number | null {
  if (typeof duration !== "string") return null;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(duration.trim());
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

/**
 * Werkelijke rij-afstand + rijtijd tussen twee (vrije-tekst of geformatteerde)
 * adressen via de Routes API v2. Traffic-aware met een gepland vertrektijdstip
 * (default: nu + 1 min, moet in de toekomst liggen). Retourneert `null` als er geen
 * key is, de aanroep faalt, Google geen route vindt, of de waarden onbruikbaar
 * zijn. Nooit een exceptie richting caller.
 */
export async function getDrivingRoute(
  origin: string,
  destination: string,
  departureTime: Date = new Date(Date.now() + 60_000)
): Promise<DrivingRoute | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;

  const from = (origin ?? "").trim();
  const to = (destination ?? "").trim();
  if (!from || !to) return null;

  const body = {
    origin: { address: from },
    destination: { address: to },
    travelMode: "DRIVE",
    // Traffic-aware routing; TRAFFIC_AWARE staat een gepland vertrektijdstip toe.
    routingPreference: "TRAFFIC_AWARE",
    departureTime: departureTime.toISOString(),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(COMPUTE_ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as ComputeRoutesResponse;
    const route = data.routes?.[0];
    const meters = route?.distanceMeters;
    const seconds = parseDurationSeconds(route?.duration);
    if (typeof meters !== "number" || meters <= 0) return null;
    if (seconds === null || seconds <= 0) return null;

    return {
      distanceKm: Math.round((meters / 1000) * 10) / 10,
      durationMin: Math.round(seconds / 60),
    };
  } catch {
    // Timeout (abort) of netwerk-/parsefout → geen prijs forceren.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
