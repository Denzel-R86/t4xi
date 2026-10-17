/**
 * Classificatie van routingfouten (2026-10-16).
 *
 * AANLEIDING. `getDrivingRoute()` gaf bij ELKE fout stil `null` terug. Dat is
 * veilig — geen prijs forceren — maar ononderscheidbaar van "er bestaat geen
 * route". Daardoor viel het afstand-tarief op 2026-09-08 weg zonder één
 * zichtbaar signaal: `route_not_fixed` ging van 6 naar 48 gevallen terwijl
 * niemand kon zien dat de routingdienst zelf onbereikbaar was.
 *
 * Deze module zet een HTTP-status en een Google-foutpayload om in een
 * genormaliseerde categorie. Puur en synchroon; doet zelf geen enkele aanroep.
 *
 * PRIVACY. Deze module ziet uitsluitend statuscode en foutobject. Er wordt
 * NOOIT een API-key, requestheader, volledige response, adres of
 * omgevingswaarde vastgelegd — zie `sanitizeRoutingFailure`, die precies drie
 * velden doorlaat.
 *
 * PRIJSNEUTRAAL. Een onbereikbare routingdienst blijft fail-closed: geen
 * afstandsprijs, offerte op aanvraag. Deze wijziging verandert geen enkel
 * bedrag; ze maakt alleen de oorzaak zichtbaar.
 */

/**
 * In welke FASE van het quotepad de aanroep faalde. De aanrijroute
 * (base -> pickup) is de EERSTE Google-aanroep; bij een storing faalt die het
 * eerst, dus zonder fase is niet te zien waar het misging.
 */
export type RoutingPhase = "pickup_approach" | "passenger_route";

/** Genormaliseerde oorzaak van een mislukte routing-aanroep. */
export type RoutingFailureCategory =
  | "routing_service_disabled"
  | "routing_api_key_invalid"
  | "routing_api_key_restricted"
  | "routing_billing_disabled"
  | "routing_quota_exceeded"
  | "routing_timeout"
  | "routing_no_route"
  | "routing_invalid_response"
  | "routing_unknown_error";

/** Wat er over een mislukking wordt vastgelegd. Bewust minimaal. */
export type RoutingFailure = {
  category: RoutingFailureCategory;
  /** HTTP-status, of `null` bij een timeout/netwerkfout zonder respons. */
  httpStatus: number | null;
  /** Google `error.status`, bijvoorbeeld "PERMISSION_DENIED". Nooit vrije tekst van de klant. */
  googleStatus: string | null;
  /** Google `error.code`. */
  googleCode: number | null;
};

/** Vorm van de foutpayload van de Routes API; alles optioneel want niet te vertrouwen. */
type GoogleErrorBody = {
  error?: {
    code?: unknown;
    status?: unknown;
    message?: unknown;
    details?: unknown;
  };
};

const asString = (v: unknown): string | null => (typeof v === "string" && v.length <= 64 ? v : null);
const asNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Trefwoorden die in `error.message` of `error.details` op een specifieke
 * oorzaak wijzen. Google gebruikt voor al deze gevallen status
 * PERMISSION_DENIED of 403, dus alleen de status is niet onderscheidend genoeg.
 *
 * De match is bewust op een KLEINE, vaste set Engelse Google-termen; er wordt
 * nooit klantinvoer doorzocht.
 */
const SIGNALEN: { test: RegExp; category: RoutingFailureCategory }[] = [
  { test: /service[_ ]disabled|has not been used in project|is disabled/i, category: "routing_service_disabled" },
  { test: /billing|billing_disabled|project is not linked to a billing account/i, category: "routing_billing_disabled" },
  { test: /api key not valid|invalid api key|api_key_invalid/i, category: "routing_api_key_invalid" },
  { test: /referer|referrer|ip address|application restrictions|api_key_http_referrer|api_key_ip/i, category: "routing_api_key_restricted" },
  { test: /quota|rate[_ ]limit|resource[_ ]exhausted/i, category: "routing_quota_exceeded" },
];

/**
 * Classificeert een mislukte HTTP-aanroep naar de Routes API.
 *
 * `body` is de geparste JSON van de respons, of `null` wanneer die niet te
 * parsen viel. De functie leest uitsluitend `error.code`, `error.status`,
 * `error.message` en `error.details`; de rest van de respons wordt genegeerd
 * en nooit vastgelegd.
 */
export function classifyRoutingFailure(httpStatus: number, body: unknown): RoutingFailure {
  const err = (body as GoogleErrorBody | null)?.error;
  const googleStatus = asString(err?.status);
  const googleCode = asNumber(err?.code);

  // Tekst uitsluitend gebruiken om te CLASSIFICEREN, nooit om vast te leggen.
  const haystack = [
    typeof err?.message === "string" ? err.message : "",
    typeof err?.details === "string" ? err.details : JSON.stringify(err?.details ?? ""),
  ].join(" ");

  for (const signaal of SIGNALEN) {
    if (signaal.test.test(haystack) || (googleStatus && signaal.test.test(googleStatus))) {
      return { category: signaal.category, httpStatus, googleStatus, googleCode };
    }
  }

  // Zonder onderscheidend trefwoord: terugvallen op de statuscode.
  let category: RoutingFailureCategory;
  if (httpStatus === 429) category = "routing_quota_exceeded";
  else if (httpStatus === 401) category = "routing_api_key_invalid";
  else if (httpStatus === 403) category = "routing_api_key_restricted";
  else category = "routing_unknown_error";

  return { category, httpStatus, googleStatus, googleCode };
}

/** Timeout of netwerkfout: geen respons, dus geen Google-velden. */
export function timeoutFailure(): RoutingFailure {
  return { category: "routing_timeout", httpStatus: null, googleStatus: null, googleCode: null };
}

/** HTTP 200 maar een onbruikbare of lege payload. */
export function invalidResponseFailure(httpStatus = 200): RoutingFailure {
  return { category: "routing_invalid_response", httpStatus, googleStatus: null, googleCode: null };
}

/**
 * HTTP 200 met een geldige payload, maar Google vond geen route. Dit is GEEN
 * storing: het is een legitiem antwoord dat terecht tot "Offerte op aanvraag"
 * leidt.
 */
export function noRouteFailure(): RoutingFailure {
  return { category: "routing_no_route", httpStatus: 200, googleStatus: null, googleCode: null };
}

/**
 * Wijst de routingdienst zelf op een storing? Zo ja, dan is "geen vaste route"
 * een misleidende verklaring en hoort de offerte de routingoorzaak te dragen.
 * `routing_no_route` telt hier BEWUST niet mee.
 */
export function isServiceFailure(f: RoutingFailure | null): boolean {
  return f !== null && f.category !== "routing_no_route";
}

/**
 * Wat er duurzaam in `pricing_quote_logs.price_breakdown.routingFailure`
 * terechtkomt: de gesaneerde mislukking plus de fase. Bewust een vlakke,
 * querybare vorm.
 */
export type RoutingFailureLogEntry = ReturnType<typeof sanitizeRoutingFailure> & {
  phase: RoutingPhase;
};

/** Combineert fase en gesaneerde mislukking tot de logvorm. */
export function toLogEntry(phase: RoutingPhase, failure: RoutingFailure): RoutingFailureLogEntry {
  return { phase, ...sanitizeRoutingFailure(failure) };
}

/**
 * De ENIGE vorm waarin een mislukking naar buiten gaat (log/telemetrie).
 * Expliciet een allowlist van drie velden plus de categorie: een toekomstige
 * uitbreiding van `RoutingFailure` lekt daardoor niet vanzelf mee.
 */
export function sanitizeRoutingFailure(f: RoutingFailure): {
  category: RoutingFailureCategory;
  httpStatus: number | null;
  googleStatus: string | null;
  googleCode: number | null;
} {
  return {
    category: f.category,
    httpStatus: f.httpStatus,
    googleStatus: f.googleStatus,
    googleCode: f.googleCode,
  };
}
