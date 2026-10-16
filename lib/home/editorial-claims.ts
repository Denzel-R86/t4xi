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

/** EN-status: `approved` = door de eigenaar goedgekeurd; `en-translation` = getrouwe
 *  vertaling van een goedgekeurde NL-tekst (approved-nl), zonder nieuwe claim. */
export type EnStatus = "approved" | "en-translation";

export type QuietProofSlot =
  | { status: "approved"; key: HomeMessageKey; en: EnStatus; source: string }
  | { status: "owner"; key: null; source: string };

/**
 * Quiet proof — drie plekken, in deze volgorde. Besluit eigenaar (#98): regel 1 en 2
 * approved; regel 3 vervalt en blijft een niet-gerenderde `owner`-plek.
 */
export const QUIET_PROOF_SLOTS: readonly QuietProofSlot[] = [
  { status: "approved", key: "quietProof1", en: "approved", source: "masterplan §0c + §3; EN goedgekeurd #98" },
  { status: "approved", key: "proofOnder1", en: "approved", source: "besluit eigenaar #98; bestaande key (Proof-sectie), bestaande EN-tekst" },
  { status: "owner", key: null, source: "besluit eigenaar #98: regel 3 vervalt" },
];

export type PrincipleEntry = {
  status: ClaimStatus;
  titleKey: HomeMessageKey;
  textKey: HomeMessageKey;
  /** `approved-nl / en-translation`: NL goedgekeurd, EN is getrouwe vertaling. */
  en: EnStatus;
  source: string;
};

/**
 * Service principles — de bestaande vows, getoetst aan §0c en besluit eigenaar #98.
 * Nummering volgt de gerenderde volgorde (01–03), niet de key.
 */
export const SERVICE_PRINCIPLES: readonly PrincipleEntry[] = [
  { status: "approved", titleKey: "vow1Titel", textKey: "vow1Tekst", en: "approved", source: "§0c: vaste prijs vooraf (pricing + snapshot live)" },
  { status: "owner", titleKey: "vow2Titel", textKey: "vow2Tekst", en: "approved", source: "besluit eigenaar #98: verborgen (titel + tekst)" },
  { status: "approved", titleKey: "vow3Titel", textKey: "vow3Tekst", en: "en-translation", source: "besluit eigenaar #98: nieuwe NL-tekst (invoer vooraf, geen operationele belofte)" },
  { status: "approved", titleKey: "vow4Titel", textKey: "vow4Tekst", en: "en-translation", source: "besluit eigenaar #98: nieuwe NL-tekst ('vraag uw rit aan', INQUIRY ≠ CONFIRMED)" },
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
