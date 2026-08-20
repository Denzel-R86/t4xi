import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

/**
 * Twee taken, in vaste volgorde:
 *   1. Toegangsbeveiliging voor de interne routes (Sprint 11, Fase 0) — met
 *      locale-prefix gestript, zodat /en/dashboard even dicht zit als /dashboard.
 *   2. i18n-routing (next-intl, stap 3): NL zonder prefix, EN onder /en,
 *      géén automatische browsertaal-redirects (localeDetection: false).
 */
const intlMiddleware = createIntlMiddleware(routing);

/**
 * Toegangsbeveiliging voor de interne routes (Sprint 11, Fase 0).
 *
 * Vóór deze middleware waren /dashboard, /dashboard/brain en /klant publiek
 * bereikbaar zonder enige authenticatie. /dashboard/brain toonde daarbij echte
 * productiedata: kostprijzen, marges en adviesprijzen per route. De `robots`-
 * metadata op die pagina's houdt zoekmachines weg, maar de URL's zijn raadbaar.
 *
 * Beleid:
 *   /dashboard/brain  → HTTP Basic Auth, credentials uitsluitend server-side.
 *   /dashboard/invoices → publiek login-scherm; data uitsluitend met HttpOnly-sessie.
 *   overige /dashboard → 404. Demo-UI met voorbeelddata, geen functie in productie.
 *   /klant            → 404. Klantportaal met schijn-login, geen echte auth.
 *
 * 404 in plaats van 401/403 voor de gesloten routes: een 403 bevestigt dat de route
 * bestaat, een 404 niet.
 *
 * FAIL CLOSED. Ontbreken BRAIN_DASHBOARD_USERNAME of BRAIN_DASHBOARD_PASSWORD, dan
 * geeft /dashboard/brain een 404 in plaats van open te staan. Een ontbrekende
 * configuratie mag nooit tot publieke toegang leiden.
 *
 * Basic Auth verzendt credentials base64-gecodeerd, niet versleuteld. Dit is
 * uitsluitend veilig over HTTPS — in productie dwingt de HSTS-header uit
 * next.config.mjs dat af. Dit is een interim-maatregel tot echte authenticatie met
 * sessies en MFA bestaat; het is géén schijn-login, maar ook geen eindstation.
 */

const REALM = "T4XI intern";

/** Constant-time vergelijking via SHA-256, zodat ook de lengte niets prijsgeeft. */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

function notFound(): NextResponse {
  return new NextResponse("404 — niet gevonden", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex, nofollow" },
  });
}

function challenge(): NextResponse {
  return new NextResponse("Authenticatie vereist", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "content-type": "text/plain; charset=utf-8",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export async function proxy(request: NextRequest) {
  // Locale-prefix strippen VÓÓR de beveiligingschecks: /en/dashboard moet
  // exact even dicht zitten als /dashboard. Nooit een localepad langs de
  // auth-logica laten glippen.
  const rawPathname = request.nextUrl.pathname;
  const pathname = rawPathname.replace(/^\/(nl|en)(?=\/|$)/, "") || "/";

  const isProtected =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/") ||
    pathname === "/klant" || pathname.startsWith("/klant/");

  // Alles buiten de beschermde paden: alleen i18n-routing.
  if (!isProtected) return intlMiddleware(request);

  // ── /dashboard/invoices — loginformulier + server-side sessie ───────────
  // De pagina zelf bevat geen gegevens. Alle operations-API's controleren de
  // ondertekende HttpOnly-sessie. Hierdoor kan de gebruiker betrouwbaar
  // uitloggen; browsers kunnen HTTP Basic Auth namelijk zelf blijven cachen.
  if (pathname === "/dashboard/invoices" || pathname.startsWith("/dashboard/invoices/")) {
    const res = intlMiddleware(request);
    res.headers.set("x-robots-tag", "noindex, nofollow");
    res.headers.set("cache-control", "no-store");
    return res;
  }

  // ── /dashboard/brain — Basic Auth ────────────────────────────────────────
  if (pathname === "/dashboard/brain" || pathname.startsWith("/dashboard/brain/")) {
    const user = process.env.BRAIN_DASHBOARD_USERNAME;
    const pass = process.env.BRAIN_DASHBOARD_PASSWORD;

    // Fail closed: geen configuratie betekent geen toegang, niet vrije toegang.
    if (!user || !pass) return notFound();

    const header = request.headers.get("authorization");
    if (!header?.startsWith("Basic ")) return challenge();

    let decoded: string;
    try {
      decoded = atob(header.slice(6));
    } catch {
      return challenge();
    }

    // Alleen op de eerste dubbele punt splitsen: wachtwoorden mogen die bevatten.
    const sep = decoded.indexOf(":");
    if (sep < 0) return challenge();

    const [okUser, okPass] = await Promise.all([
      safeEqual(decoded.slice(0, sep), user),
      safeEqual(decoded.slice(sep + 1), pass),
    ]);
    if (!okUser || !okPass) return challenge();

    const res = NextResponse.next();
    res.headers.set("x-robots-tag", "noindex, nofollow");
    res.headers.set("cache-control", "no-store");
    return res;
  }

  // ── /dashboard en /klant — volledig gesloten ─────────────────────────────
  return notFound();
}

export const config = {
  // Alles behalve API-routes, de eigen Sanity Studio, Next-internals en statische
  // bestanden (met punt). /studio beheert zijn eigen interne router en mag nooit
  // door de locale-middleware worden herschreven.
  matcher: ["/((?!api|studio(?:/|$)|_next|_vercel|.*\\..*).*)"],
};
