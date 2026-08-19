// ─────────────────────────────────────────────────────────────────────────────
// IO-laag (server-side, geen client-key nodig — PDOK Locatieserver is publiek en
// niet-geauthenticeerd): haalt de OFFICIËLE PDOK-gemeentenaam op voor een
// pickup-adres, uitsluitend gebruikt voor de pickup-servicegebiedbepaling
// (2026-08-18, pickup-aanrijmodel).
//
// Zelfde CONTRACT als lib/pricing/pdok-woonplaats.ts (bewust een eigen, kleine
// module — niet gedeeld — zodat de al-live deadhead-zonecode hier niet door
// geraakt kan worden): gooit bij een echte storing (netwerk/timeout/HTTP/
// ongeldige JSON), levert `null` uitsluitend bij een GESLAAGDE aanroep zonder
// relevant document. Dat onderscheid bepaalt of de caller mag concluderen
// "bevestigd buiten elk servicegebied" (dus offerte, maar geen storing) of
// "onzeker, storing" (ook offerte, andere interne reden).
//
// Bewust GEEN keyword-matching op het adres zelf: PDOK's eigen relevantie-
// ranking beslist; alleen het officiële `gemeentenaam`-veld van het best
// passende document wordt gelezen.
// ─────────────────────────────────────────────────────────────────────────────

const PDOK_FREE = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const PDOK_FIELDS = "gemeentenaam,type";

/** Begrenst ÉÉN poging — service.ts orkestreert de (ene) retry hier bovenop. */
export const PDOK_GEMEENTE_LOOKUP_TIMEOUT_MS = 500;

type PdokDoc = { gemeentenaam?: string; type?: string };

/** Gegooid bij een netwerkfout/timeout/HTTP-fout/ongeldige JSON — nooit bij een geslaagde, lege respons. */
export class PdokGemeenteLookupError extends Error {}

/**
 * Haalt de officiële gemeentenaam op voor het best passende PDOK-document.
 * `null` betekent: de aanroep is GESLAAGD, maar geen enkel document had een
 * bruikbaar `gemeentenaam`-veld. Elke andere storing gooit
 * `PdokGemeenteLookupError` — de caller MOET dat apart afhandelen.
 */
export async function lookupOfficialGemeente(address: string): Promise<string | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDOK_GEMEENTE_LOOKUP_TIMEOUT_MS);
  try {
    const url = `${PDOK_FREE}?q=${encodeURIComponent(trimmed)}&fl=${PDOK_FIELDS}&rows=5`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new PdokGemeenteLookupError(`PDOK antwoordde met status ${res.status}`);
    const data: unknown = await res.json();
    const docs = (data as { response?: { docs?: PdokDoc[] } })?.response?.docs ?? [];
    for (const doc of docs) {
      if (doc.gemeentenaam) return doc.gemeentenaam;
    }
    return null;
  } catch (e) {
    if (e instanceof PdokGemeenteLookupError) throw e;
    throw new PdokGemeenteLookupError(e instanceof Error ? e.message : "onbekende PDOK-fout");
  } finally {
    clearTimeout(timer);
  }
}
