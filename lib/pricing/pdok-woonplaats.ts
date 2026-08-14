// ─────────────────────────────────────────────────────────────────────────────
// IO-laag (server-side, geen client-key nodig — PDOK Locatieserver is publiek en
// niet-geauthenticeerd): haalt de OFFICIËLE PDOK-woonplaatsnaam op voor een
// volledig adres, uitsluitend gebruikt voor de deadhead-zonebepaling (hotfix
// 2026-08-14).
//
// CONTRACT (2026-08-14, betrouwbaarheidshardening): dit gooit BEWUST een fout
// bij een netwerkfout/timeout/HTTP-fout/ongeldige JSON — de caller (service.ts)
// moet dat kunnen ONDERSCHEIDEN van een geslaagde lookup die simpelweg niets
// relevants vond (`null`). Dat onderscheid is precies het verschil tussen
// "zone_lookup_unavailable" (onzeker, mag nooit stilzwijgend de lage basisprijs
// opleveren voor een mogelijk Eindhoven/Roermond-bestemming) en
// "pdok_resolved_outside_zone" (PDOK werkte prima, bestemming ligt gewoon
// elders — basisprijs is dan correct en zeker). service.ts begrenst en
// retry't deze aanroep zelf (withRetryOnce); deze module doet dat niet meer
// intern, om dubbele/inconsistente retry-logica te voorkomen.
//
// Bewust GEEN keyword-matching op het adres zelf: we geven PDOK's eigen
// relevantie-ranking het laatste woord en lezen uitsluitend het officiële
// `woonplaatsnaam`-veld van het best passende document. `type:"gemeente"`-
// documenten hebben geen `woonplaatsnaam`-veld (alleen `gemeentenaam`, dat
// bewust NIET gebruikt wordt — een gemeente kan meerdere woonplaatsen bevatten,
// bv. gemeente Roermond bevat ook de woonplaatsen Herten/Swalmen) en worden dus
// vanzelf overgeslagen: we nemen het eerste document dat wél een
// `woonplaatsnaam` heeft, in PDOK's eigen score-volgorde.
// ─────────────────────────────────────────────────────────────────────────────

const PDOK_FREE = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const PDOK_FIELDS = "woonplaatsnaam,type";

/** Begrenst ÉÉN poging — service.ts orkestreert de (ene) retry hier bovenop. */
export const PDOK_ZONE_LOOKUP_TIMEOUT_MS = 500;

type PdokDoc = { woonplaatsnaam?: string; type?: string };

/** Gegooid bij een netwerkfout/timeout/HTTP-fout/ongeldige JSON — nooit bij een geslaagde, lege respons. */
export class PdokLookupError extends Error {}

/**
 * Haalt de officiële woonplaatsnaam op voor het best passende PDOK-document.
 * `null` betekent: de aanroep is GESLAAGD, maar geen enkel document had een
 * bruikbaar `woonplaatsnaam`-veld (PDOK vond dus zelf niets relevants — een
 * zekere "geen match", geen onzekerheid). Elke andere storing gooit
 * `PdokLookupError` — de caller MOET dat apart afhandelen (fail-closed naar
 * "onzeker", niet naar "zeker buiten de zone").
 */
export async function lookupOfficialWoonplaats(address: string): Promise<string | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDOK_ZONE_LOOKUP_TIMEOUT_MS);
  try {
    const url = `${PDOK_FREE}?q=${encodeURIComponent(trimmed)}&fl=${PDOK_FIELDS}&rows=5`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new PdokLookupError(`PDOK antwoordde met status ${res.status}`);
    const data: unknown = await res.json();
    const docs = (data as { response?: { docs?: PdokDoc[] } })?.response?.docs ?? [];
    for (const doc of docs) {
      if (doc.woonplaatsnaam) return doc.woonplaatsnaam;
    }
    return null;
  } catch (e) {
    if (e instanceof PdokLookupError) throw e;
    throw new PdokLookupError(e instanceof Error ? e.message : "onbekende PDOK-fout");
  } finally {
    clearTimeout(timer);
  }
}
