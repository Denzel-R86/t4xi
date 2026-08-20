import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";
import sitemap from "@/app/sitemap";
import { AIRPORT_ROUTE_PATHS } from "@/i18n/routing";
import { getAirportLandingCopy } from "@/lib/airport-landing-copy";
import { localeMetadata, localeUrl } from "@/lib/seo-locale";
import { getLocalizedStad } from "@/lib/seo-steden";
import { proxy } from "@/proxy";

const pageSource = readFileSync("app/[locale]/[slug]/page.tsx", "utf8");
const proxySource = readFileSync("proxy.ts", "utf8");
const rateTableSource = readFileSync("components/seo/RateTable.tsx", "utf8");

type MetadataAlternates = {
  canonical?: string | URL | null;
  languages?: Record<string, string | URL>;
};

test("alle vijf Schiphol-routes hebben zelfstandige, volledige Engelse content", () => {
  assert.equal(AIRPORT_ROUTE_PATHS.length, 5);

  for (const path of AIRPORT_ROUTE_PATHS) {
    const slug = path.slice(1);
    const nl = getLocalizedStad(slug, "nl");
    const en = getLocalizedStad(slug, "en");

    assert.ok(nl, `${slug} mist Nederlandse content`);
    assert.ok(en, `${slug} mist Engelse content`);
    assert.notEqual(en.intro, nl.intro);
    assert.match(en.metaTitle, /Schiphol.*fixed fare/i);
    assert.match(en.metaDescription, /fixed fare/i);
    assert.ok(en.intro.length >= 160, `${slug} heeft een te korte Engelse intro`);
    assert.ok(en.vertrekpunten.length >= 3);
    assert.ok(en.faq.length >= 4);
    assert.ok(en.faq.every((faq) => faq.q.length > 20 && faq.a.length > 100));
    assert.equal(en.bookingPickupName, nl.naam, "boekingsflow moet de bestaande plaatsnaam behouden");
  }

  assert.equal(getLocalizedStad("taxi-den-haag-schiphol", "en")?.naam, "The Hague");
});

test("metadata is self-canonical en koppelt NL en EN met hreflang", () => {
  for (const path of AIRPORT_ROUTE_PATHS) {
    const slug = path.slice(1);
    for (const locale of ["nl", "en"] as const) {
      const stad = getLocalizedStad(slug, locale);
      assert.ok(stad);
      const metadata = localeMetadata({
        locale,
        path,
        title: stad.metaTitle,
        description: stad.metaDescription,
      });
      const alternates = metadata.alternates as MetadataAlternates;

      assert.equal(String(alternates.canonical), localeUrl(locale, path));
      assert.equal(String(alternates.languages?.["nl-NL"]), localeUrl("nl", path));
      assert.equal(String(alternates.languages?.en), localeUrl("en", path));
      assert.equal(String(alternates.languages?.["x-default"]), localeUrl("nl", path));
      assert.equal(metadata.openGraph?.url, localeUrl(locale, path));
    }
  }
});

test("sitemap publiceert beide locales en hun onderlinge alternates", () => {
  const entries = sitemap();

  for (const path of AIRPORT_ROUTE_PATHS) {
    const nlUrl = localeUrl("nl", path);
    const enUrl = localeUrl("en", path);
    const nl = entries.find((entry) => entry.url === nlUrl);
    const en = entries.find((entry) => entry.url === enUrl);

    assert.ok(nl, `${nlUrl} ontbreekt in sitemap`);
    assert.ok(en, `${enUrl} ontbreekt in sitemap`);
    assert.equal(nl.alternates?.languages?.en, enUrl);
    assert.equal(en.alternates?.languages?.["nl-NL"], nlUrl);
    assert.equal(en.alternates?.languages?.["x-default"], nlUrl);
  }
});

test("route behoudt locale, gebruikt live tarieven en maakt gelokaliseerde JSON-LD", () => {
  assert.match(pageSource, /import \{ Link \} from "@\/i18n\/navigation"/);
  assert.match(pageSource, /href=\{bookingHref\}/);
  assert.match(pageSource, /localeUrl\(locale, bookingHref\)/);
  assert.match(pageSource, /await loadRateCard\(\)/);
  assert.match(pageSource, /price: rate\.single/);
  assert.match(pageSource, /pickup=\$\{encodeURIComponent\(rate\.from\)\}/);
  assert.match(pageSource, /"@type": "Service"/);
  assert.match(pageSource, /"@type": "FAQPage"/);
  assert.match(pageSource, /"@type": "BreadcrumbList"/);
  for (const value of ["breadcrumbJsonLd", "serviceJsonLd", "faqJsonLd"]) {
    assert.match(
      pageSource,
      new RegExp(`JSON\\.stringify\\(${value}\\)\\.replace\\(\\/<\\/g, "\\\\\\\\u003c"\\)`),
      `${value} moet '<' veilig escapen voordat het in een script-element komt`,
    );
  }
  assert.doesNotMatch(pageSource, /permanentRedirect/);

  const english = getAirportLandingCopy("en");
  assert.equal(english.bookNow, "Book your journey");
  assert.match(english.serviceType("Amsterdam"), /Private taxi transfer/);
  assert.match(rateTableSource, /getAirportLandingCopy\(locale\)\.rateTable/);
  assert.match(rateTableSource, /tracking-\[0\.1em\] text-secondary/);
  assert.doesNotMatch(pageSource, /italic text-stone">\{copy\.(?:heroDestination|contentHeadingAccent)\}/);
});

test("Engelse routes passeren de proxy zonder redirect naar Nederlands", async () => {
  assert.doesNotMatch(proxySource, /isNlOnlyRoutePath|NL_ONLY_ROUTE_PATHS/);
  assert.doesNotMatch(proxySource, /rawPathname\.startsWith\("\/en\/"\)/);

  for (const path of AIRPORT_ROUTE_PATHS) {
    const response = await proxy(new NextRequest(`https://www.t4xi.nl/en${path}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
  }
});
