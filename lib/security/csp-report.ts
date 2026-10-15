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
 *   · disposition — report | enforce.
 * Nooit: query, hash, script-sample, referrer, IP, user-agent, statuscode.
 *
 * Ondersteunt beide formaten: `report-uri` (application/csp-report,
 * `{"csp-report": {...}}`) en de Reporting API (application/reports+json, array).
 */

export type CspViolationSummary = {
  directive: string;
  blocked: string;
  page: string;
  source: string;
  disposition: "report" | "enforce" | "?";
};

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
  return {
    directive: DIRECTIVE_RE.test(directive) ? directive : "?",
    blocked: originOf(str(legacy ? body["blocked-uri"] : body.blockedURL)),
    page: pathOf(str(legacy ? body["document-uri"] : body.documentURL)),
    source: originOf(str(legacy ? body["source-file"] : body.sourceFile)),
    disposition: disposition === "report" || disposition === "enforce" ? disposition : "?",
  };
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
  return `[csp-report] disposition=${v.disposition} directive=${v.directive} blocked=${v.blocked} page=${v.page} source=${v.source}`;
}
