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
import { resolveLocationSlug } from "./location-aliases";

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
