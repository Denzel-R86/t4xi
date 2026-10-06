# Experience 2.0 — Baseline findings (Fase 0)

Stand 06-10-2026, basis `origin/main` @ 6f9bc52. Regel §11: baseline-PR's repareren
geen productgedrag. Elke finding hieronder wordt apart opgelost ná de Baseline Gate,
of bewust ondergebracht in een fase. Bewijs staat in het genoemde rapport.

Ernst: **H** hoog · **M** middel · **L** laag · **i** informatief.

## Conversie en meting

| # | Ernst | Finding | Bron | Voorstel |
|---|---|---|---|---|
| F-01 | H | **Geen aantoonbare voltooide vasteprijsboekingen in de onderzochte dataset.** 707 opgeslagen quotes (390 unieke fingerprints; geen unieke klanten, intern verkeer niet te scheiden), 10 bookings, 0 gekoppeld aan een quote via `quote_id`. Van de 10 bookings zijn er 5 als test gemarkeerd ("test" in naam/e-mail/notities) en 5 **ongeclassificeerd** (waarvan 2 contactgegevens delen met een testboeking). Dat geen klant ooit heeft afgerekend, is daarmee níét bewezen. | 0.4a | Classificatie van de 5 ongeclassificeerde bookings; daarna conversie opnieuw vaststellen. Koppeling zie H-3. |
| F-02 | M | Geen `is_test`-markering op bookings en quotes; testuitsluiting is heuristisch (3 of 5 echte bookings, afhankelijk van de regel). | 0.4a | Testvlag of vaste testcontacten vastleggen. |
| F-03 | M | `track()` heeft geen provider (B8); `boeking_voltooid` en `schiphol_route_klik` worden nergens aangeroepen; alleen `/tarieven` vuurt events. | 0.1 analytics | Onderdeel van 0.4b / B8. |
| F-04 | M | Bookings via `create_booking` (`app/api/bookings/route.ts:371`) krijgen geen `quote_id`; `pricing_quote_logs` heeft geen `quote_id`; geen tijdstempel voor betaalstart; geen surface/locale/sessie-kolom. | 0.1 analytics | Meet-instrumentatie vóór Fase 8. |
| F-05 | L | `logQuote` is fire-and-forget en negeert insertfouten (`lib/pricing/service.ts:1727-1731`). | 0.1 analytics | Fout loggen. |
| F-06 | L | Betaald terwijl status `inquiry` blijft (2×): betaald is niet uit de status af te lezen. | 0.4a | Bij aanvraagstatus §8 meenemen. |

## Performance

| # | Ernst | Finding | Bron | Voorstel |
|---|---|---|---|---|
| F-07 | H | `/boeken` mobiel LCP mediaan 6,01 s (budget 2,5 s), bimodaal: 2 runs ~2,8 s, 3 runs 6,0–6,5 s; vertraging vóór eerste paint, client-side. Zwaarste pagina (720 kB). | 0.1 cwv | Oorzaak onderzoeken vóór Fase 4 (booking). |
| F-08 | M | Alle mobiele budgetpagina's boven LCP 2,5 s (2,61–2,95 s) bij TTFB ≤ 41 ms → laat LCP-element (hero-beeld?). | 0.1 cwv | Meenemen in 1.4 (hero + LCP-meting). |
| F-09 | M | Bij deze spreiding is een mediaan van 5 runs onvoldoende betrouwbaar voor de >10%-regressieregel (§10); velddata (p75, INP) ontbreekt (PSI 429, CrUX 403 zonder key). | 0.1 cwv | Budget en regressieregel blijven. Eerst een reproduceerbaar meetprotocol vastleggen (geïsoleerde runs zonder andere CPU-last, voldoende herhalingen, vaste Lighthouse-versie en throttling). Velddata via PSI-key of RUM (B8) is een aanvulling, geen blokkade. |
| F-10 | L | Meetscript legt het LCP-element niet vast (Lighthouse 13-pad). | 0.1 cwv | Script corrigeren. |

## Toegankelijkheid

| # | Ernst | Finding | Bron | Voorstel |
|---|---|---|---|---|
| F-11 | H | Token `text-stone` (#999694 op #F5F3F1) = 2,65:1; serious op `/boeken` (pills, `BookingSection.tsx:552`) en `/tarieven` (hero-kop, `tarieven/page.tsx:115`). 138 gebruiken in 40 bestanden. | 0.1 axe | Niet blind op alle 138 plekken vervangen. Eerst per toepassing classificeren (tekst, border, decoratie); waar nodig een toegankelijk teksttoken afsplitsen (kandidaat `stone.text` #5F666D ≈ 5,3:1) en alleen teksttoepassingen omzetten. |
| F-12 | M | `label-content-name-mismatch` (Lighthouse) op alle vier pagina's; incomplete color-contrast (46–62 nodes/pagina), aria-prohibited-attr, aria-valid-attr-value. | 0.1 axe/cwv | Handmatig beoordelen. |
| F-13 | M | Boekingsfout: banner altijd met telefoon-icoon, veldfout bovenaan de kaart, veld zelf niet gemarkeerd. "Naam" mist het verplicht-sterretje. | 0.3 | Fase 4 (booking). |

## Mobiele UX (visual)

| # | Ernst | Finding | Bron | Voorstel |
|---|---|---|---|---|
| F-14 | H | Hero 375×812: prijs na invullen onder de vouw (y≈866); StickyCta dekt een deel van de zin. | 0.3 | Fase 2/3 (hero, booking sentence). |
| F-15 | M | Suggestielijst in de hero loopt op 375 buiten de viewport. | 0.3 | Idem. |
| F-16 | M | Eerste suggestie bij "Schiphol" is een straatadres, niet de luchthaven. | 0.3 | Autocomplete-ranking. |
| F-17 | M | RouteFinder toont "Geen adressen gevonden" onder een geaccepteerd en geprijsd adres. | 0.3 | Fase 5 (RouteFinder). |
| F-18 | L | Tijdveld (6ch) kapt een 12-uurstijd af; AddressAutocomplete kan na blur heropenen (alleen in code gezien). | 0.3 | Idem. |

## SEO

| # | Ernst | Finding | Bron | Voorstel |
|---|---|---|---|---|
| F-19 | M | `/diensten`-titel valt stil terug op "Diensten — T4XI" als Sanity uitvalt. | 0.2 | Fallback bewust maken. |
| F-20 | M | EN-h1 op `/en/tarieven` ("Arrive composed…") mist de zoekintentie "taxi fare". | 0.2 | Fase 7. |
| F-21 | L | Homepage-canonical zonder slash, sitemap met; `/nl/*` redirect 307 i.p.v. 308; veel korte generieke titels; geen `<lastmod>`. | 0.2 | Fase 7. |

## Security en data (niet blokkerend voor 2.0)

| # | Ernst | Finding | Bron | Voorstel |
|---|---|---|---|---|
| F-22 | M | Legacy-schuld S8 ongewijzigd na #45/#47; Control-schema niet op productie. `lib/admin/basic-auth.ts` valt terug op `BRAIN_DASHBOARD_*` als `OPS_*` ontbreekt. | S8-audit | Masterplan §9b bijgewerkt; einddatums invullen. |
| F-23 | L | Migratie `20260928120000_pricing_canonical_baseline` (#46) niet in de migratiehistorie van productie (inhoudelijk no-op). | S8-audit | Registreren of bewust documenteren. |
| F-24 | i | ADR-015 bestaat niet als bestand in de repo. | S8-audit | Vastleggen. |
| F-25 | i | Prijsvoorbeeld klopt: Almere Poort → Schiphol €102 (vaste route), 39 km, **38 min** (niet "ca. 40"). | S8-audit | Mockups corrigeren. |

## Herstel-PR's na de Baseline Gate

Elk als afzonderlijke PR, in deze prioriteit:

| # | PR | Findings |
|---|---|---|
| H-1 | Mobiele prijszichtbaarheid + overlappende StickyCta in de hero (375) | F-14, F-15 |
| H-2 | Trage `/boeken` op mobiel: oorzaak vóór eerste paint vinden en oplossen | F-07 (meten volgens het protocol uit F-09) |
| H-3 | Meting: analyticsprovider (B8) en quote–booking-koppeling (`quote_id` op alle boekingspaden, betaalstart-tijdstempel) | F-03, F-04, F-05 |

## Baseline Gate (§11)

| Onderdeel | Status |
|---|---|
| CWV | ✓ lab-nulmeting (`0.1-cwv.md`); velddata ontbreekt (F-09) |
| axe | ✓ `0.1-axe.md` |
| SEO snapshot | ✓ test + CI-stap (`0.2-seo.md`) |
| visual snapshots | ◐ harness + CI-job klaar; Linux-baselines nog te genereren via de workflow na push (`0.3-visual.md`) |

**Fase 0 blijft formeel open** totdat de Linux-snapshots gegenereerd, beoordeeld en in PR 0.3 vastgelegd zijn. Fase 1 start pas daarna.
| server measurement | ✓ `0.4a-server-truth.md` |
