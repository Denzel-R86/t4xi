/**
 * Verificatieverkeer dat buiten de Gate 6.4-tellers moet blijven.
 *
 * WAAROM DIT BESTAAT. De publieke route `/api/pricing/quote` kan een observatie
 * niet als synthetisch markeren — `markObservationsSynthetic` is een server-side
 * dependency die de route niet zet en ook niet hoort te zetten, want dat zou een
 * productie-achterdeur zijn. Elke verificatie via de echte API levert daardoor
 * observaties met `is_synthetic = false` op, die zonder tegenmaatregel als echt
 * klantbewijs voor Gate 6.4 meetellen.
 *
 * De historische rijen worden NIET gewijzigd. De uitsluiting zit uitsluitend in
 * de rapportage-/beslislaag: `selectDecisionPopulation()` filtert deze quote-id's
 * eruit en rapporteert hoeveel het waren.
 *
 * WAAROM QUOTE-ID EN GEEN TIJDVENSTER OF ROUTE. Een tijdvenster sluit te veel
 * uit. Bij het onderzoek van 2026-10-12 bleek precies dat: in het venster
 * 07:02–07:04 zat verkeer dat NIET aantoonbaar test was (zie hieronder), en een
 * venster van 06:45–07:05 zou die vijf quotes onterecht hebben weggefilterd.
 * Een routepatroon sluit ook te veel uit — een echte klant kan Schiphol naar
 * Amsterdam willen.
 *
 * HET BEWIJS PER QUOTE: het interval tot de vorige aanvraag. Alle zeventien
 * hieronder volgden binnen 0,75 tot 3,07 seconden op hun voorganger, in twee
 * aaneengesloten reeksen. Een mens kan een boekingsformulier niet twee keer in
 * driekwart seconde invullen en versturen; dat is machinaal. Blok 1 dekte
 * daarbij systematisch exact de testgevallen van PR #74, inclusief Antwerpen en
 * Brussel 0,75 seconde na elkaar — twee bewust uitgesloten luchthavens die geen
 * klant achter elkaar zou proberen.
 *
 * NIET UITGESLOTEN, bewust: de vijf quotes van 07:02:24–07:04:57. Die kwamen op
 * MENSELIJK tempo (14 tot 45 seconden ertussen) met variërende straatadressen
 * inclusief huisnummer en postcode (Sterduinstraat 10 en 25, Evert van de
 * Beekstraat 202). Dat is niet aantoonbaar testverkeer, dus het blijft meetellen.
 * Eén ervan — `Almere → Schiphol Airport`, 07:03:48 — liep op `route_not_fixed`
 * en is precies het stadsniveau-gat dat migratie 20261012080000 dicht.
 *
 * TOEKOMSTIGE VERVUILING VOORKOMEN. Deze lijst is een correctie achteraf, geen
 * oplossing. De structurele weg staat in
 * docs/pricing/verificatieverkeer-markeren.md.
 */

/** Eén uitgesloten quote, met het bewijs waarom. */
export type ExcludedQuote = {
  readonly quoteId: string;
  /** Tijdstip van de eerste observatie, ter herleiding. */
  readonly at: string;
  /** Seconden tussen deze aanvraag en de voorgaande; < 4 s is machinaal. */
  readonly gapSeconds: number | null;
  readonly reden: string;
};

/**
 * Bovengrens waaronder een interval als machinaal geldt. Ruim boven het hoogste
 * gemeten interval in deze reeksen (3,07 s) en ruim onder het laagste menselijke
 * interval dat in hetzelfde onderzoek is gemeten (13,98 s).
 */
export const MACHINE_PACED_MAX_GAP_SECONDS = 4;

const BLOK_1 = "PR #74-verificatie na de uitrol van 06:45:47Z; machinale reeks 06:47:35–06:48:15";
const BLOK_2 = "PR #74-verificatie van de prijsopbouw; machinale reeks 06:53:59–06:54:26";

export const EXCLUDED_TEST_TRAFFIC: readonly ExcludedQuote[] = [
  // ── Blok 1 — 9 quotes, 11 legs, 0 matched ─────────────────────────────────
  { quoteId: "01a12edd-df15-74b3-a161-4eef15b503d2", at: "2026-10-12T06:47:35Z", gapSeconds: null, reden: BLOK_1 },
  { quoteId: "01a12edd-e7c3-7a3b-b7ba-e075c74c1a24", at: "2026-10-12T06:47:37Z", gapSeconds: 3.07, reden: BLOK_1 },
  { quoteId: "01a12edd-ee63-7625-be20-e3182c25bd6f", at: "2026-10-12T06:47:38Z", gapSeconds: 1.71, reden: BLOK_1 },
  { quoteId: "01a12edd-f379-7e41-92b1-6984ca274ee1", at: "2026-10-12T06:47:40Z", gapSeconds: 1.49, reden: BLOK_1 },
  { quoteId: "01a12ede-5dc3-7943-b6cf-3b8b433048a5", at: "2026-10-12T06:48:07Z", gapSeconds: 1.46, reden: BLOK_1 },
  { quoteId: "01a12ede-6382-7419-b5b6-45df0b9f49db", at: "2026-10-12T06:48:08Z", gapSeconds: 0.94, reden: BLOK_1 },
  { quoteId: "01a12ede-67fa-7fd7-83dc-4b0943f5a477", at: "2026-10-12T06:48:10Z", gapSeconds: 2.41, reden: BLOK_1 },
  { quoteId: "01a12ede-7747-70f6-a8f7-8142181625f0", at: "2026-10-12T06:48:14Z", gapSeconds: 0.75, reden: BLOK_1 },
  { quoteId: "01a12ede-7b74-76f7-9c66-1da450a8b7b7", at: "2026-10-12T06:48:15Z", gapSeconds: 0.78, reden: BLOK_1 },

  // ── Blok 2 — 8 quotes, 10 legs, 0 matched ─────────────────────────────────
  { quoteId: "01a12ee3-bcaf-7bd5-a3f9-dcf6de950ec4", at: "2026-10-12T06:53:59Z", gapSeconds: 1.69, reden: BLOK_2 },
  { quoteId: "01a12ee3-c169-70bd-a586-b31d666698bc", at: "2026-10-12T06:54:00Z", gapSeconds: 1.17, reden: BLOK_2 },
  { quoteId: "01a12ee3-c5ff-7aa6-b3b5-9527cb7f1567", at: "2026-10-12T06:54:01Z", gapSeconds: 1.20, reden: BLOK_2 },
  { quoteId: "01a12ee3-ca9c-7c10-a442-5b2ce8d90c6e", at: "2026-10-12T06:54:03Z", gapSeconds: 0.98, reden: BLOK_2 },
  { quoteId: "01a12ee3-ce83-76e9-b8ed-84de09c65325", at: "2026-10-12T06:54:04Z", gapSeconds: 1.16, reden: BLOK_2 },
  { quoteId: "01a12ee4-17c8-7697-80e5-60500ccda256", at: "2026-10-12T06:54:22Z", gapSeconds: 18.99, reden: BLOK_2 },
  { quoteId: "01a12ee4-1d19-7231-8c6d-2f1df97abd26", at: "2026-10-12T06:54:24Z", gapSeconds: 1.16, reden: BLOK_2 },
  { quoteId: "01a12ee4-2205-7aaa-ad94-9f0645765ed3", at: "2026-10-12T06:54:26Z", gapSeconds: 1.47, reden: BLOK_2 },
] as const;

/** Snelle opzoekset voor de rapportagelaag. */
export const EXCLUDED_TEST_QUOTE_IDS: ReadonlySet<string> = new Set(
  EXCLUDED_TEST_TRAFFIC.map((q) => q.quoteId)
);
