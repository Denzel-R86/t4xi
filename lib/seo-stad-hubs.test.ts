import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sitemap from "@/app/sitemap";
import { AIRPORT_ROUTE_PATHS, LOCAL_HUB_PATHS } from "@/i18n/routing";
import { localeMetadata, localeUrl } from "@/lib/seo-locale";
import { getStadHub, STAD_HUB_SLUGS } from "@/lib/seo-stad-hubs";

const hubSource = readFileSync("lib/seo-stad-hubs.ts", "utf8");
const templateSource = readFileSync("components/seo/StadHubPage.tsx", "utf8");
const pageSource = readFileSync("app/[locale]/[slug]/page.tsx", "utf8");
const footerSource = readFileSync("components/sections/Footer.tsx", "utf8");

type MetadataAlternates = {
  canonical?: string | URL | null;
  languages?: Record<string, string | URL>;
};

test("de twee vaste standplaatsen hebben een hub in beide talen", () => {
  assert.equal(LOCAL_HUB_PATHS.length, 2);
  assert.deepEqual([...STAD_HUB_SLUGS], ["taxi-almere", "taxi-spijkenisse"]);

  for (const path of LOCAL_HUB_PATHS) {
    const slug = path.slice(1);
    for (const locale of ["nl", "en"] as const) {
      const hub = getStadHub(slug, locale);
      assert.ok(hub, `${slug} ontbreekt in ${locale}`);
      assert.equal(hub.slug, slug);
      assert.ok(hub.intro.length >= 160, `${slug}/${locale} heeft een te korte intro`);
      assert.ok(hub.gebieden.length >= 5);
      assert.ok(hub.secties.length >= 3);
      assert.ok(hub.faq.length >= 3);
      assert.ok(hub.faq.every((f) => f.q.length > 20 && f.a.length > 100));
      // De locale-layout plakt er " — T4XI" (7 tekens) achter; 52 houdt de
      // uiteindelijke <title> binnen de ~60 tekens die Google toont.
      assert.ok(hub.metaTitle.length <= 52, `${slug}/${locale} metaTitle is te lang`);
      assert.ok(
        hub.metaDescription.length >= 110 && hub.metaDescription.length <= 158,
        `${slug}/${locale} metaDescription valt buiten 110-158 tekens`,
      );
    }
  }
});

test("een onbekende slug levert geen hub op", () => {
  assert.equal(getStadHub("taxi-utrecht", "nl"), null);
  assert.equal(getStadHub("taxi-almere-schiphol", "nl"), null);
});

test("hub en routepagina kannibaliseren elkaar niet", () => {
  for (const slug of STAD_HUB_SLUGS) {
    const hub = getStadHub(slug, "nl");
    assert.ok(hub);
    // De hub is een ANDERE URL dan de routepagina en verwijst er wel naartoe.
    assert.notEqual(hub.slug, hub.routeSlug);
    assert.ok(
      (AIRPORT_ROUTE_PATHS as readonly string[]).includes(`/${hub.routeSlug}`),
      `${slug} verwijst naar een routepagina die niet bestaat`,
    );
  }
  // De hub-template mag geen tarieftabel tonen; die hoort bij de routepagina.
  assert.ok(!templateSource.includes("RateTable"));
  assert.ok(!templateSource.includes("loadRateCard"));
  // De hub wordt vóór de routepagina gematcht, anders valt /taxi-almere door.
  assert.ok(pageSource.indexOf("getStadHub") < pageSource.indexOf("getLocalizedStad(slug"));
});

test("Almere en Spijkenisse delen geen gekopieerde tekst", () => {
  const almere = getStadHub("taxi-almere", "nl");
  const spijkenisse = getStadHub("taxi-spijkenisse", "nl");
  assert.ok(almere && spijkenisse);

  assert.notEqual(almere.intro, spijkenisse.intro);
  assert.notEqual(almere.metaDescription, spijkenisse.metaDescription);
  for (const sectie of almere.secties) {
    assert.ok(
      !spijkenisse.secties.some((s) => s.tekst === sectie.tekst),
      "sectietekst is letterlijk hergebruikt tussen de twee steden",
    );
  }
  // Geen stad mag de wijken van de andere noemen.
  assert.ok(!almere.gebieden.some((g) => spijkenisse.gebieden.includes(g)));
});

test("hubs bevatten geen bedragen en geen verboden beloften", () => {
  // Het doc-commentaar somt de verboden formuleringen zélf op; controleer dus
  // uitsluitend de code, niet de toelichting erboven.
  const code = hubSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  // Prijzen komen uitsluitend uit de Pricing Engine — nooit uit de content.
  assert.ok(!/€\s?\d/.test(code), "er staat een bedrag in de hub-content");
  assert.ok(!/\b\d+\s?euro\b/i.test(code));

  for (const verboden of [
    "altijd op tijd",
    "op tijd gegarandeerd",
    "gratis annuleren",
    "beoordelingscijfer",
  ]) {
    assert.ok(
      !code.toLowerCase().includes(verboden),
      `verboden formulering aangetroffen: ${verboden}`,
    );
  }
});

test("sitemap publiceert de hubs met wederzijdse hreflang-alternates", () => {
  const entries = sitemap();
  for (const path of LOCAL_HUB_PATHS) {
    const nlUrl = localeUrl("nl", path);
    const enUrl = localeUrl("en", path);
    const nl = entries.find((e) => e.url === nlUrl);
    const en = entries.find((e) => e.url === enUrl);

    assert.ok(nl, `${nlUrl} ontbreekt in sitemap`);
    assert.ok(en, `${enUrl} ontbreekt in sitemap`);
    assert.equal(nl.alternates?.languages?.en, enUrl);
    assert.equal(en.alternates?.languages?.["nl-NL"], nlUrl);
    assert.equal(en.alternates?.languages?.["x-default"], nlUrl);
  }
});

test("hub-metadata is self-canonical en koppelt NL en EN", () => {
  for (const path of LOCAL_HUB_PATHS) {
    const slug = path.slice(1);
    for (const locale of ["nl", "en"] as const) {
      const hub = getStadHub(slug, locale);
      assert.ok(hub);
      const metadata = localeMetadata({
        locale,
        path,
        title: hub.metaTitle,
        description: hub.metaDescription,
      });
      const alternates = metadata.alternates as MetadataAlternates;

      assert.equal(String(alternates.canonical), localeUrl(locale, path));
      assert.equal(String(alternates.languages?.["nl-NL"]), localeUrl("nl", path));
      assert.equal(String(alternates.languages?.en), localeUrl("en", path));
      assert.equal(String(alternates.languages?.["x-default"]), localeUrl("nl", path));
    }
  }
});

test("de footer linkt de hubs crawlbaar in plaats van ze als tekst te noemen", () => {
  for (const path of LOCAL_HUB_PATHS) {
    assert.ok(footerSource.includes(`"${path}"`), `${path} ontbreekt in de footer`);
  }
  for (const path of AIRPORT_ROUTE_PATHS) {
    assert.ok(footerSource.includes(`"${path}"`), `${path} ontbreekt in de footer`);
  }
});
