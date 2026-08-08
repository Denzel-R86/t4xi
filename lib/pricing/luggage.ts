// ─────────────────────────────────────────────────────────────────────────────
// Bagage-classificatie (fail-closed). Pure, IO-vrij, deterministisch testbaar.
//
// Alleen exact bekende categorieën zijn toegestaan. De GEDOCUMENTEERDE
// capaciteitstoewijzing (stuks bagage) wordt in de RPC vergeleken met
// vehicle_classes.max_luggage:
//   · 'handbagage'   → 0 stuks ruimbagage (alleen handbagage)
//   · '1-2-koffers'  → 2 stuks
//   · '3-koffers'    → 3 stuks
// 'overleg' is GÉÉN bindende categorie: de bagage is onbekend, dus er mag geen
// automatische bindende boeking ontstaan → handmatige beoordeling / offerte op
// aanvraag. Elke andere (lege/onbekende/willekeurige) waarde is ongeldig.
// ─────────────────────────────────────────────────────────────────────────────

/** Gedocumenteerde capaciteitstoewijzing per bindende bagagecategorie (stuks). */
export const LUGGAGE_PIECES: Readonly<Record<string, number>> = {
  handbagage: 0,
  "1-2-koffers": 2,
  "3-koffers": 3,
};

export type LuggageClass =
  | { kind: "binding"; category: string; pieces: number }
  | { kind: "on_request"; category: "overleg" }
  | { kind: "invalid" };

/**
 * Classificeert een bagagewaarde fail-closed. `binding` = bekende categorie met
 * een capaciteit; `on_request` = 'overleg' (handmatige beoordeling, geen bindende
 * boeking); `invalid` = leeg/onbekend/willekeurige tekst. Normaliseert op trim +
 * lowercase zodat een alternatieve schrijfwijze de controle niet omzeilt.
 */
export function classifyLuggage(raw: string | null | undefined): LuggageClass {
  const c = (raw ?? "").trim().toLowerCase();
  if (c === "overleg") return { kind: "on_request", category: "overleg" };
  if (Object.prototype.hasOwnProperty.call(LUGGAGE_PIECES, c)) {
    return { kind: "binding", category: c, pieces: LUGGAGE_PIECES[c] };
  }
  return { kind: "invalid" };
}
