/**
 * CSP-violation-rapporten (S1) terugbrengen tot een PII-vrije samenvatting.
 *
 * Een rapport is onbetrouwbare invoer (iedereen kan naar /api/csp-report posten)
 * en kan persoonsgegevens bevatten: `document-uri`/`blocked-uri` met querystring,
 * `script-sample`, referrer. Daarom wordt alleen bewaard:
 *   · directive  — allowlist-teken­set;
 *   · blocked    — CSP-sleutelwoord (inline/eval/…) of uitsluitend de ORIGIN;
 *   · page       — uitsluitend het PAD (geen query/hash), tekenset begrensd;
 *   · source     — uitsluitend de origin van het bronbestand;
 *   · disposition — report | enforce;
 *   · category   — bekende groep (F-47, stripe-host) of `onbekend`, zodat de
 *     7-dagenanalyse F-47-ruis direct kan scheiden (docs: masterplan §9 S1).
 * Nooit: query, hash, script-sample, referrer, IP, user-agent, statuscode.
 *
 * Ondersteunt beide formaten: `report-uri` (application/csp-report,
 * `{"csp-report": {...}}`) en de Reporting API (application/reports+json, array).
 */

export type CspViolationCategory =
  /** Bekend: statisch voorgerenderde pagina zonder nonce (findings F-47). */
  | "F-47 ssg-no-nonce"
  /** Stripe-/Link-host buiten de policy: bewijs voor de Stripe-hostvraag (S1). */
  | "stripe-host"
  /** Nieuw: handmatig beoordelen. */
  | "onbekend";

export type CspViolationSummary = {
  directive: string;
  /** CSP-sleutelwoord, `self` (zelfde origin als de pagina) of een vreemde origin. */
  blocked: string;
  page: string;
  source: string;
  disposition: "report" | "enforce" | "?";
  category: CspViolationCategory;
};

/**
 * SSG-routes (● in de `next build`-routetabel) zonder locale-prefix. Deze pagina's
 * hebben geen nonce (F-47). Wijzigt de routetabel, dan faalt csp.test.ts zodra
 * er een build ligt (vergelijking met .next/prerender-manifest.json).
 */
export const SSG_PAGE_PATHS = [
  "/dagtochten",
  "/dashboard/invoices",
  "/diensten",
  "/over-ons",
  "/partner",
  "/privacy",
  "/producten",
  "/voorwaarden",
  "/zakelijk-vervoer",
] as const;

const STRIPE_HOST_RE = /^https:\/\/(?:[a-z0-9-]+\.)*(?:stripe\.com|stripe\.network|link\.com)$/;

export function classifyCspViolation(v: Omit<CspViolationSummary, "category">): CspViolationCategory {
  const page = v.page.replace(/^\/en(?=\/|$)/, "") || "/";
  const script = v.directive === "script-src" || v.directive === "script-src-elem";
  if (script && (v.blocked === "inline" || v.blocked === "self") && (SSG_PAGE_PATHS as readonly string[]).includes(page)) {
    return "F-47 ssg-no-nonce";
  }
  if (STRIPE_HOST_RE.test(v.blocked)) return "stripe-host";
  return "onbekend";
}

export const MAX_REPORTS_PER_REQUEST = 10;

const KEYWORDS = new Set(["inline", "eval", "wasm-eval", "trusted-types-policy", "trusted-types-sink", "data", "blob", "self"]);
const DIRECTIVE_RE = /^[a-z-]{3,40}$/;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function originOf(raw: string): string {
  if (!raw) return "-";
  const keyword = raw.trim().toLowerCase();
  if (KEYWORDS.has(keyword)) return keyword;
  try {
    const url = new URL(raw);
    if (url.protocol === "data:" || url.protocol === "blob:") return url.protocol.slice(0, -1);
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "wss:") return "other";
    return url.origin;
  } catch {
    return "other";
  }
}

function pathOf(raw: string): string {
  if (!raw) return "-";
  try {
    const path = new URL(raw).pathname;
    // Alleen veilige padtekens; begrensd tegen log-injectie en log-flooding.
    return path.replace(/[^A-Za-z0-9/_.~-]/g, "_").slice(0, 120) || "/";
  } catch {
    return "other";
  }
}

function summarize(body: Record<string, unknown>, legacy: boolean): CspViolationSummary {
  const directiveRaw = str(legacy ? body["effective-directive"] || body["violated-directive"] : body.effectiveDirective);
  const directive = directiveRaw.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const disposition = str(body.disposition);
  const documentUrl = str(legacy ? body["document-uri"] : body.documentURL);
  const documentOrigin = originOf(documentUrl);
  const same = (origin: string) => (origin.startsWith("http") && origin === documentOrigin ? "self" : origin);
  const summary = {
    directive: DIRECTIVE_RE.test(directive) ? directive : "?",
    blocked: same(originOf(str(legacy ? body["blocked-uri"] : body.blockedURL))),
    page: pathOf(documentUrl),
    source: same(originOf(str(legacy ? body["source-file"] : body.sourceFile))),
    disposition: (disposition === "report" || disposition === "enforce" ? disposition : "?") as CspViolationSummary["disposition"],
  };
  return { ...summary, category: classifyCspViolation(summary) };
}

/** Parset een (al grootte-begrensde) body. Ongeldig → lege lijst. */
export function parseCspReports(raw: string): CspViolationSummary[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const legacy = (parsed as Record<string, unknown>)["csp-report"];
    if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
      return [summarize(legacy as Record<string, unknown>, true)];
    }
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: CspViolationSummary[] = [];
  for (const item of parsed.slice(0, MAX_REPORTS_PER_REQUEST)) {
    if (!item || typeof item !== "object") continue;
    const report = item as Record<string, unknown>;
    if (report.type !== "csp-violation" || !report.body || typeof report.body !== "object") continue;
    out.push(summarize(report.body as Record<string, unknown>, false));
  }
  return out;
}

/** Eén logregel, alleen samengevatte velden. */
export function formatCspViolation(v: CspViolationSummary): string {
  return `[csp-report] category="${v.category}" disposition=${v.disposition} directive=${v.directive} blocked=${v.blocked} page=${v.page} source=${v.source}`;
}
