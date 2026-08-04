// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY. Haalt de werkelijke rij-afstand + rijtijd op via Google Directions.
//
// VEILIG VANGNET: zonder GOOGLE_MAPS_API_KEY, bij een timeout of bij welke fout dan
// ook geeft deze module `null` terug. De prijsservice valt dan terug op "offerte op
// aanvraag" — exact het gedrag van vóór deze feature. Zo kan de code live staan
// vóórdat de key is geconfigureerd, zonder de bestaande flow te breken.
//
// Privacy: adressen worden alleen naar Google gestuurd om de afstand te bepalen;
// er wordt niets gelogd. De API-key blijft server-side (nooit NEXT_PUBLIC_*).
// ─────────────────────────────────────────────────────────────────────────────

export type DrivingRoute = {
  /** Rij-afstand in kilometer (1 decimaal). */
  distanceKm: number;
  /** Geschatte rijtijd in minuten (afgerond). */
  durationMin: number;
};

const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";
const TIMEOUT_MS = 4000;

type DirectionsResponse = {
  status?: string;
  routes?: {
    legs?: {
      distance?: { value?: number };
      duration?: { value?: number };
    }[];
  }[];
};

/**
 * Werkelijke rij-afstand + rijtijd tussen twee (vrije-tekst of geformatteerde)
 * adressen. Retourneert `null` als er geen key is, de aanroep faalt, Google geen
 * route vindt, of de waarden onbruikbaar zijn. Nooit een exceptie richting caller.
 */
export async function getDrivingRoute(
  origin: string,
  destination: string
): Promise<DrivingRoute | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;

  const from = (origin ?? "").trim();
  const to = (destination ?? "").trim();
  if (!from || !to) return null;

  const url = new URL(DIRECTIONS_URL);
  url.searchParams.set("origin", from);
  url.searchParams.set("destination", to);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("region", "nl");
  url.searchParams.set("language", "nl");
  url.searchParams.set("key", key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const data = (await res.json()) as DirectionsResponse;
    if (data.status !== "OK") return null;

    const leg = data.routes?.[0]?.legs?.[0];
    const meters = leg?.distance?.value;
    const seconds = leg?.duration?.value;
    if (typeof meters !== "number" || typeof seconds !== "number") return null;
    if (meters <= 0 || seconds <= 0) return null;

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
