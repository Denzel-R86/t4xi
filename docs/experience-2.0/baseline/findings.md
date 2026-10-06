# Experience 2.0 — Baseline findings (Fase 0)

Stand 06-10-2026, basis `origin/main` @ 6f9bc52. Regel §11: baseline-PR's repareren
geen productgedrag. Elke finding hieronder wordt apart opgelost ná de Baseline Gate,
of bewust ondergebracht in een fase. Bewijs staat in het genoemde rapport.

Ernst: **H** hoog · **M** middel · **L** laag · **i** informatief.

## Conversie en meting

| # | Ernst | Finding | Bron | Voorstel |
|---|---|---|---|---|
| F-01 | H | Sinds 02-08 geen echte boeking; 707 quotes, 3 niet-test-bookings, 1 betaald. 0 bookings gekoppeld aan een quote via `quote_id`: de quote-lock-funnel is nooit door een echte klant doorlopen. | 0.4a | Los van design onderzoeken (afhaakpunt na prijs vs. intern verkeer); conversie-baseline is in de praktijk nul. |
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
| F-09 | M | De >10%-regressiegate (§10) werkt niet met een mediaan van 5 runs bij deze spreiding; velddata (p75, INP) ontbreekt (PSI 429, CrUX 403 zonder key). | 0.1 cwv | §10 aanpassen: meer runs of PSI-key / RUM via B8. |
| F-10 | L | Meetscript legt het LCP-element niet vast (Lighthouse 13-pad). | 0.1 cwv | Script corrigeren. |

## Toegankelijkheid

| # | Ernst | Finding | Bron | Voorstel |
|---|---|---|---|---|
| F-11 | H | Token `text-stone` (#999694 op #F5F3F1) = 2,65:1; serious op `/boeken` (pills, `BookingSection.tsx:552`) en `/tarieven` (hero-kop, `tarieven/page.tsx:115`). 138 gebruiken in 40 bestanden. | 0.1 axe | Tokenfix in Fase 1 (bv. `stone.text` #5F666D ≈ 5,3:1), niet per plek. |
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

## Baseline Gate (§11)

| Onderdeel | Status |
|---|---|
| CWV | ✓ lab-nulmeting (`0.1-cwv.md`); velddata ontbreekt (F-09) |
| axe | ✓ `0.1-axe.md` |
| SEO snapshot | ✓ test + CI-stap (`0.2-seo.md`) |
| visual snapshots | ◐ harness + CI-job klaar; Linux-baselines nog te genereren via de workflow na push (`0.3-visual.md`) |
| server measurement | ✓ `0.4a-server-truth.md` |
