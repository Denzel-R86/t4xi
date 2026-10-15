/**
 * Homepage editorial (Experience 2.0 PR 3.1) — welke regels de "Quiet proof" en de
 * "Service principles" tonen, met hun claimstatus (masterplan §0c).
 *
 * Elke copyregel is een claim. Alleen status `approved` wordt gerenderd; een
 * `owner`-plek is een bewust leeg slot tot de eigenaar kiest (masterplan §3:
 * "twee regels die de eigenaar kiest uit wat operationeel waar is"). Zo kan een
 * onbevestigde regel niet per ongeluk op de site komen.
 *
 * Nooit (tot §0c/B7 anders zegt): "Uw vlucht wordt gevolgd", "Uw chauffeur wacht",
 * "24/7" — bewaakt door `editorial-claims.test.ts`.
 */

export type ClaimStatus = "approved" | "owner";

/** Message-key in de namespace `home` (messages/*.json). */
export type HomeMessageKey = string;

export type QuietProofSlot =
  | { status: "approved"; key: HomeMessageKey; source: string }
  | { status: "owner"; key: null; source: string };

/**
 * Quiet proof — drie plekken, in deze volgorde. Plek 2 en 3 blijven leeg (niet
 * gerenderd) tot de eigenaar een regel kiest; kandidaten staan in de PR-beschrijving.
 */
export const QUIET_PROOF_SLOTS: readonly QuietProofSlot[] = [
  { status: "approved", key: "quietProof1", source: "masterplan §0c + §3: 'Uw prijs staat vast.'" },
  { status: "owner", key: null, source: "masterplan §3: keuze eigenaar (regel 2)" },
  { status: "owner", key: null, source: "masterplan §3: keuze eigenaar (regel 3)" },
];

export type PrincipleEntry = {
  status: ClaimStatus;
  titleKey: HomeMessageKey;
  textKey: HomeMessageKey;
  source: string;
};

/**
 * Service principles — de bestaande vier vows, elk getoetst aan §0c. Geen van de
 * vier noemt wachttijd, vluchtmonitoring of 24/7.
 */
export const SERVICE_PRINCIPLES: readonly PrincipleEntry[] = [
  { status: "approved", titleKey: "vow1Titel", textKey: "vow1Tekst", source: "§0c: vaste prijs vooraf (pricing + snapshot live)" },
  { status: "approved", titleKey: "vow2Titel", textKey: "vow2Tekst", source: "bestaande live copy; servicestandaard, geen capability-claim" },
  { status: "approved", titleKey: "vow3Titel", textKey: "vow3Tekst", source: "bestaande live copy; ophaaltijd + bagage verplicht in de boeking" },
  { status: "approved", titleKey: "vow4Titel", textKey: "vow4Tekst", source: "bestaande live copy; zelfde claim als home.invStamp1" },
];

/** Alleen wat gerenderd mag worden. */
export function approvedQuietProofKeys(slots: readonly QuietProofSlot[] = QUIET_PROOF_SLOTS): HomeMessageKey[] {
  return slots.flatMap((s) => (s.status === "approved" ? [s.key] : []));
}

export function approvedPrinciples(entries: readonly PrincipleEntry[] = SERVICE_PRINCIPLES): PrincipleEntry[] {
  return entries.filter((e) => e.status === "approved");
}

/** Claims die §0c nu niet toestaat (NL + EN), voor de bewakingstest. */
export const FORBIDDEN_CLAIMS: readonly RegExp[] = [
  /vlucht\w* wordt gevolgd|volgen uw vlucht|vluchtmonitoring|vluchtstatus/i,
  /flight\w* (is |status )?(tracked|monitored)|track your flight|flight monitoring/i,
  /chauffeur wacht|wachttijd/i,
  /driver waits|waiting time/i,
  /24\s*\/\s*7/,
];
