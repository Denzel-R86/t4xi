/**
 * Doelselectie voor het Event Pricing shadow-rapport.
 *
 * Het rapport mocht tot nu toe uitsluitend tegen staging draaien. Zodra Event
 * Pricing in productie in shadow staat, moet het ook productie kunnen lezen —
 * maar nooit per ongeluk. Dit moduletje is die scheiding, apart gehouden zodat
 * hij te testen is zonder database, env-bestand of netwerk.
 *
 * Het veiligheidsmodel in één zin: staging is de standaard, productie bestaat
 * alleen na een expliciete vlag, en beide worden hard tegen hun project-ref
 * gevalideerd. Er is geen pad waarlangs een ontbrekende variabele, een
 * verkeerd env-bestand of een fallback productie kan selecteren.
 */

export const REPORT_TARGETS = ["staging", "production"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const STAGING_PROJECT_REF = "ztlhydagjqfzkyfiqgio";
export const PRODUCTION_PROJECT_REF = "ajdsiklxfmmgisdvarhv";

/**
 * Formele bewijsstart voor PRODUCTIE.
 *
 * Blijft `null` tot de Production Shadow Activation Gate het activatiemoment
 * bewezen heeft vastgelegd. Zolang deze waarde `null` is mag productie wel
 * diagnostisch worden gelezen, maar telt er niets als formeel 6.4-bewijs.
 *
 * Deze constante wordt NOOIT afgeleid — niet uit de vroegste observatie, niet
 * uit een env-variabele, niet uit de configuratiedatum. Iemand zet hier
 * handmatig het bewezen UTC-moment neer, of hij blijft `null`.
 */
export const PRODUCTION_SHADOW_START_ISO: string | null = null;

/** Env-bestand per doel. Geen gedeeld bestand, geen fallback. */
const ENV_FILES: Readonly<Record<ReportTarget, string>> = {
  staging: ".env.staging.local",
  production: ".env.production.local",
};

const EXPECTED_REF: Readonly<Record<ReportTarget, string>> = {
  staging: STAGING_PROJECT_REF,
  production: PRODUCTION_PROJECT_REF,
};

export function envFileFor(target: ReportTarget): string {
  return ENV_FILES[target];
}

export function expectedProjectRef(target: ReportTarget): string {
  return EXPECTED_REF[target];
}

/**
 * Bepaalt het doel uit de argumenten. Staging tenzij `--target=production`
 * letterlijk is meegegeven.
 *
 * Bewust géén env-variabele: een omgeving die toevallig anders staat mag het
 * doel niet verschuiven. En bewust geen stille afhandeling van een onbekende
 * waarde — `--target=prod` is een typefout, geen productie.
 */
export function resolveReportTarget(argv: readonly string[]): ReportTarget {
  const flag = argv.find((a) => a.startsWith("--target="));
  if (flag === undefined) return "staging";
  const value = flag.slice("--target=".length);
  if ((REPORT_TARGETS as readonly string[]).includes(value)) return value as ReportTarget;
  throw new Error(
    `VEILIGHEIDSSTOP: onbekend doel '${value}'. Geldig: ${REPORT_TARGETS.join(", ")}.`
  );
}

/** Faalt hard als de verbonden project-ref niet bij het gekozen doel hoort. */
export function assertProjectRef(target: ReportTarget, ref: string): void {
  const verwacht = EXPECTED_REF[target];
  if (ref !== verwacht) {
    throw new Error(
      `VEILIGHEIDSSTOP: doel '${target}' verwacht project-ref '${verwacht}', kreeg '${ref || "(leeg)"}'.`
    );
  }
}

export type EvidenceMode = "formal" | "diagnostic";

export type EvidenceWindow = {
  /** Startgrens, of `null` wanneer er geen geldige bewijsstart is. */
  readonly since: string | null;
  /**
   * `formal` = telt mee voor 6.4 en poort 10.
   * `diagnostic` = wel leesbaar, maar nooit geldig bewijs.
   */
  readonly mode: EvidenceMode;
  /** Reden, bedoeld om letterlijk in het rapport te tonen. */
  readonly reason: string;
};

/**
 * Kiest de bewijsstart voor een doel.
 *
 * De twee starts blijven strikt gescheiden: `MEASUREMENT_START_ISO` geldt
 * uitsluitend voor staging, `PRODUCTION_SHADOW_START_ISO` uitsluitend voor
 * productie. Ze worden nooit voor elkaar ingevuld — dat zou kalenderdagen
 * meetellen waarin op dat doel geen valide observatie mogelijk was.
 */
export function evidenceWindowFor(
  target: ReportTarget,
  stagingStartIso: string,
  productionStartIso: string | null = PRODUCTION_SHADOW_START_ISO
): EvidenceWindow {
  if (target === "staging") {
    return {
      since: stagingStartIso,
      mode: "formal",
      reason: `staging policy-start ${stagingStartIso}`,
    };
  }
  if (productionStartIso === null) {
    return {
      since: null,
      mode: "diagnostic",
      reason:
        "PRODUCTION_SHADOW_START_ISO is nog niet vastgelegd — productie is diagnostisch leesbaar, " +
        "maar niets telt als formeel 6.4-bewijs",
    };
  }
  return {
    since: productionStartIso,
    mode: "formal",
    reason: `productie bewijsstart ${productionStartIso}`,
  };
}

/** Alleen een formeel venster mag poort 10 en de 6.4-tellers voeden. */
export function countsAsFormalEvidence(window: EvidenceWindow): boolean {
  return window.mode === "formal";
}
