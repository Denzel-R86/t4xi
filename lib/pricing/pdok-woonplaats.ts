// ─────────────────────────────────────────────────────────────────────────────
// IO-laag (server-side, geen client-key nodig — PDOK Locatieserver is publiek en
// niet-geauthenticeerd): haalt de OFFICIËLE PDOK-woonplaatsnaam op voor een
// volledig adres, uitsluitend gebruikt voor de deadhead-zonebepaling (hotfix
// 2026-08-14). Puur best-effort: elke fout, lege respons of timeout levert
// `null` op — de caller (service.ts) valt dan terug op fail-closed gedrag
// (geen zone-promotie), exact zoals wanneer deze module niet zou bestaan.
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

/** Begrenst de externe aanroep — mag de quote nooit merkbaar vertragen. */
export const PDOK_ZONE_LOOKUP_TIMEOUT_MS = 500;

type PdokDoc = { woonplaatsnaam?: string; type?: string };

/**
 * Haalt de officiële woonplaatsnaam op voor het best passende PDOK-document,
 * of `null` bij elke fout/timeout/leeg antwoord. Nooit een throw naar de
 * caller — dit is uitsluitend een fail-closed, best-effort lookup.
 */
export async function lookupOfficialWoonplaats(address: string): Promise<string | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDOK_ZONE_LOOKUP_TIMEOUT_MS);
  try {
    const url = `${PDOK_FREE}?q=${encodeURIComponent(trimmed)}&fl=${PDOK_FIELDS}&rows=5`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const docs = (data as { response?: { docs?: PdokDoc[] } })?.response?.docs ?? [];
    for (const doc of docs) {
      if (doc.woonplaatsnaam) return doc.woonplaatsnaam;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
