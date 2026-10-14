/**
 * Origin-/Referer-check voor muterende cookie-auth routes (F-39, masterplan §9b
 * "CSRF-bescherming op alle muterende routes met cookie-auth").
 *
 * Toegestaan is alleen de eigen site:
 *   · de productiedomeinen (SITE_URL in lib/seo-locale.ts plus het apex-domein);
 *   · de origin van het verzoek zelf (`x-forwarded-host` → `host` → request.url).
 *     Daarmee werken preview-, staging- en localhost-deploys zonder nieuwe env-vars;
 *     dit is hetzelfde mechanisme waarmee Next.js Server Actions CSRF weren. Een
 *     browser op een vreemde site kan Host/x-forwarded-host niet zetten zonder een
 *     CORS-preflight die hier nooit slaagt.
 *
 * Ontbreekt de Origin-header, dan geldt de Referer-origin. Ontbreken beide (of is
 * Origin `null`), dan WEIGEREN we: moderne browsers sturen Origin altijd mee op een
 * POST/DELETE via fetch, dus een kale aanvraag is een niet-browserclient of een
 * gestripte/sandboxed context. De ops-UI is de enige legitieme client. Fail-closed.
 */

/** Productie-origins; houd gelijk met SITE_URL in lib/seo-locale.ts. */
export const PRODUCTION_ORIGINS = ["https://www.t4xi.nl", "https://t4xi.nl"] as const;

function originOf(value: string | null): string | null {
  if (!value || value === "null") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function ownOrigin(request: Request): string | null {
  const url = new URL(request.url);
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host)
    .split(",")[0]
    .trim();
  const proto = (request.headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, ""))
    .split(",")[0]
    .trim();
  if (!host || (proto !== "https" && proto !== "http")) return null;
  return originOf(`${proto}://${host}`);
}

/** True alleen als Origin (of bij afwezigheid Referer) exact de eigen site is. */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.has("origin")
    ? originOf(request.headers.get("origin"))
    : originOf(request.headers.get("referer"));
  if (!origin) return false;
  if ((PRODUCTION_ORIGINS as readonly string[]).includes(origin)) return true;
  return origin === ownOrigin(request);
}
