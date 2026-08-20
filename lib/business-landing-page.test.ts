import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync("app/[locale]/zakelijk-vervoer/page.tsx", "utf8");
const contactPageSource = readFileSync("app/[locale]/contact/page.tsx", "utf8");
const contactFormSource = readFileSync("components/contact/ContactLeadForm.tsx", "utf8");
const homepageSource = readFileSync("app/[locale]/page.tsx", "utf8");
const servicesSource = readFileSync("components/sections/ServicesSection.tsx", "utf8");
const footerSource = readFileSync("components/sections/Footer.tsx", "utf8");
const sitemapSource = readFileSync("app/sitemap.ts", "utf8");
const nl = JSON.parse(readFileSync("messages/nl.json", "utf8"));
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));

function objectShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(objectShape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, objectShape(item)])
    );
  }
  return typeof value;
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(flattenStrings);
  }
  return [];
}

test("zakelijk-vervoer heeft locale-specifieke metadata en volledige NL/EN-copy", () => {
  assert.match(
    pageSource,
    /pageMetadata\([\s\S]*?"\/zakelijk-vervoer"[\s\S]*?"businessTitle"[\s\S]*?"businessDesc"/
  );
  assert.equal(typeof nl.seo.businessTitle, "string");
  assert.equal(typeof nl.seo.businessDesc, "string");
  assert.equal(typeof en.seo.businessTitle, "string");
  assert.equal(typeof en.seo.businessDesc, "string");
  assert.deepEqual(objectShape(nl.businessPage), objectShape(en.businessPage));
  assert.match(nl.seo.businessTitle, /Zakelijk vervoer/);
  assert.match(en.seo.businessTitle, /Business transport/);
  assert.match(nl.businessPage.hero.title, /Zakelijk vervoer/);
  assert.match(en.businessPage.hero.title, /Business transport/);
});

test("zakelijk-vervoer beperkt proposities tot aantoonbaar bestaande zakelijke diensten", () => {
  const nlCopy = flattenStrings(nl.businessPage).join("\n");
  const enCopy = flattenStrings(en.businessPage).join("\n");

  assert.match(nlCopy, /Facturatie op rekening/);
  assert.match(nlCopy, /Vaste chauffeur waar afgesproken/);
  assert.match(nlCopy, /ritoverzicht/i);
  assert.match(nlCopy, /airport/i);
  assert.match(nlCopy, /event/i);
  assert.match(enCopy, /Invoiced billing/);
  assert.match(enCopy, /Dedicated driver where agreed/);
  assert.match(enCopy, /journey overview/i);

  for (const copy of [nlCopy, enCopy]) {
    assert.doesNotMatch(copy, /volumekorting|volume discount|\bSLA\b|\b\d+\s*%|binnen 24|within 24|24\/7/i);
  }
});

test("zakelijk-vervoer gebruikt zakelijke formuliercontext en relevante locale-bewuste links", () => {
  const businessHref = "/contact?audience=business&topic=businessTransport#contact-form";
  assert.ok(pageSource.includes(businessHref));
  assert.match(pageSource, /href="\/boeken"/);
  assert.match(pageSource, /href="\/diensten"/);
  assert.ok(contactPageSource.includes("contactPrefill(await searchParams)"));
  assert.match(contactPageSource, /initialAudience=\{prefill\.audience\}/);
  assert.match(contactFormSource, /id="contact-form"/);
  assert.match(contactFormSource, /initialAudience = "private"/);
  assert.match(contactFormSource, /initialTopic = ""/);

  assert.match(homepageSource, /padZakelijk"\), href: "\/zakelijk-vervoer"/);
  assert.match(servicesSource, /n: 2, href: "\/zakelijk-vervoer"/);
  assert.equal((footerSource.match(/href="\/zakelijk-vervoer"/g) ?? []).length, 2);
  assert.match(sitemapSource, /"\/zakelijk-vervoer"/);
});

test("zakelijk-vervoer levert veilige Service-, breadcrumb- en FAQ-structured data", () => {
  assert.match(pageSource, /"@type": "Service"/);
  assert.match(pageSource, /"@type": "BusinessAudience"/);
  assert.match(pageSource, /"@type": "BreadcrumbList"/);
  assert.match(pageSource, /"@type": "FAQPage"/);
  assert.match(pageSource, /localeUrl\(locale, "\/zakelijk-vervoer"\)/);
  assert.match(pageSource, /JSON\.stringify\(structuredData\)\.replace\(\/<\/g, "\\\\u003c"\)/);
});

test("zakelijke hero is direct zichtbaar en gebruikt een prioriteitsafbeelding", () => {
  const heroStart = pageSource.indexOf("business-hero-title");
  const heroEnd = pageSource.indexOf("business-use-cases-title");
  const heroSource = pageSource.slice(heroStart, heroEnd);
  assert.ok(heroStart >= 0 && heroEnd > heroStart);
  assert.doesNotMatch(heroSource, /<ScrollReveal/);
  assert.match(heroSource, /<Image[\s\S]*?priority/);
});

test("zakelijke genummerde onderdelen hebben voldoende contrast en geldige lijstsemantiek", () => {
  assert.match(pageSource, /aria-hidden="true"[\s\S]*?text-white\/65/);
  assert.doesNotMatch(pageSource, /text-white\/35/);
  assert.match(pageSource, /<ol[^>]*>[\s\S]*?\{process\.map\([\s\S]*?=> \(\s*<li key=\{step\.title\}/);
  assert.doesNotMatch(pageSource, /<ol[^>]*>[\s\S]*?\{process\.map\([\s\S]*?=> \(\s*<ScrollReveal key=/);
  assert.match(pageSource, /text-secondary">\s*\{String\(index \+ 1\)\.padStart\(2, "0"\)\}/);
});
