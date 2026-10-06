# H-2 — Diagnose `/boeken` mobiel (F-07)

Datum 06-10-2026. Gemeten volgens `measurement-protocol.md`: Lighthouse 13.5.0, 15 runs per
cel, varianten geïnterleaved, load1 ≤ 4 en geen build van een andere agent tijdens de runs,
0 runs uitgesloten. Alleen GET's op `https://www.t4xi.nl`. Ruwe data staat in
`perf/h2-diag-*/runs.json` en de samenvattingen in `perf/h2-diag-*/summary.md`.

## Conclusie

1. **De bimodaliteit is waarschijnlijk een artefact van lantern (`simulate`) in headless
   Chrome.** Dat het geen gebruikersprobleem is, is daarmee níét bewezen: velddata ontbreekt
   en de oorzaak van de late paint in Chrome is niet vastgesteld. Met echte throttling (`devtools`, dezelfde
   4G- en 4×-CPU-waarden) is `/boeken` mobiel **unimodaal**: LCP mediaan **2,20 s**, p75
   **2,26 s**, IQR 0,10 s. Dat valt binnen het budget van 2,5 s. LCP = FCP, en het
   LCP-element is de tekst `main#content > section > div > p.mt-4` ("Vaste prijs vooraf…").
2. **Mechanisme.** In de ongethrottelde observatierun presenteert headless Chrome soms geen
   frame tot **~2,54 s** (een vaste waarde: 2 530–2 553 ms). De main thread is in dat venster
   idle: geen long task, CSS klaar op ~0,52 s, fonts op ~0,41 s. Zonder die hapering ligt de
   waargenomen FCP op 0,43–0,54 s. Lantern trekt vervolgens alle netwerk- en CPU-werk dat
   vóór die late paint klaar was mee in de gesimuleerde FCP/LCP-graaf. Op `/boeken` is dat
   veel: Stripe.js (271 kB) en de booking-JS. Daarom springt de gesimuleerde LCP daar naar
   5–6,5 s.
3. **Stripe veroorzaakt de modus niet, maar vergroot hem wel.** Met Stripe geblokkeerd
   blijft de late paint optreden (5/15), maar valt de trage modus terug van ~6,4 s naar
   ~3,6 s. Met echte throttling maakt Stripe voor LCP **geen verschil** (ratio p75 1,00,
   BI 0,95–1,06). Wel kost Stripe **~100 ms TBT** (121 → 22 ms mediaan).

## Bewijs

| Meting (mobiel, n = 15/cel) | LCP mediaan | LCP p75 | Modi LCP | FCP mediaan | TBT |
|---|---|---|---|---|---|
| A. simulate, productie | 2,83 s | 4,51 s | 11× ~2,82 / 4× ~6,38 s | 1,12 s | 65 ms |
| A. simulate, Stripe geblokkeerd | 2,84 s | 3,58 s | 8× ~2,8 / 7× ~3,4–3,6 s (sprong onder de detectiedrempel) | 1,11 s | 12 ms |
| B. simulate, productie (2e sessie) | 5,11 s | 5,73 s | 6× ~2,83 / 9× ~5,39 s | 1,24 s | 106 ms |
| B. simulate, alle JS geblokkeerd | 1,82 s | 2,40 s | 10× ~1,76 / 5× ~2,42 s | 1,09 s | 0 ms |
| B. `/tarieven` simulate, controle | 2,85 s | 2,90 s | unimodaal | 1,16 s | 30 ms |
| C. **devtools**, productie | **2,20 s** | **2,26 s** | unimodaal | 2,20 s | 121 ms |
| C. **devtools**, Stripe geblokkeerd | 2,18 s | 2,25 s | unimodaal | 2,18 s | 22 ms |

A = `perf/h2-diag-stripe-ab`, B = `perf/h2-diag-js-ab`, C = `perf/h2-diag-stripe-devtools`.

- **Waargenomen FCP** (uit de trace, per run in `runs.json` → `observed.fcpMs`):
  - productie: 0,43–0,51 s, of 2,536–2,550 s;
  - Stripe geblokkeerd: idem (5/15 rond 2,54 s);
  - zonder JS: ook clusters rond 1,5 en 2,5 s, maar daar hangt in de simulatie bijna niets
    aan. De hapering zit dus in de headless renderpipeline en wordt niet door de app-JS
    veroorzaakt.
  - De verschillen tussen sessies (A 4/15 traag, B 9/15) volgen het aandeel haperingen in
    die sessie. Precies daarom gaf de mediaan van 5 runs geen bruikbaar signaal (F-09).
- **Trace van een trage run** (`zonder-stripe` #4; ruwe trace niet gecommit, 6 MB):
  - document geladen op 631 ms;
  - daarna geen `BeginMainThreadFrame` tot 1 470 ms, en opnieuw pas vanaf 2 487 ms;
  - eerste `Screenshot`-event (gepresenteerd frame) op 2 551 ms;
  - de renderer-compositor meldt in dat venster alleen `STATE_DROPPED`/`BACKFILL`-frames.
  - Andere oorzaken zijn uitgesloten: render-blocking (1 CSS-bestand, 12 kB, klaar),
    font-display (`swap`, preload via de `Link`-header, klaar vóór de CSS), hydration (de
    main thread is na 0,66 s stil), `next/script` (alleen het inline `js-detect`-script),
    afbeeldingen (geen; LCP is tekst), Suspense/streaming (geen pending boundaries in de
    HTML).
- **Stripe-bron:** `lib/payments/stripe-client.ts:1` importeert `loadStripe` uit
  `@stripe/stripe-js`. Die entry injecteert `js.stripe.com/dahlia/stripe.js` als
  side-effect bij module-evaluatie (`dist/index.mjs`, `Promise.resolve().then(getStripePromise)`).
  `PaymentStep` wordt statisch geïmporteerd in `components/booking/BookingSection.tsx:8`.
  Stripe.js laadt dus op elke `/boeken`-pageview, ook als de betaalstap nooit verschijnt
  (1 third party, 271 kB, ~50 ms main-thread).

## Besluit: geen productcode-fix in H-2

Er is geen bewezen LCP-oorzaak in de pagina gevonden die een fix rechtvaardigt. Met echte
throttling ligt de lab-p75 op 2,26 s. Dit is een labresultaat, geen veld-p75 (§10 blijft
formeel open tot er velddata is).

**Besluit eigenaar (07-10-2026):** Stripe.js-laadmoment blijft ongewijzigd; er is geen
aangetoonde noodzaak voor deze productwijziging.

**Voorstel (niet uitgevoerd, besluit nodig):** laad Stripe.js pas bij de betaalstap, via
`next/dynamic` voor `PaymentStep` of via `@stripe/stripe-js/pure` in `stripe-client.ts`.
- Opbrengst: ~100 ms minder TBT (INP-proxy) en 271 kB minder op `/boeken`. LCP verandert
  niet.
- Waarom niet zelf gedaan: dit raakt het betaalpad. Stripe adviseert Stripe.js vroeg te
  laden voor fraudesignalen (Radar). Een later laadmoment is dus een risico- en
  productbesluit, geen pure performancekeuze. Het valt binnen "twijfel = niet fixen".

## Gevolgen voor protocol en baseline

- F-07 krijgt een **aanvullend** labresultaat: 2,20 s mediaan / 2,26 s p75 (devtools-
  throttling, n = 15, dit protocol). De oorspronkelijke meting (LCP mediaan 6,01 s, n = 5,
  `simulate`, Lighthouse 13.5.0) blijft staan met haar methode en de verklaring hierboven.
  Geen van beide is een veld-p75.
- Het protocol (§5, §6) is aangevuld: dezelfde methode voor basis en kandidaat, vooraf
  vastgelegd; voor `/boeken` mobiel worden beide methoden gemeten en gerapporteerd, en een
  niet-significante uitkomst geldt niet als bewijs dat een regressie < 10% is.
