/**
 * Publieke API-matrix (Experience 2.0 · S2, masterplan §9) — als data.
 *
 * Eén entry per (route, geëxporteerde HTTP-methode) onder `app/api/**\/route.ts`.
 * Inventaris en vangnet, GEEN bewijs dat alle routes veilig zijn.
 * Dit is de FEITELIJKE stand van de code, niet de gewenste. Wat ontbreekt staat
 * expliciet als `gaps` met een findings-nummer (docs/experience-2.0/baseline/findings.md).
 *
 * `evidence` zijn letterlijke bronfragmenten. `api-surface.test.ts` controleert dat
 * ze in de handler van die methode staan (broncode-lock), en omgekeerd dat een
 * entry die "geen" zegt (geen auth, geen limiet, geen body) ook werkelijk geen
 * auth-/limiet-/body-aanroep bevat. Wijzigt een route, dan moet deze matrix mee.
 *
 * Geen runtime-import vanuit productiecode; alleen de test leest dit bestand.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/** publiek · basic-auth (ops-sessie/-credentials, lib/admin/basic-auth.ts) · webhook-signature · draft-secret · service (gedeeld geheim). */
export type AuthKind = "publiek" | "basic-auth" | "webhook-signature" | "draft-secret" | "service";

export type GapCategory = "rate-limit" | "body-size" | "pii-log" | "pii-opslag" | "kosten" | "auth";

export type Gap = { category: GapCategory; finding: `F-${number}`; text: string };

export type RateLimitSpec =
  | { kind: "none" }
  | {
      /** `lib-in-memory` = lib/security/rate-limit.ts; `route-lokaal` = eigen Map in de route. */
      kind: "lib-in-memory" | "route-lokaal-in-memory";
      key: string;
      max: number;
      windowSec: number;
      evidence: string[];
    };

export type BodyLimitSpec =
  /** Handler leest geen request-body. */
  | { kind: "geen-body" }
  /** Leest de body zonder eigen grootte-check (alleen het platformplafond). */
  | { kind: "none" }
  /** Eigen limiet, gecontroleerd NA het volledig inlezen (`request.text()`). */
  | { kind: "na-inlezen"; maxBytes: number; unit: "bytes" | "tekens"; evidence: string[] };

export type ApiSurfaceEntry = {
  route: string;
  file: string;
  method: HttpMethod;
  auth: { kind: AuthKind; evidence: string[]; note?: string };
  /** Cookie-auth: muterende methoden krijgen een Origin-check (`isSameOriginRequest`), GET niet. */
  csrf: "n.v.t." | "SameSite=Strict-cookie, geen Origin-check" | "SameSite=Strict-cookie + Origin-check";
  rateLimit: RateLimitSpec;
  /** Progressieve lockout bovenop de limiet (alleen de ops-login); bewijs staat in de handler. */
  lockout?: { evidence: string[] };
  /** Korte in-memory cache van de upstream-uitkomst; bewijs staat in de handler. */
  upstreamCache?: { ttlSec: number; evidence: string[] };
  validation: { kind: "geen-invoer" | "handgeschreven" | "parserfunctie" | "bibliotheek"; evidence: string[] };
  pii: {
    /** Persoonsgegevens die de route ontvangt of teruggeeft. */
    fields: string[];
    /** Wat in console-logs terechtkomt; `evidence` = fragment van die logregel. */
    logged: { what: string; evidence: string }[];
    /** Opslag van PII als log-/auditregel (niet de functionele opslag). */
    persistedLog?: string;
  };
  bodyLimit: BodyLimitSpec;
  /** Upstream-kosten of -quotum per aanroep. */
  upstreamCost?: string;
  gaps: Gap[];
};

/** Geldt voor elke entry met een in-memory limiter. */
export const GLOBAL_GAPS: Gap[] = [
  {
    category: "rate-limit",
    finding: "F-37",
    text: "Alle limieten zijn in-memory per warme instance (B6): geen gedeelde store, dus geen harde limiet over instances/cold starts heen.",
  },
];

const ADMIN_SESSION = "app/api/admin/session/route.ts";
const ADMIN_CSRF_READ = "SameSite=Strict-cookie, geen Origin-check" as const;
const ADMIN_CSRF = "SameSite=Strict-cookie + Origin-check" as const;
const ip = "${ip}";

export const API_SURFACE: ApiSurfaceEntry[] = [
  // ── Admin (ops-sessie via lib/admin/basic-auth.ts) ────────────────────────
  {
    route: "/api/admin/bookings", file: "app/api/admin/bookings/route.ts", method: "POST",
    auth: { kind: "basic-auth", evidence: ["isAuthorizedAdminRequest(request)"] },
    csrf: ADMIN_CSRF,
    rateLimit: { kind: "none" },
    validation: { kind: "handgeschreven", evidence: ["UUID_RE.test(bookingId)", "isBookingStatus(to)", ".slice(0, 500)"] },
    pii: { fields: ["reason (vrije tekst ops)"], logged: [{ what: "vrije-tekst reden bij mislukte communicatie", evidence: "${reason || \"geen reden\"}" }] },
    bodyLimit: { kind: "none" },
    gaps: [
      { category: "rate-limit", finding: "F-37", text: "Geen limiet; alleen bereikbaar met geldige ops-sessie." },
      { category: "body-size", finding: "F-42", text: "request.json() zonder eigen limiet (alleen achter ops-sessie)." },
      { category: "pii-log", finding: "F-43", text: "Vrije-tekst `reason` in console.error." },
    ],
  },
  {
    route: "/api/admin/carriers", file: "app/api/admin/carriers/route.ts", method: "POST",
    auth: { kind: "basic-auth", evidence: ["isAuthorizedAdminRequest(request)"] },
    csrf: ADMIN_CSRF,
    rateLimit: { kind: "none" },
    validation: { kind: "handgeschreven", evidence: ["normalizeName(body?.name)", "name.length > 120"] },
    pii: { fields: [], logged: [] },
    bodyLimit: { kind: "none" },
    gaps: [
      { category: "rate-limit", finding: "F-37", text: "Geen limiet; alleen bereikbaar met geldige ops-sessie." },
      { category: "body-size", finding: "F-42", text: "request.json() zonder eigen limiet (alleen achter ops-sessie)." },
    ],
  },
  {
    route: "/api/admin/invoices", file: "app/api/admin/invoices/route.ts", method: "GET",
    auth: { kind: "basic-auth", evidence: ["isAuthorizedAdminRequest(request)"] },
    csrf: ADMIN_CSRF_READ,
    rateLimit: { kind: "none" },
    validation: { kind: "geen-invoer", evidence: [] },
    pii: { fields: ["customer_name", "customer_email", "from_address", "to_address", "billing_*"], logged: [] },
    bodyLimit: { kind: "geen-body" },
    gaps: [{ category: "rate-limit", finding: "F-37", text: "Geen limiet; alleen bereikbaar met geldige ops-sessie." }],
  },
  {
    route: "/api/admin/invoices", file: "app/api/admin/invoices/route.ts", method: "POST",
    auth: { kind: "basic-auth", evidence: ["isAuthorizedAdminRequest(request)"] },
    csrf: ADMIN_CSRF,
    rateLimit: { kind: "none" },
    validation: { kind: "handgeschreven", evidence: ["uuid.test(bookingId)", "uuid.test(carrierId)", "save_booking_invoice_details_v2"] },
    pii: { fields: ["billingName", "billingAddress", "billingPostalCode", "billingCity"], logged: [] },
    bodyLimit: { kind: "none" },
    gaps: [
      { category: "rate-limit", finding: "F-37", text: "Geen limiet; alleen bereikbaar met geldige ops-sessie." },
      { category: "body-size", finding: "F-42", text: "request.json() zonder eigen limiet (alleen achter ops-sessie)." },
    ],
  },
  {
    route: "/api/admin/session", file: ADMIN_SESSION, method: "POST",
    auth: { kind: "basic-auth", evidence: ["hasValidOpsCredentials(username, password)"], note: "Login zelf: publiek bereikbaar, gedeeld OPS_DASHBOARD_PASSWORD." },
    csrf: ADMIN_CSRF,
    rateLimit: { kind: "lib-in-memory", key: "ops-login:<ip>", max: 10, windowSec: 60, evidence: [`rateLimit(\`ops-login:${ip}\`, LOGIN_RATE_MAX, LOGIN_RATE_WINDOW_MS)`, "LOGIN_RATE_MAX = 10;", "LOGIN_RATE_WINDOW_MS = 60_000;"] },
    // F-39 (deels): per naam 10/min + lockout 5/15 min (max. 15 min); per IP 5/15 min · 10/1 u · 20/24 u (lib/admin/login-throttle.ts).
    lockout: { evidence: ["checkOpsLogin(ip, username)", "recordOpsLoginFailure(ip, username)"] },
    validation: { kind: "handgeschreven", evidence: ["typeof body?.username === \"string\"", "typeof body?.password === \"string\""] },
    pii: { fields: ["username", "password"], logged: [] },
    bodyLimit: { kind: "none" },
    gaps: [
      { category: "rate-limit", finding: "F-39", text: "Deels opgelost: limiet en lockout zijn in-memory per instance; gericht blokkeren van het gedeelde ops-account (max. 15 min per instance) blijft mogelijk. Definitief via S8." },
      { category: "body-size", finding: "F-42", text: "request.json() zonder eigen limiet op een publiek endpoint." },
    ],
  },
  {
    route: "/api/admin/session", file: ADMIN_SESSION, method: "DELETE",
    auth: { kind: "publiek", evidence: [], note: "Uitloggen: wist alleen de eigen cookie." },
    csrf: ADMIN_CSRF,
    rateLimit: { kind: "none" },
    validation: { kind: "geen-invoer", evidence: [] },
    pii: { fields: [], logged: [] },
    bodyLimit: { kind: "geen-body" },
    gaps: [{ category: "rate-limit", finding: "F-37", text: "Geen limiet (laag risico: zet alleen een lege cookie, Origin-check ervoor)." }],
  },

  // ── Publiek: boeken, prijs, leads, betalen ───────────────────────────────
  {
    route: "/api/bookings", file: "app/api/bookings/route.ts", method: "POST",
    auth: { kind: "publiek", evidence: [], note: "Honeypot `website` (stil 200, geen DB-write)." },
    csrf: "n.v.t.",
    rateLimit: { kind: "lib-in-memory", key: "bookings:<ip>", max: 5, windowSec: 600, evidence: [`rateLimit(\`bookings:${ip}\`, RATE_MAX, RATE_WINDOW_MS)`, "RATE_MAX = 5;", "RATE_WINDOW_MS = 10 * 60_000;"] },
    validation: { kind: "handgeschreven", evidence: ["EMAIL_RE.test(email)", "TIME_RE.test(time)", "classifyLuggage(luggage)", "resolveBookingPrice("] },
    pii: {
      fields: ["customerName", "customerEmail", "customerPhone", "pickup", "dropoff", "flightNumber"],
      logged: [
        { what: "IP + user-agent bij rate-limit", evidence: "rate-limit overschreden ip=${ip} ua=" },
        { what: "IP bij te grote payload", evidence: "payload te groot (${rawBody.length} tekens) ip=${ip}" },
        { what: "IP + user-agent bij honeypot", evidence: "honeypot geraakt ip=${ip} ua=" },
      ],
    },
    bodyLimit: { kind: "na-inlezen", maxBytes: 4096, unit: "tekens", evidence: ["MAX_BODY_BYTES = 4096", "rawBody.length > MAX_BODY_BYTES"] },
    gaps: [
      { category: "pii-log", finding: "F-43", text: "IP en user-agent in console.warn." },
      { category: "body-size", finding: "F-42", text: "Limiet pas na volledig inlezen en in tekens i.p.v. bytes." },
    ],
  },
  {
    route: "/api/pricing/quote", file: "app/api/pricing/quote/route.ts", method: "POST",
    auth: { kind: "publiek", evidence: [] },
    csrf: "n.v.t.",
    rateLimit: { kind: "lib-in-memory", key: "pricing-quote:<ip>", max: 20, windowSec: 60, evidence: [`rateLimit(\`pricing-quote:${ip}\`, RATE_MAX, RATE_WINDOW_MS)`, "RATE_MAX = 20;", "RATE_WINDOW_MS = 60_000;"] },
    validation: { kind: "handgeschreven", evidence: ["MAX_ADDRESS_CHARS", "classifyLuggage(luggageCategory)", "isExistingCalendarDate(normalizedDate)"] },
    pii: {
      fields: ["pickup", "dropoff (vrije adresinvoer, mogelijk woonadres)"],
      logged: [],
      persistedLog: "pricing_quote_logs.pickup_input/dropoff_input/request_payload (via lib/pricing/service.ts logQuote)",
    },
    bodyLimit: { kind: "na-inlezen", maxBytes: 8000, unit: "bytes", evidence: ["MAX_BODY_BYTES = 8_000", "new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES"] },
    upstreamCost: "Google Directions (dynamische routes)",
    gaps: [
      { category: "pii-opslag", finding: "F-44", text: "Vrije adresinvoer van elke prijsaanvraag in pricing_quote_logs; geen opschoning in de repo." },
      { category: "body-size", finding: "F-42", text: "Limiet pas na volledig inlezen." },
    ],
  },
  {
    route: "/api/leads", file: "app/api/leads/route.ts", method: "POST",
    auth: { kind: "publiek", evidence: [], note: "Honeypot `website` (stil 200, geen mail)." },
    csrf: "n.v.t.",
    rateLimit: { kind: "lib-in-memory", key: "leads:<ip>", max: 5, windowSec: 600, evidence: [`rateLimit(\`leads:${ip}\`, 5, 10 * 60_000)`] },
    validation: { kind: "handgeschreven", evidence: ["LEAD_KINDS.includes(kind)", "parseFields(body.fields)", "EMAIL_RE.test(email)", "allowedTopics.includes(topic)"] },
    pii: { fields: ["name", "email", "phone", "company", "message", "fields[]"], logged: [] },
    bodyLimit: { kind: "na-inlezen", maxBytes: 12000, unit: "tekens", evidence: ["MAX_BODY_BYTES = 12_000", "raw.length > MAX_BODY_BYTES"] },
    gaps: [{ category: "body-size", finding: "F-42", text: "Limiet pas na volledig inlezen en in tekens i.p.v. bytes." }],
  },
  {
    route: "/api/payments/create-intent", file: "app/api/payments/create-intent/route.ts", method: "POST",
    auth: { kind: "publiek", evidence: [], note: "Booking-UUID als capability; bedrag uit de database." },
    csrf: "n.v.t.",
    rateLimit: { kind: "lib-in-memory", key: "payments:<ip>|<user-agent>", max: 10, windowSec: 600, evidence: [`rateLimit(\`payments:${ip}|\${ua}\`, RATE_MAX, RATE_WINDOW_MS)`, "RATE_MAX = 10;", "RATE_WINDOW_MS = 10 * 60_000;"] },
    validation: { kind: "parserfunctie", evidence: ["parsePaymentRequest(body)", "application/json"] },
    pii: {
      fields: ["bookingId (capability)"],
      logged: [
        { what: "IP bij te grote payload", evidence: "payload te groot (${rawBody.length} tekens) ip=${ip}" },
        { what: "IP bij rate-limit", evidence: "rate-limit overschreden ip=${ip}" },
      ],
    },
    bodyLimit: { kind: "na-inlezen", maxBytes: 2048, unit: "tekens", evidence: ["MAX_BODY_BYTES = 2048", "rawBody.length > MAX_BODY_BYTES"] },
    upstreamCost: "Stripe PaymentIntent",
    gaps: [
      { category: "rate-limit", finding: "F-40", text: "Sleutel bevat de user-agent: UA-rotatie omzeilt de limiet; 413/415 tellen niet mee." },
      { category: "pii-log", finding: "F-43", text: "IP in console.warn." },
      { category: "body-size", finding: "F-42", text: "Limiet pas na volledig inlezen en in tekens i.p.v. bytes." },
    ],
  },
  {
    route: "/api/payments/status", file: "app/api/payments/status/route.ts", method: "GET",
    auth: { kind: "publiek", evidence: [], note: "Booking-UUID als capability; alleen niet-PII statusvelden." },
    csrf: "n.v.t.",
    rateLimit: { kind: "lib-in-memory", key: "payment-status:<ip>", max: 60, windowSec: 60, evidence: [`rateLimit(\`payment-status:${ip}\`, RATE_MAX, RATE_WINDOW_MS)`, "RATE_MAX = 60;", "RATE_WINDOW_MS = 60_000;"] },
    validation: { kind: "parserfunctie", evidence: ["parseBookingIdParam("] },
    pii: { fields: [], logged: [] },
    bodyLimit: { kind: "geen-body" },
    gaps: [],
  },

  // ── Publiek: kosten-/quotumgevoelige proxies ─────────────────────────────
  {
    route: "/api/places", file: "app/api/places/route.ts", method: "GET",
    auth: { kind: "publiek", evidence: [] },
    csrf: "n.v.t.",
    rateLimit: { kind: "route-lokaal-in-memory", key: "<x-forwarded-for[0]>", max: 30, windowSec: 60, evidence: ["isRateLimited(ip)", "const RATE_LIMIT = 30;", "const WINDOW_MS = 60_000;"] },
    validation: { kind: "handgeschreven", evidence: ["sanitizeQuery(", "MAX_QUERY_LENGTH = 120"] },
    pii: { fields: ["q (adresfragment)"], logged: [] },
    bodyLimit: { kind: "geen-body" },
    upstreamCost: "Google Places Autocomplete (per aanroep betaald)",
    gaps: [{ category: "kosten", finding: "F-38", text: "Geen apart/globaal Google-budget: eigen route-lokale limiter, per IP en per instance; memory guard wist alle tellers." }],
  },
  {
    route: "/api/flights/[flightNumber]", file: "app/api/flights/[flightNumber]/route.ts", method: "GET",
    auth: { kind: "publiek", evidence: [] },
    csrf: "n.v.t.",
    rateLimit: { kind: "lib-in-memory", key: "flights:<ip>", max: 30, windowSec: 60, evidence: [`rateLimit(\`flights:${ip}\`, RATE_MAX, RATE_WINDOW_MS)`, "RATE_MAX = 30;", "RATE_WINDOW_MS = 60_000;"] },
    validation: { kind: "handgeschreven", evidence: ["DATE_RE.test(date)", "directionParam !== \"arrival\"", "getFlightStatus(flightNumber, options)"] },
    pii: { fields: ["flightNumber"], logged: [] },
    bodyLimit: { kind: "geen-body" },
    upstreamCost: "Schiphol Public Flight API (quotum)",
    gaps: [],
  },
  {
    route: "/api/flights/health", file: "app/api/flights/health/route.ts", method: "GET",
    auth: { kind: "publiek", evidence: [] },
    csrf: "n.v.t.",
    rateLimit: { kind: "lib-in-memory", key: "flights-health:<ip>", max: 6, windowSec: 60, evidence: [`rateLimit(\`flights-health:${ip}\`, RATE_MAX, RATE_WINDOW_MS)`, "RATE_MAX = 6;", "RATE_WINDOW_MS = 60_000;"] },
    upstreamCache: { ttlSec: 60, evidence: ["cachedSchipholHealth(() => checkSchipholHealth())"] },
    validation: { kind: "geen-invoer", evidence: [] },
    pii: { fields: [], logged: [] },
    bodyLimit: { kind: "geen-body" },
    upstreamCost: "Schiphol Public Flight API (max. één opvraag per 60 s per instance, F-41)",
    gaps: [{ category: "kosten", finding: "F-41", text: "Deels opgelost: cache en limiet per instance (60 s) zijn geen globale quotumbescherming; veel instances of IP's kunnen het quotum nog raken." }],
  },

  // ── Server-naar-server ───────────────────────────────────────────────────
  {
    route: "/api/flights/monitor", file: "app/api/flights/monitor/route.ts", method: "POST",
    auth: { kind: "service", evidence: ["secretsMatch(providedSecret(request), secret)"], note: "FLIGHT_MONITOR_SECRET, constant-time." },
    csrf: "n.v.t.",
    rateLimit: { kind: "none" },
    validation: { kind: "handgeschreven", evidence: ["readTraceId(request)", "startExecution(supabase, traceId)"] },
    pii: { fields: [], logged: [] },
    bodyLimit: { kind: "geen-body" },
    gaps: [{ category: "rate-limit", finding: "F-37", text: "Geen limiet; acceptabel achter gedeeld geheim + eenmalige trace_id." }],
  },
  {
    route: "/api/stripe/webhook", file: "app/api/stripe/webhook/route.ts", method: "POST",
    auth: { kind: "webhook-signature", evidence: ["stripe.webhooks.constructEvent(rawBody, sig, secret)"] },
    csrf: "n.v.t.",
    rateLimit: { kind: "none" },
    validation: { kind: "bibliotheek", evidence: ["handleStripeEvent(event"] },
    pii: { fields: [], logged: [] },
    bodyLimit: { kind: "none" },
    gaps: [
      { category: "rate-limit", finding: "F-37", text: "Geen limiet; acceptabel achter signature-verificatie." },
      { category: "body-size", finding: "F-42", text: "Raw body zonder eigen limiet (nodig vóór de signature-check)." },
    ],
  },
  {
    route: "/api/webhooks/resend", file: "app/api/webhooks/resend/route.ts", method: "POST",
    auth: { kind: "webhook-signature", evidence: ["verifyResendSignature({"] },
    csrf: "n.v.t.",
    rateLimit: { kind: "none" },
    validation: { kind: "handgeschreven", evidence: ["deliveryStatusFor(payload.type)", "typeof payload?.data?.email_id === \"string\""] },
    pii: { fields: ["email_id (provider-id)"], logged: [] },
    bodyLimit: { kind: "none" },
    gaps: [
      { category: "rate-limit", finding: "F-37", text: "Geen limiet; acceptabel achter signature-verificatie." },
      { category: "body-size", finding: "F-42", text: "Raw body zonder eigen limiet (nodig vóór de signature-check)." },
    ],
  },

  // ── Sanity draft mode ────────────────────────────────────────────────────
  {
    route: "/api/draft-mode/enable", file: "app/api/draft-mode/enable/route.ts", method: "GET",
    auth: { kind: "draft-secret", evidence: ["defineEnableDraftMode({"], note: "next-sanity valideert het preview-secret; zonder token 503." },
    csrf: "n.v.t.",
    rateLimit: { kind: "none" },
    validation: { kind: "bibliotheek", evidence: ["defineEnableDraftMode({"] },
    pii: { fields: [], logged: [] },
    bodyLimit: { kind: "geen-body" },
    gaps: [{ category: "rate-limit", finding: "F-37", text: "Geen limiet; secret-validatie door next-sanity." }],
  },
  {
    route: "/api/draft-mode/disable", file: "app/api/draft-mode/disable/route.ts", method: "GET",
    auth: { kind: "publiek", evidence: [], note: "Zet alleen de eigen draft-cookie uit." },
    csrf: "n.v.t.",
    rateLimit: { kind: "none" },
    validation: { kind: "geen-invoer", evidence: [] },
    pii: { fields: [], logged: [] },
    bodyLimit: { kind: "geen-body" },
    gaps: [{ category: "rate-limit", finding: "F-37", text: "Geen limiet (laag risico: geen upstream, geen data)." }],
  },
];
