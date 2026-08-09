import { stegaClean } from "next-sanity";

const SITE_ORIGIN = "https://www.t4xi.nl";

/** Controleer of een redactionele link een relatief pad op de T4XI-origin is. */
export function isSafeCmsInternalHref(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const clean = stegaClean(value).trim();
  if (!clean.startsWith("/") || clean.startsWith("//") || /[\\\s]/.test(clean)) {
    return false;
  }

  try {
    const parsed = new URL(clean, SITE_ORIGIN);
    return parsed.origin === SITE_ORIGIN;
  } catch {
    return false;
  }
}

/** Beperk redactionele links tot een relatief pad op de eigen T4XI-origin. */
export function safeCmsInternalHref(value: unknown, fallback = "/contact"): string {
  if (!isSafeCmsInternalHref(value)) return fallback;
  const parsed = new URL(stegaClean(value).trim(), SITE_ORIGIN);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** Verwijder Visual Editing-markers uit tekst die als HTML-attribuut wordt gebruikt. */
export function cleanCmsOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = stegaClean(value).trim();
  return clean || undefined;
}
