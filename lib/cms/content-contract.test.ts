import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  cleanCmsOptionalText,
  isSafeCmsInternalHref,
  safeCmsInternalHref,
} from "./safe-content";

const queries = readFileSync("sanity/queries/content.ts", "utf8");
const contentLoader = readFileSync("sanity/lib/content.ts", "utf8");
const liveConfig = readFileSync("sanity/lib/live.ts", "utf8");
const clientConfig = readFileSync("sanity/lib/client.ts", "utf8");
const cliConfig = readFileSync("sanity.cli.ts", "utf8");
const draftRoute = readFileSync("app/api/draft-mode/enable/route.ts", "utf8");
const seed = readFileSync("scripts/seed-sanity-content.ts", "utf8");
const editorialImageSchema = readFileSync(
  "sanity/schemaTypes/objects/editorialImage.ts",
  "utf8",
);
const applicationTypes = readFileSync("sanity/types.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

test("queries gebruiken de vaste gelokaliseerde singleton-ID's", () => {
  assert.match(queries, /_id == "servicesPage-" \+ \$locale/);
  assert.match(queries, /_id == "fleetPage-" \+ \$locale/);
  assert.doesNotMatch(queries, /_type == "servicesPage" && language == \$locale/);
  assert.doesNotMatch(queries, /_type == "fleetPage" && language == \$locale/);
});

test("fleet-query vraagt beeldmetadata voor hotspots, LQIP en afmetingen op", () => {
  assert.match(queries, /crop,/);
  assert.match(queries, /hotspot,/);
  assert.match(queries, /lqip,/);
  assert.match(queries, /dimensions\{width, height\}/);
});

test("alleen volledig geldige CMS-pagina's vervangen de codefallback", () => {
  assert.match(
    contentLoader,
    /return validServicesPage\(data, selectedLocale\) \? data : null/,
  );
  assert.match(
    contentLoader,
    /return validFleetPage\(data, selectedLocale\) \? data : null/,
  );
  assert.match(contentLoader, /hasExactFieldValues\(page\.services/);
  assert.match(contentLoader, /hasExactFieldValues\(page\.assurances/);
  assert.match(contentLoader, /uniqueObjectField\(page\.vehicles, "modelName"\)/);
  assert.match(contentLoader, /isSafeCmsInternalHref\(action\.href\)/);
  assert.match(contentLoader, /catch \{/);
  assert.doesNotMatch(contentLoader, /console\.(?:warn|error)\([^\n]*error/);
});

test("een trage of onbereikbare CMS-call valt snel en zonder retries terug", () => {
  assert.match(clientConfig, /timeout: 3_000/);
  assert.match(clientConfig, /maxRetries: 0/);
});

test("preview-token blijft uitsluitend server-side", () => {
  assert.match(liveConfig, /from "next-sanity\/live"/);
  assert.match(liveConfig, /serverToken: readToken/);
  assert.match(liveConfig, /browserToken: false/);
  assert.match(liveConfig, /strict: false/);
  assert.doesNotMatch(liveConfig, /NEXT_PUBLIC_SANITY_API_READ_TOKEN/);
  assert.match(draftRoute, /SANITY_API_READ_TOKEN/);
  assert.match(draftRoute, /status: 503/);
});

test("eerste contentimport is create-only en weigert bestaande singletons", () => {
  assert.match(seed, /if \(existing\.length > 0\)/);
  assert.match(seed, /`drafts\.\$\{id\}`/);
  assert.match(seed, /transaction\.create\(document\)/);
  assert.doesNotMatch(seed, /createOrReplace|delete\(/);
  assert.match(seed, /_type: "editorialImage"/);
  assert.match(seed, /satisfies SeedDocument<ServicesPage>\[\]/);
  assert.match(seed, /satisfies SeedDocument<FleetPage>\[\]/);
  assert.doesNotMatch(seed, /unknown as/);
});

test("een optionele SEO-deelafbeelding maakt niet ieder beeld verplicht", () => {
  assert.match(editorialImageSchema, /validation: \(rule\) => rule\.assetRequired\(\)/);
  assert.doesNotMatch(
    editorialImageSchema,
    /validation: \(rule\) => rule\.required\(\)\.assetRequired\(\)/,
  );
});

test("applicatietypen zijn afgeleid van de gegenereerde TypeGen-queryresultaten", () => {
  assert.match(applicationTypes, /FLEET_PAGE_QUERY_RESULT/);
  assert.match(applicationTypes, /SERVICES_PAGE_QUERY_RESULT/);
  assert.doesNotMatch(applicationTypes, /interface Cms/);
});

test("CMS-links en attribuuttekst worden centraal opgeschoond", () => {
  assert.equal(isSafeCmsInternalHref("/boeken?bron=cms#rit"), true);
  assert.equal(isSafeCmsInternalHref("https://example.com"), false);
  assert.equal(isSafeCmsInternalHref("//example.com"), false);
  assert.equal(isSafeCmsInternalHref("/boeken\\kwaad"), false);
  assert.equal(safeCmsInternalHref("/boeken?bron=cms#rit"), "/boeken?bron=cms#rit");
  assert.equal(safeCmsInternalHref("https://example.com"), "/contact");
  assert.equal(safeCmsInternalHref("//example.com"), "/contact");
  assert.equal(safeCmsInternalHref("/boeken\\kwaad"), "/contact");
  assert.equal(cleanCmsOptionalText("  Boek uw rit  "), "Boek uw rit");
  assert.equal(cleanCmsOptionalText(null), undefined);
});

test("TypeGen gebruikt hetzelfde gegenereerde schema als de repository", () => {
  assert.equal(
    packageJson.scripts.typegen,
    "sanity schema extract --path=sanity/generated/schema.json --enforce-required-fields --force && sanity typegen generate",
  );
  assert.match(cliConfig, /typegen: \{/);
  assert.match(cliConfig, /path: "\.\/sanity\/\*\*\/\*\.\{ts,tsx,js,jsx\}"/);
  assert.match(cliConfig, /schema: "\.\/sanity\/generated\/schema\.json"/);
  assert.match(cliConfig, /generates: "\.\/sanity\/generated\/types\.ts"/);
  assert.equal(existsSync("sanity-typegen.json"), false);
  assert.equal(
    packageJson.scripts["cms:seed"],
    "sanity exec scripts/seed-sanity-content.ts --with-user-token --",
  );
});
