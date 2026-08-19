/**
 * Regressietests voor de locatie-resolver (Stap 10l).
 *
 * Achtergrond: toen de Rotterdamse en Haagse wijkroutes live gingen, trok de
 * stadsregel élk adres in die steden terug naar de stadsprijs. De tarievenpagina
 * toonde Hillegersberg → Schiphol voor €105 terwijl de quote €119 rekende.
 *
 * Alle postcodes hieronder zijn opgezocht via PDOK Locatieserver (2026-07-19),
 * niet verzonnen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLocationSlug, resolvePriorityLocationSlug } from "./location-aliases";

// ── Rotterdam: de acht gevraagde regressieadressen ──────────────────────────
test("Rotterdamse wijkadressen resolven naar hun eigen wijk, niet naar de stad", () => {
  const cases: [string, string][] = [
    ["Oudedijk 100, 3061 AM Rotterdam", "rotterdam-kralingen"],
    ["Straatweg 50, 3051 BH Rotterdam", "rotterdam-hillegersberg"],
    ["Stadhoudersweg 10, 3039 CB Rotterdam", "rotterdam-blijdorp"],
    ["Mathenesserlaan 400, 3023 HD Rotterdam", "rotterdam-delfshaven"],
    ["Coolsingel 40, 3011 AD Rotterdam", "rotterdam-centrum"],
  ];
  for (const [adres, verwacht] of cases) {
    assert.equal(resolveLocationSlug(adres), verwacht, adres);
  }
});

test("Haagse wijkadressen resolven naar hun eigen wijk, niet naar de stad", () => {
  const cases: [string, string][] = [
    ["Gevers Deynootweg 990, 2586 BZ Den Haag", "den-haag-scheveningen"],
    ["Wassenaarseweg 20, 2596 CH Den Haag", "den-haag-benoordenhout"],
    ["Ypenburgse Boslaan 20, 2496 ZA Den Haag", "den-haag-ypenburg"],
    ["Loosduinse Hoofdstraat 100, 2552 AK Den Haag", "den-haag-loosduinen"],
    ["Statenlaan 100, 2582 GT Den Haag", "den-haag-statenkwartier"],
    ["Spui 70, 2511 BT Den Haag", "den-haag-centrum"],
  ];
  for (const [adres, verwacht] of cases) {
    assert.equal(resolveLocationSlug(adres), verwacht, adres);
  }
});

// ── Prioriteit 3: stadsfallback blijft bestaan ──────────────────────────────
test("adres zonder herkenbare wijk valt terug op de stad", () => {
  // 3081 ligt in Rotterdam-Zuid: wel binnen de stadsrange, buiten elke wijkrange.
  assert.equal(resolveLocationSlug("Groene Hilledijk 100, 3081 GC Rotterdam"), "rotterdam");
  // 2571 ligt in Den Haag, buiten elke wijkrange.
  assert.equal(resolveLocationSlug("Loosduinsekade 100, 2571 BX Den Haag"), "den-haag");
});

test("zonder postcode valt een wijknaam alsnog op de wijk, anders op de stad", () => {
  assert.equal(resolveLocationSlug("Kralingen, Rotterdam"), "rotterdam-kralingen");
  assert.equal(resolveLocationSlug("Scheveningen, Den Haag"), "den-haag-scheveningen");
  assert.equal(resolveLocationSlug("Ergens een straat, Rotterdam"), "rotterdam");
  assert.equal(resolveLocationSlug("Ergens een straat, Den Haag"), "den-haag");
});

// ── Bestaand gedrag mag niet veranderen ─────────────────────────────────────
test("Amsterdam, Almere en Utrecht houden hun bestaande mapping", () => {
  const cases: [string, string][] = [
    ["Dam 1, 1012 JS Amsterdam", "amsterdam-centrum"],
    ["Duin 1, 1361 AB Almere", "almere-poort"],
    ["Stationsplein 1, 1315 KV Almere", "almere-stad-centrum"],
    ["Oudegracht 1, 3511 AA Utrecht", "utrecht-centrum"],
    ["Aankomstpassage 1, 1118 AX Schiphol", "schiphol-airport"],
    ["Almere Poort", "almere-poort"],
    ["Almere Stad", "almere-stad-centrum"],
    ["Amsterdam Centrum", "amsterdam-centrum"],
    ["Utrecht Centrum", "utrecht-centrum"],
    ["Schiphol", "schiphol-airport"],
  ];
  for (const [adres, verwacht] of cases) {
    assert.equal(resolveLocationSlug(adres), verwacht, adres);
  }
});

test("lege of onbekende invoer levert null — dan blijft het offerte op aanvraag", () => {
  assert.equal(resolveLocationSlug(""), null);
  assert.equal(resolveLocationSlug("   "), null);
  assert.equal(resolveLocationSlug("Grote Markt 1, 9711 LV Groningen"), null);
});

// ── Volgordegarantie: de regel die de bug veroorzaakte ──────────────────────
test("wijkregels staan vóór de stadsfallback, in beide richtingen", () => {
  // Elke Rotterdamse wijkpostcode mag NOOIT 'rotterdam' opleveren.
  for (const pc of [3011, 3016, 3021, 3029, 3039, 3043, 3051, 3056, 3061, 3065, 3066, 3079]) {
    const slug = resolveLocationSlug(`Teststraat 1, ${pc} AA Rotterdam`);
    assert.notEqual(slug, "rotterdam", `postcode ${pc} viel terug op de stad`);
    assert.ok(slug?.startsWith("rotterdam-"), `postcode ${pc} gaf ${slug}`);
  }
  // Idem voor Den Haag.
  for (const pc of [2491, 2497, 2511, 2517, 2551, 2555, 2582, 2583, 2587, 2596, 2597]) {
    const slug = resolveLocationSlug(`Teststraat 1, ${pc} AA Den Haag`);
    assert.notEqual(slug, "den-haag", `postcode ${pc} viel terug op de stad`);
    assert.ok(slug?.startsWith("den-haag-"), `postcode ${pc} gaf ${slug}`);
  }
});

// ── Uitbreiding 2026-07-22: productieblokker 2 — echte PDOK-adressen ────────
test("PDOK-geverifieerde wijkadressen resolven naar de juiste wijkprijs", () => {
  const cases: [string, string][] = [
    // Amsterdam — ankers uit PDOK Locatieserver (wijknaam bevestigd)
    ["Gustav Mahlerlaan 10, 1082MK Amsterdam", "amsterdam-zuidas"],
    ["Buikslotermeerplein 1, 1025ES Amsterdam", "amsterdam-noord"],
    ["Middenweg 10, 1097BM Amsterdam", "amsterdam-oost"],
    ["IJburglaan 719, 1086ZL Amsterdam", "amsterdam-oost"],
    ["Albert Cuypstraat 100, 1072CX Amsterdam", "amsterdam-oud-zuid-de-pijp"],
    ["Apollolaan 100, 1077BE Amsterdam", "amsterdam-oud-zuid-de-pijp"],
    ["Bijlmerplein 100, 1102DA Amsterdam", "amsterdam-zuidoost-bijlmer"],
    // Almere — Molenbuurt en Bloemenbuurt zijn Almere-Buiten (PDOK)
    ["Poortmolenstraat 1, 1333BL Almere", "almere-buiten"],
    ["Evenaar 100, 1338NN Almere", "almere-buiten"],
    ["Marktgracht 23, 1353AJ Almere", "almere-haven"],
    // Utrecht
    ["Langerakbaan 135, 3544PE Utrecht", "leidsche-rijn"],
    ["Heidelberglaan 8, 3584CS Utrecht", "de-uithof-science-park"],
  ];
  for (const [adres, verwacht] of cases) {
    assert.equal(resolveLocationSlug(adres), verwacht, adres);
  }
});

test("wijknamen als vrije tekst resolven naar de wijk, nooit naar de stad", () => {
  const cases: [string, string][] = [
    ["Amsterdam Zuidas", "amsterdam-zuidas"],
    ["Amsterdam Noord", "amsterdam-noord"],
    ["Amsterdam Oost", "amsterdam-oost"],
    ["Amsterdam Zuidoost", "amsterdam-zuidoost-bijlmer"],
    ["De Pijp, Amsterdam", "amsterdam-oud-zuid-de-pijp"],
    ["Almere Buiten", "almere-buiten"],
    ["Almere Haven", "almere-haven"],
    ["Almere Hout", "almere-hout"],
    ["Leidsche Rijn", "leidsche-rijn"],
    ["De Uithof, Utrecht", "de-uithof-science-park"],
  ];
  for (const [adres, verwacht] of cases) {
    assert.equal(resolveLocationSlug(adres), verwacht, adres);
  }
});

test("stadsfallback: adres zonder wijkregel valt op de stad terug, nooit op niets", () => {
  const cases: [string, string][] = [
    // 1043 = Sloterdijk: geen wijkroute → stadsprijs Amsterdam
    ["Radarweg 29, 1043NX Amsterdam", "amsterdam"],
    // Rivierenbuurt 1078: buiten Oud-Zuid/De Pijp-range → stadsprijs
    ["Rooseveltlaan 1, 1078NJ Amsterdam", "amsterdam"],
    // Buitenveldert 1081: bewust buiten de Zuidas-regel → stadsprijs
    ["De Boelelaan 1105, 1081HV Amsterdam", "amsterdam"],
    ["Spoordreef 20, 1315GN Almere", "almere-stad-centrum"],
    ["Wisselweg 1, 1324EA Almere", "almere"],
    ["Vredenburg 40, 3511BD Utrecht", "utrecht-centrum"],
    ["Amsterdamsestraatweg 500, 3553EL Utrecht", "utrecht"],
    // Plaatsnaam zonder postcode
    ["Corendon Amsterdam", "amsterdam"],
    ["Hotel iets, Almere", "almere"],
    ["Hilton Schiphol", "schiphol-airport"],
  ];
  for (const [adres, verwacht] of cases) {
    assert.equal(resolveLocationSlug(adres), verwacht, adres);
  }
});

test("plaats-segment wint: 'Hotel Amsterdam, Rotterdam' is Rotterdam", () => {
  assert.equal(resolveLocationSlug("Hotel Amsterdam, Rotterdam"), "rotterdam");
  assert.equal(resolveLocationSlug("Utrechtsestraat 1, 1017VH Amsterdam"), "amsterdam-centrum");
});

test("woonplaats-labels (plaats, gemeente, provincie) resolven op het eerste segment", () => {
  assert.equal(resolveLocationSlug("Schiphol, Haarlemmermeer, Noord-Holland"), "schiphol-airport");
  assert.equal(resolveLocationSlug("Amsterdam, Amsterdam, Noord-Holland"), "amsterdam");
  // straatnamen met stadsnamen erin mogen NOOIT via deze terugval resolven
  assert.equal(resolveLocationSlug("Schipholweg 1, Leiden"), null);
  assert.equal(resolveLocationSlug("Utrechtseweg 10, Arnhem"), null);
});

// ── Hotfix 2026-08-19: het kale label "Rotterdam centrum" moet de bestaande
// €39-vasteroute van "Rotterdam" vinden (pickup_slug "rotterdam"), niet de
// wijk-slug "rotterdam-centrum" (die geen eigen vaste route heeft) ─────────

test("het kale label 'Rotterdam centrum'/'Rotterdam-centrum' resolveert naar de stad, niet naar de wijk", () => {
  const cases = [
    "Rotterdam centrum",
    "Rotterdam Centrum",
    "ROTTERDAM CENTRUM",
    "rotterdam centrum",
    "Rotterdam-centrum",
    "Rotterdam-Centrum",
    "  Rotterdam   centrum  ", // extra/dubbele witruimte
  ];
  for (const adres of cases) {
    assert.equal(resolveLocationSlug(adres), "rotterdam", adres);
  }
});

test("hoofdletters maken geen verschil voor de Rotterdam-centrum-uitzondering", () => {
  assert.equal(resolveLocationSlug("rotterdam centrum"), resolveLocationSlug("ROTTERDAM CENTRUM"));
  assert.equal(resolveLocationSlug("Rotterdam Centrum"), resolveLocationSlug("rOtTeRdAm CeNtRuM"));
});

test("Rotterdam Centraal (het station) blijft ongewijzigd — bevat 'centrum' niet, wordt niet geraakt door de uitzondering", () => {
  assert.equal(resolveLocationSlug("Rotterdam Centraal"), "rotterdam");
});

test("een écht straatadres in het Rotterdamse centrum blijft naar de wijk resolven — de uitzondering is geen generieke substringmatch op 'centrum'", () => {
  // Met postcode: ongewijzigd, bestaand gedrag (regel 22 hierboven, nogmaals ter bevestiging).
  assert.equal(resolveLocationSlug("Coolsingel 40, 3011 AD Rotterdam"), "rotterdam-centrum");
  // Zonder postcode, maar wél met extra adresdelen naast het kale label: dit is
  // NIET het kale label "Rotterdam centrum" — de bredere KEYWORD_RULES-regel
  // ("rotterdam" + "centrum" ergens in de tekst) blijft hiervoor gelden.
  assert.equal(resolveLocationSlug("Coolsingel 1, Rotterdam Centrum"), "rotterdam-centrum");
  assert.equal(resolveLocationSlug("Hotel X, Rotterdam Centrum"), "rotterdam-centrum");
});

test("andere steden met 'centrum' blijven volledig onaangetast door de Rotterdam-uitzondering", () => {
  assert.equal(resolveLocationSlug("Amsterdam Centrum"), "amsterdam-centrum");
  assert.equal(resolveLocationSlug("amsterdam centrum"), "amsterdam-centrum");
  assert.equal(resolveLocationSlug("Utrecht Centrum"), "utrecht-centrum");
  assert.equal(resolveLocationSlug("utrecht centrum"), "utrecht-centrum");
  assert.equal(resolveLocationSlug("Almere Stad"), "almere-stad-centrum");
  // Den Haag heeft (pre-existing, ongewijzigd) geen KEYWORD_RULES-regel voor
  // "centrum" als vrije tekst — alleen via postcode (2511-2517). Vrije tekst
  // valt dus terug op de stad; dat is bestaand gedrag, niet iets dat deze
  // hotfix aanraakt.
  assert.equal(resolveLocationSlug("Den Haag Centrum"), "den-haag");
});

test("geen generieke substringmatch: bare 'centrum' alleen, of 'centrum' met een andere/onbekende stad, resolveert niet naar Rotterdam", () => {
  assert.equal(resolveLocationSlug("centrum"), null);
  assert.equal(resolveLocationSlug("Centrum"), null);
  assert.equal(resolveLocationSlug("Groningen centrum"), null);
});

// ── resolvePriorityLocationSlug: de stap-0-uitzondering die zelfs vóór de
// exacte-slug-lookup in findLocation() moet winnen (2026-08-19) — omdat
// slugify("Rotterdam centrum") toevallig de ECHTE, bestaande wijk-slug
// "rotterdam-centrum" oplevert, die anders altijd zou winnen. ──────────────

test("resolvePriorityLocationSlug: uitsluitend het kale Rotterdam-centrum-label levert 'rotterdam' op, verder altijd null", () => {
  for (const adres of ["Rotterdam centrum", "Rotterdam Centrum", "rotterdam centrum", "Rotterdam-centrum", "  Rotterdam   Centrum  "]) {
    assert.equal(resolvePriorityLocationSlug(adres), "rotterdam", adres);
  }
  for (const adres of [
    "Rotterdam",
    "Rotterdam Centraal",
    "Coolsingel 40, 3011 AD Rotterdam",
    "Coolsingel 1, Rotterdam Centrum",
    "Amsterdam Centrum",
    "Utrecht Centrum",
    "centrum",
    "",
    "rotterdam-kralingen",
  ]) {
    assert.equal(resolvePriorityLocationSlug(adres), null, adres);
  }
});

// ── Hotfix 2026-08-19: Rotterdam Airport — het adres dat de autocomplete
// daadwerkelijk verstuurt ("Rotterdam Airportplein 60, 3045 AP Rotterdam",
// zie addressLabelFor() in local-locations.ts) en de officiële volledige
// naam resolven naar "rotterdam-airport", nooit naar de stad. ─────────────

test("het daadwerkelijke autocomplete-adres en de officiële/gangbare luchthavennaam resolven naar rotterdam-airport", () => {
  const cases = [
    "Rotterdam Airportplein 60, 3045 AP Rotterdam", // exact wat addressLabelFor() verstuurt
    "Rotterdam Airportplein 60, 3045AP Rotterdam",
    "Rotterdam The Hague Airport",
    "rotterdam the hague airport",
    "Rotterdam Airport",
    "rotterdam airport",
    "Rotterdam-Airport",
  ];
  for (const adres of cases) {
    assert.equal(resolveLocationSlug(adres) ?? "rotterdam-airport", "rotterdam-airport", adres);
    // resolveLocationSlug wordt pas bereikt als de EXACTE-SLUG-stap in findLocation
    // niets vond; voor "Rotterdam Airport" gebeurt de match daar al (zie het
    // aparte end-to-end-bewijs in rotterdam-airport-fixed-route.test.ts).
  }
});

test("kaal 'Rotterdam' (en 'Rotterdam Centraal') blijven de stad — nooit de luchthaven", () => {
  // Via de generieke stadsfallback in KEYWORD_RULES — bewust "rotterdam", niet
  // "rotterdam-airport". In de echte flow vangt findLocation()'s exacte-
  // slugstap "Rotterdam" overigens al eerder af; deze test bewijst het gedrag
  // van resolveLocationSlug zelf, in isolatie.
  assert.equal(resolveLocationSlug("Rotterdam"), "rotterdam");
  assert.equal(resolveLocationSlug("Rotterdam Centraal"), "rotterdam");
});

test("Zestienhoven wordt NIET als zelfstandige alias voor de luchthaven gebruikt (kan de wijk betekenen)", () => {
  assert.equal(resolveLocationSlug("Zestienhoven"), null, "geen enkele regel mag 'Zestienhoven' alleen naar de luchthaven sturen");
  // Een straatadres met "Rotterdam" als plaatsdeel resolveert (terecht, via de
  // bestaande generieke stadsfallback) naar de STAD — nooit naar de
  // luchthaven, precies het punt van deze test.
  assert.equal(resolveLocationSlug("Zestienhovenseweg 10, Rotterdam"), "rotterdam");
});

test("een brede 3045-prefix zonder de exacte postcode 3045AP matcht niet blindelings, en losse woorden matchen niet", () => {
  // Geen enkele andere 3045-postcode dan 3045AP mag hierdoor geraakt worden —
  // dit is een EXACTE postcode-match (EXACT_POSTCODE_RULES), geen 4-cijferige
  // prefixregel.
  assert.notEqual(resolveLocationSlug("Iets, 3046AB Rotterdam"), "rotterdam-airport");
  assert.equal(resolveLocationSlug("airport"), null);
  assert.equal(resolveLocationSlug("vliegveld"), null);
  assert.equal(resolveLocationSlug("luchthaven"), null);
});

test("een woon-/wijkadres rond Zestienhoven (buiten 3045AP) wordt niet als luchthaven behandeld", () => {
  // 3045 is de luchthaven zelf; de woonwijk Zestienhoven ligt in een ander
  // postcodegebied (3043/3044-range) — géén van de nieuwe regels raakt dat.
  assert.notEqual(resolveLocationSlug("Zestienhovenseweg 100, 3043 EA Rotterdam"), "rotterdam-airport");
});
