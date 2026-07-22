import { notFound } from "next/navigation";

/**
 * Vangnet voor onbekende paden binnen een locale (bv. /en/foo/bar): rendert de
 * locale-not-found binnen de gewone layout, zonder redirect en zonder dat Next
 * buiten de [locale]-boom om een kale 404 hoeft te zoeken.
 */
export default function CatchAll(): never {
  notFound();
}
