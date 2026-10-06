# T4XI Digital Experience 2.0 — Implementation Masterplan

Status: **GO voor uitvoering (25-09-2026)** — start Fase 0 · 2026-09-25 · basis: `origin/main` @ 5f59837 · afgestemd op T4XI Documentenset v1.0
Doel: de conceptvisie "Arrive composed" vertalen naar uitvoerbare, kleine PR's op de
bestaande Next 16-codebase, zonder pricing-, booking-, betaal-, SEO- of
communicatielogica te breken.

---

## 0. Drie vaststellingen vóór alles

1. **De Journey Line is geen nieuw systeem.** De codebase heeft al de *Horizon Design
   Language v1* (`components/horizon/{motion.tsx,patterns.tsx,horizon.css}`): één easing
   (`--hz-ease: cubic-bezier(.22,1,.36,1)` — exact de curve uit de visie), vijf
   motion-werkwoorden (Reveal/Travel/Guide/Focus/Confirm) en een `HorizonSpine`. 2.0 is
   daarom **Horizon v2**: de horizontale spine wordt een A→B-lijn met begin- en eindpunt.
   Geen tweede motion-systeem naast Horizon.
2. **Twee sporen uit de visie zijn grotendeels al gebouwd.** Pricing security (§25) staat:
   client stuurt alleen ritdata, `/api/pricing/quote` rekent, `quoteId` + 15 min TTL
   (`lib/pricing/snapshot.ts:37`), boeking bindt op de snapshot. Webhooks Stripe en
   Resend verifiëren signatures. Die workstreams zijn **bewijzen + gaten dichten**, geen
   bouw.
3. **Reviews blijven uit** tot er een verifieerbare bron is
   (`components/sections/ReviewsSection.tsx`, `REVIEWS_ENABLED = false`, Omnibus/ACM).
   "4.9 / 5" uit de visie komt pas terug als een GBP-koppeling bestaat.

---

## 0b. Bovenliggende normen — T4XI Documentenset v1.0 (sept. 2026)

De Experience Standard (01) en de Customer Journey & Service Blueprint (03) gaan vóór
de visuele visie. Waar die botsen, wint de norm. Relevant voor 2.0:

| Norm | Bron | Gevolg voor 2.0 |
|---|---|---|
| "Premium = minder onzekerheid, niet méér vertoon" | ES 01, 61 | Motion en beeld zijn ondergeschikt aan duidelijkheid. Test elke sectie op de *Experience Test* (ES 60). |
| Oriëntatie: waarvandaan → waarheen → wanneer → prijs → boeken, "binnen enkele momenten" | ES 05, BP 06 | Hero-volgorde §6 klopt hiermee; niets tussen hero en prijs zetten. |
| Geen functies tonen die nog niet operationeel zijn; iedere websiteclaim gekoppeld aan een capability | ES 05, BP 81–82 | Nieuw: **Claims-check** per copy-PR (zie §0c). |
| Geen kunstmatige urgentie, geen dark patterns, geen voorgeselecteerde extra's, geen nep-doorgestreepte prijs | ES 05–06 | Hard verbod in PR-template. Quote-TTL alleen tonen als operationeel nodig (BP 09). |
| Vóór boeken zichtbaar: prijs, toeslagen, wachttijd- en annuleringsvoorwaarden | ES 06, BP 10 | RouteFinder-resultaat en boekstap tonen voorwaarden-link naast prijs. |
| Primaire CTA beschrijft wat er gebeurt | BP 10 | "Boek rit" → "Vraag deze rit aan" / "Betaal en vraag aan" afhankelijk van de flow. |
| **INQUIRY ≠ CONFIRMED** — nooit communicatie die een aanvraag als bevestiging laat lezen; website, e-mail, WhatsApp, admin hetzelfde statuscontract | ES 08, 41; BP 12–13 | Bevestigingsscherm §8 herschreven. Klanttaal wordt afgeleid van één status-mapping, niet per component. |
| Bevestiging: belangrijkste ritinformatie bovenaan (datum, ophaaltijd, ophaallocatie, bestemming, referentie, contact; waar relevant vlucht, passagiers, prijs/betaalstatus) | ES 09 | Vaste volgorde op scherm én in e-mail. |
| Geen persoonsgegevens vóórdat ze nodig zijn | BP 06 | Ondersteunt §7 (adressen uit de URL) en S6. |
| CHTA — "Customer Had To Ask" als kern-KPI | ES 56, Launch Kit 11–12 | Toevoegen aan Fase 8-meting. |
| Business: vooraf afgestemd, pilot van max. 5 ritten / 30 dagen, "definitief na onze bevestiging" | Launch Kit 01–02 | /zakelijk-vervoer stuurt naar gesprek/pilot, niet naar self-serve "Business account". |

## 0c. Claims-check (verplicht bij elke copy-wijziging)

Capability-register uit BP 82, aangevuld met de huidige codestand. Een claim zonder
status *Approved* komt niet op de site.

| Claim uit de 2.0-visie | Stand | Toegestaan? |
|---|---|---|
| "Uw prijs staat vast" / vaste prijs vooraf | Pricing + snapshot live | Ja |
| "Uw vlucht wordt gevolgd" | Flight monitoring gemerged, prod wacht op secret; per scope | **Alleen conditioneel** ("bij luchthavenritten met vluchtnummer"), pas na activatie in prod |
| "Uw chauffeur wacht" | Geen vastgelegd wachttijdbeleid in code | **Nee**, tot wachttijdvoorwaarden gepubliceerd zijn |
| "24/7" | Launch Kit: geen toezegging voor onbewezen directe capaciteit | **Nee**, of alleen "24/7 te boeken" als het boekingskanaal dat is |
| "4.9 / 5 geverifieerde reviews" | Geen bron | **Nee** |
| Business account / maandfactuur | BP 82: Future/Locked | **Nee** als functie; wel "bespreek facturatie" |
| Tesla Model Y bij bevestiging | Toewijzing niet gegarandeerd | **Nee**; voertuigklasse |

---

## 1. Invarianten — mag geen enkele 2.0-PR veranderen

| Domein | Bestand(en) | Regel |
|---|---|---|
| Prijs | `lib/pricing/**`, `app/api/pricing/quote/route.ts` | Geen wijziging aan berekening, tarieven, uplifts. Geen client-side prijslogica. |
| Quote-lock | `components/shared/useRouteQuote.ts`, `lib/pricing/snapshot*.ts` | Hook-contract (`Quote`-union) blijft; UI mag alleen *anders tonen*. |
| Boeking | `app/api/bookings/route.ts`, `BookingSection.handleSubmit` | Payload-shape, validaties, honeypot, retour-vluchtnummerregel blijven. |
| Betaling | `components/booking/PaymentStep.tsx` | State machine + server-reconciliatie blijven; alleen presentatie van `confirmed`. "Betaling ≠ vervoersbevestiging" blijft. |
| SEO | `app/[locale]/[slug]`, `StadHubPage`, `sitemap.ts`, metadata/hreflang/JSON-LD | Geen URL-, title-, canonical- of contentverlies. |
| Events | event pricing `mode=off` | 2.0 activeert niets. |
| Tests | `npm test`, `test:*` | Bestaande suites blijven groen; nieuwe tests naast bestaande. |

Elke PR draait: `npm run lint && npm run typecheck && npm test && npm run build`, plus
visuele check via `npm run dev:staging` (nooit `npm run dev` — live Stripe-keys).

---

## 2. Beslissingen die bij de eigenaar liggen (blokkeren alleen hun eigen PR)

| # | Besluit | Blokkeert | Advies |
|---|---|---|---|
| B1 | Display-font: blijft Outfit, of editorial serif (Playfair zit al in de build, of een nieuwe) | PR 1.2 | Serif alleen voor display ≥ 48px; UI/body blijft Inter. Max. 3 fontfamilies. |
| B2 | Fotoshoot (Departure/Journey/Arrival/Details) — budget + planning | Release 2.0.1 (niet 2.0) | **Besloten (25-09):** 2.0 lanceert met de bestaande drie campagnebeelden + vloot; geen tussenbeeld. De shoot wordt release 2.0.1 "Visual campaign" met eigen gate (§11). |
| B3 | Nieuwe IA (Particulier/Business/Membership/Drivers) | PR 5.1 | Eerst nav herindelen, URL's ongewijzigd laten. |
| B4 | Merkregels | PR 1.1 | **Besloten (25-09):** merkprincipe = "Precisie zonder vertoon." (hoe T4XI zich gedraagt: intern, documentenset, over-ons); consumententagline = "Arrive composed." (wat de klant ervaart: footer, EN-hero, JSON-LD `slogan`); "Arrive with confidence" wordt verwijderd (`messages/*.json:941`, `en.json:1333`, `layout.tsx:76`). |
| B5 | Bevestigingsscherm noemt voertuigklasse, niet "Tesla Model Y" (toewijzing is niet gegarandeerd) | PR 2.5 | Ja. |
| B7 | Wachttijd- en annuleringsvoorwaarden publiceren (nodig vóór claims "chauffeur wacht" en voor ES 06) | PR 2.4, 3.1 | Commercial + operations; staat ook in Launch Kit 13. |
| B6 | Gedeelde rate-limit-store (Upstash/Vercel KV) — kosten + vendor | PR S2 | Ja; in-memory limiter is per instance (zie `lib/security/rate-limit.ts` header). |
| B8 | Analytics-provider + consent: `lib/analytics.ts` is een shim zonder provider; consent-branch `feature/consent-marketing-trackers` is niet gemerged | PR 0.4, Fase 8 | Cookieloze, first-party provider (bv. Plausible of Vercel Web Analytics custom events) zodat de funnel geen trackingcookie vraagt; anders eerst consent mergen. Tot besluit: alleen servertelling. |

---

## 3. Inventaris — KEEP / MODIFY / REPLACE / NEW

### Foundations
| Bestand | Actie | Wat |
|---|---|---|
| `tailwind.config.ts` | MODIFY | Tokens aanvullen: typeschaal (`display-hero` clamp 3–6.875rem, `display-statement` clamp 2.5–5.5rem, `body-lg` 1.0625–1.1875rem, `meta` 0.6875rem/0.16em); `transitionTimingFunction.premium` → alias van `--hz-ease` (nu afwijkende curve). Kleuren KEEP. |
| `app/globals.css` | MODIFY | `body::before` radial gradients verwijderen (visie §37: geen gradient-achtergronden). Oude `.reveal` KEEP tot ScrollReveal-migratie klaar is. |
| `components/horizon/horizon.css` | MODIFY | Motion-tokens splitsen: `--hz-micro:160ms`, `--hz-ui:280ms`, `--hz-composed:700ms`, `--hz-cinematic:1100ms`, `--hz-ambient:6000ms`. `--hz-immediate` blijft als alias. Nieuwe `.hz-route-*` klassen. |
| `components/horizon/motion.tsx` | MODIFY | `Reveal` krijgt `distance` (12/20/26px). Nieuw: `useStagger` voor de hero-choreografie. |
| `components/horizon/JourneyLine.tsx` | NEW | Zie §4. Server-renderbaar; animatie via CSS-klassen, geen library. |
| `components/ui/Button.tsx` | REPLACE | Drie varianten `primary` / `secondary` / `text`, polymorf (`href` → Link, anders `<button>`). Geen `hover:-translate-y`, geen `scale`. Primary: horizontale fill (hergebruik `.hz-confirm-btn`, richting links→rechts). Adoptie per pagina in latere PR's — niet in één big-bang. |
| `components/ui/ScrollReveal.tsx` | REPLACE (later) | Vervangen door Horizon `Reveal`; twee reveal-systemen is drift. Laatste foundations-PR. |

### Homepage (`app/[locale]/page.tsx`, 610 regels → opsplitsen)
| Sectie | Actie | Wat |
|---|---|---|
| Arrival (hero) | MODIFY | Eyebrow + "Van voordeur / tot vertrekhal." + één subregel + SentencePattern + trustline. Choreografie §5. Content blijft boven de vouw zichtbaar zonder JS (`Reveal immediate` gedrag behouden: startstaat alleen onder `html.js`). |
| `SentencePattern` (`patterns.tsx:272`) | MODIFY | Zie §6. Uit `patterns.tsx` (674 r.) naar `components/horizon/sentence/*` om onder 500 regels te blijven. |
| Recognition (4 vows, donker blok) | MODIFY | Wordt §11 "Service principles": typografisch, genummerd, hairlines i.p.v. kaarten. |
| — | NEW | "Quiet proof": drie regels + verticale JourneyLine, tussen hero en principles. Regels alleen uit *Approved* claims (§0c) — nu: "Uw prijs staat vast." + twee regels die de eigenaar kiest uit wat operationeel waar is. "Uw vlucht wordt gevolgd" / "Uw chauffeur wacht" pas na B7 en activatie flight monitoring. |
| Certainty (ledger) | KEEP | `LedgerPattern` + `loadRateCard()` is precies goed; alleen typografie-tokens. |
| Journey (vloot, `FleetPlate`) | MODIFY | "Twee modellen. Eén standaard." + `01 / 02` + subtiele 2–4% horizontale drift (CSS scroll-driven animation met `@supports`, fallback statisch). `FleetPlate`/`FleetImage` naar eigen bestand. |
| Proof | KEEP | Blijft "uitsluitend wat aantoonbaar is". |
| Invitation | MODIFY | Eén primary CTA + text action. |
| `export const dynamic = "force-dynamic"` | MODIFY (eigen PR) | → ISR + `revalidateTag` op rate-card; grootste LCP-hefboom. Aparte PR 3.4, los van design. |

### Booking & prijs
| Bestand | Actie | Wat |
|---|---|---|
| `components/shared/AddressAutocomplete.tsx` | MODIFY | Suggestie-"sheet" (titel + adresregel + type-label `Recent`/`Airport`/`Station`) — presentatie, zelfde `/api/places`-keten. ARIA combobox-patroon controleren. |
| `components/booking/BookingSection.tsx` (624 r.) | MODIFY + split | Stappen Route → Rit → Gegevens → Bevestigen als *weergave* van dezelfde state; `handleSubmit` ongewijzigd. Opsplitsen in `booking/steps/*`. Na validatiefout focus naar eerste fout (nu alleen melding). |
| `app/[locale]/boeken/page.tsx` | MODIFY | Handoff-contract §7 lezen; bestaande query-params blijven werken (ledger, RouteFinder, SEO-links). |
| `components/tarieven/RouteFinder.tsx` (621 r.) | MODIFY + split | Resultaat transformeert naar "UW RIT"-kaart + JourneyLine + prijs + "Reserveer deze rit →" (handoff, geen herinvoer). Retour-meerprijs alleen tonen als de engine hem levert. |
| `components/booking/PaymentStep.tsx` | MODIFY (alleen `confirmed`-render) | Bevestigingsmoment §8. |
| `components/sections/StickyCta.tsx` | MODIFY | Contextueel: toont prijs + "Reserveer rit" alleen bij `quote.status==="ready"`; anders huidige gedrag. |
| `components/booking/FlightCard.tsx` | KEEP | |

### Navigatie, footer, overige pagina's
| Bestand | Actie | Wat |
|---|---|---|
| `components/sections/Header.tsx` | MODIFY | Zie spec §13c. `aria-current` KEEP. |
| `components/sections/Footer.tsx` | MODIFY | Zie spec §13c. `pb-[calc(72px_+_env(...))]` KEEP. |
| `app/[locale]/producten/page.tsx` + `ProductForms.tsx` | MODIFY | Editorial intro per product vóór de vergelijking. Prijzen uit bestaande bron, niet hardcoden in copy. |
| `app/[locale]/zakelijk-vervoer` | MODIFY (fase 5) | Copy uit Launch Kit 01 ("Zakelijk vervoer, goed geregeld." · drie stappen · pilot 5 ritten / 30 dagen). CTA = gesprek aanvragen, geen self-serve account. Booker ≠ reiziger expliciet benoemen. |
| `diensten`, `over-ons`, `partner`, `dagtochten` | MODIFY (fase 5) | Nieuwe componenten adopteren; geen contentverwijdering. `partner` toetsen aan Partner Driver Standards (02). |
| `components/seo/StadHubPage.tsx`, `app/[locale]/[slug]` | MODIFY (fase 7) | Alleen tokens/Button/JourneyLine. Géén editorial motion (intent = prijs → boeken). |
| `components/sections/ReviewsSection.tsx` | KEEP (uit) | |
| E-mailtemplates (`lib/communication/**`) | MODIFY (fase 5) | JourneyLine als inline-SVG/tabel-fallback, zelfde tone of voice. Via bestaande communication engine + `verify:communication`. |

---

## 4. Component: `JourneyLine`

```ts
type JourneyLineProps = {
  from?: string;            // "ALMERE POORT"
  to?: string;              // "SCHIPHOL"
  fromMeta?: string;        // "07:00"
  toMeta?: string;
  state: "empty" | "origin" | "route" | "travelling" | "arrived";
  orientation?: "horizontal" | "vertical";
  size?: "micro" | "inline" | "display";
  decorative?: boolean;     // true → aria-hidden
};
```

- Markup: `<div role="img" aria-label="Route van X naar Y">` + twee punten (`●` gevuld = vertrek, `○`/`●` = bestemming) + 1px lijn via `transform: scaleX()` (nooit `width`).
- `origin` → lijn tot 50% met open einde; `route` → volledig; `travelling` → één 6px-punt reist 600ms links→rechts (`--hz-ease`), daarna `arrived`.
- Reduced motion: direct eindstaat, geen reizend punt.
- Toepassingen (volgorde van bouwen): hero-zin → RouteFinder-resultaat → booking-progress → bevestiging → footer → quiet proof (verticaal) → e-mail.
- Tests: `lib/horizon/journey-line-state.test.ts` — pure functie `journeyStateFor(quote, pickup, dropoff)`; statusovergang mag alleen `ready` → `arrived` bij backend-bevestigde quote.

---

## 5. Motion-spec

| Categorie | Token | Duur | Gebruik |
|---|---|---|---|
| Micro | `--hz-micro` | 120–220ms (160) | hover, underline, arrow (3–4px), toggles |
| UI | `--hz-ui` | 200–350ms (280) | sheets, stapwissel booking, header-shrink, route→booking |
| Editorial | `--hz-composed` | 500–900ms (700) | headings, foto-reveal (12–20px) |
| Cinematic | `--hz-cinematic` | 1100ms | alleen spine-draw en bevestiging |
| Ambient | `--hz-ambient` | ≥ 6s | vloot-drift, spine; onmerkbaar |

**Hero-choreografie** (alleen `html.js` + `prefers-reduced-motion: no-preference`; totaal < 1s):
eyebrow 100ms · regel 1 180ms (translateY 20px) · regel 2 280ms · subcopy 430ms ·
booking 550ms · trustline 700ms. Via CSS `animation-delay` op klassen — geen
IntersectionObserver boven de vouw, geen hydratie-afhankelijkheid.
**LCP-regel:** het LCP-element (hero-kop) mag op t=0 niet `opacity:0` zijn → animeer
`transform` + `clip-path`, of start op opacity .01 niet 0; meten in PR 1.3.

Cursor-label (`BEKIJK`) alleen op vloot-foto's, alleen `(pointer: fine)`, en uitsluitend
als die foto's ook echt iets openen — anders niet bouwen.

### 5b. Wat níét gebouwd wordt (reviewchecklist in PR-template)

| Categorie | Verboden | Toetsbaar via |
|---|---|---|
| Achtergrond | gradients, glowing orbs, blauwe glow, noise-textures | grep `radial-gradient\|linear-gradient` buiten `.hz-frame` |
| Oppervlak | floating glass cards, zware glassmorphism, `rounded-3xl`+ op contentkaarten, schaduw-stapels | review; `backdrop-blur` alleen op header + foto-labels |
| Motion | bounce/spring, `scale > 1.02`, scroll-hijack, parallax buiten de vloot, custom cursor sitebreed, animated counters (Odometer op prijs = Confirm, blijft), autoplay-video boven de vouw of op mobiel | review + §5-tokens |
| Conversietrucs | "12 mensen bekijken deze rit", nep-live-boekingen, countdowns, "nog 1 chauffeur", doorgestreepte nep-prijzen, voorgeselecteerde extra's | ES 05–06; grep op copy |
| Content | carousels voor essentiële info (prijzen, voorwaarden, USP's), testimonial-carousel, fake reviews | review |
| UI | AI-chatbubble, grote iconensets (max. het bestaande `Icon.tsx`), > 3 knopstijlen, CTA-kleuren buiten `accent`/`ink` | Button v2 is de enige knop |
| Beeld | 3D-auto / 360°-configurator, stockfoto's, AI-beeld gepresenteerd als echte service | §13b |

---

## 6. Booking sentence 2.0 (hero)

Huidig: `SentencePattern` met AddressAutocomplete, datum, tijd, bagage → `useRouteQuote` →
link naar `/boeken?pickup=…`. Nieuw:

1. Inputs als interactieve tekst: `.hz-focus` + underline-guide; bij focus krijgt het
   actieve deel `text-ink`, rest `text-ink/55` (via `:has(:focus-within)`; fallback: niets).
2. Passagiers toevoegen aan de zin (nu alleen op /boeken) — `useRouteQuote` accepteert
   `passengers` al.
3. JourneyLine onder de zin, state gekoppeld aan pickup/dropoff/quote.
4. Prijsreveal: `quote.status==="ready"` → `travelling` (600ms) → prijs met bestaande
   `Odometer` + "Vaste prijs · incl. btw · geen taxameter". `onrequest`/`error` houden
   hun bestaande teksten (geen theater bij falen).
5. Mobiel (< 768px): gestapelde "Van / Naar" + bottom sheet voor datum/tijd/passagiers/
   bagage (`<dialog>` met focus-trap; native pickers binnen de sheet). CTA in duimzone.
6. `aria-live="polite"` op prijs blijft; route-label voor screenreaders.

---

## 7. Handoff zonder contextverlies (en zonder adressen in de URL)

**Probleem nu:** de hero stuurt vrij ingevoerde adressen (mogelijk een woonadres) als
query-string naar `/boeken` (`patterns.tsx:314`). Die belanden in browsergeschiedenis,
serverlogs, analytics en Referer. Daarnaast rekent `/boeken` opnieuw (pickup wordt
`{ id: "deeplink", source: "free" }`), waardoor de gekozen suggestie en `quoteId` verloren gaan.

**Oplossing (PR 2.3):**
- `lib/booking-handoff.ts`: `writeHandoff({pickup, dropoff, date, time, persons, luggage, quoteId})`
  naar `sessionStorage` (sleutel `t4xi:handoff:v1`, TTL = quote-TTL 15 min, versie-veld,
  zod-achtige validatie bij lezen). URL wordt `/boeken?h=1`.
- `BookingSection` leest handoff bij mount; ongeldig/verlopen → leeg formulier (nooit crash).
  Is `quoteId` nog geldig, dan toont /boeken dezelfde prijs direct en rekent de hook
  verifiërend (server blijft bron van waarheid).
- **Bestaande publieke deep-links blijven** (`?pickup=Almere Poort&dropoff=Schiphol` uit
  ledger, RouteFinder, SEO-pagina's): dat zijn publieke plaatsnamen, geen PII, en ze zijn
  indexeerbaar/deelbaar.
- Overgang: View Transitions API (`@view-transition { navigation: auto; }` + gedeelde
  `view-transition-name` op JourneyLine en prijs), 250ms; zonder support gewoon navigatie.
- Tests: handoff round-trip, verlopen TTL, gemanipuleerde storage (prijs in storage wordt
  genegeerd — alleen `quoteId` telt), en een lock-test dat `SentencePattern` geen
  vrij adres meer in `href` zet.

---

## 8. Bevestigingsmoment (PR 2.5)

Alleen de render van `PaymentStep` state `confirmed`. De huidige copy is al correct
("Betaling bevestigd … We ronden uw boeking af.", `messages/nl.json:1361`): de database
kent `pending`/`paid`, nog geen door T4XI geaccepteerde vervoersstatus. Copy-regels (ES 08):
- Kop volgt de **bookingstatus**, niet de betaalstatus. Zolang er geen CONFIRMED-status
  bestaat: "Betaling ontvangen. Uw aanvraag is in behandeling." + wanneer/hoe de
  bevestiging volgt. Níet "staat klaar", "staat gepland" of "is bevestigd".
- Pas als het statusmodel CONFIRMED kent (BP 13, aparte backend-workstream buiten 2.0):
  "Uw rit is bevestigd." — via één gedeelde status→klanttaal-mapping
  (`lib/bookings/customer-status-copy.ts`, NEW) die scherm, e-mail en WhatsApp delen.
  Test: elke bookingstatus heeft precies één klanttekst per locale; `pending`/`paid`
  mogen nooit "bevestigd" bevatten.
- Volgorde (ES 09): datum + ophaaltijd, ophaallocatie, bestemming, referentie, contact;
  daarna passagiers, vluchtnummer, voertuigklasse (B5), "€X betaald" uit server-intent.
- JourneyLine animeert één keer `route → arrived` (cinematic) — geen feestelijk vinkje
  dat meer belooft dan de status.
- E-mail gemaskeerd (`ro••••@gmail.com`) — maskeerfunctie + test.
- Acties: Voeg toe aan agenda (client-side `.ics` uit bevestigde data, geen nieuwe API),
  WhatsApp-contact (bestaand nummer). "Bekijk boeking" pas als `/klant` die boeking
  werkelijk toont.

---

## 9. Security-spoor (parallel, eigen PR's, S-nummers)

Per gate: bewijs = test of script in de repo, niet een bewering.

| PR | Gate | Huidige stand | Werk |
|---|---|---|---|
| S1 | A — browser headers | HSTS, nosniff, Referrer, Permissions, frame-ancestors staan (`next.config.mjs:61-76`). CSP heeft `script-src 'unsafe-inline'`. | Nonce-CSP via `proxy.ts` (Next 16 ondersteunt nonce voor eigen scripts; Stripe + Sanity + consent meenemen). Eerst `Content-Security-Policy-Report-Only` 7 dagen, dan enforce. Test: header-snapshot. `productionBrowserSourceMaps` expliciet `false`. Scan build-output op `NEXT_PUBLIC_*` met secret-patronen. |
| S2 | B — publieke API-matrix | Rate limiting in-memory op quote/bookings/leads/payments/flights/places. | Matrix als code: `lib/security/api-surface.test.ts` dat alle `app/api/**/route.ts` opsomt en faalt als een nieuwe route geen entry (auth, limiet, validatie, PII) heeft. Gedeelde store (B6). `/api/places` apart budget (kost Google-geld). Body-size limits. |
| S3 | Pricing | Server rekent, quote-lock + TTL. | Adversarial tests toevoegen waar ontbrekend: verlopen `quoteId`, `quoteId` van andere route, hergebruik na boeking, prijsveld in payload wordt genegeerd. Eerst inventariseren wat `booking-lock.test.ts` al dekt. |
| S4 | Supabase RLS | Deny-by-default op brain_*, Control Sprint 1 gemerged. | RLS-matrix per tabel × rol × actie als SQL-testscript tegen **staging**; bewijsgevallen: klant A ≠ boeking B, ingetrokken gebruiker verliest toegang. Driver/hotel-rollen pas testen wanneer die tabellen bestaan (geen nieuwe tabellen in 2.0 — zie Control-architectuurgrenzen). |
| S5 | Webhooks | Stripe + Resend signature-verificatie aanwezig. | Replay/idempotency-tests (zelfde event-id 2×), timestamp-tolerantie Resend, failure-state. WhatsApp pas bij Gate 4 (Meta nog uit). |
| S6 | Logging/privacy | — | Grep-test: geen `console.*` met booking-payload/adres/telefoon in `app/api`; monitoring op booking-ID. Analytics: geen adressen in events of page-URL's (hangt samen met §7). |
| S7 | Abuse | Honeypot op booking. | Submission-timing + duplicaatdetectie op bookings/leads; challenge alleen bij verdacht verkeer. Geen CAPTCHA op de normale flow. |
| S8 | Identity & session (conditioneel) | Zie §9b. | Gate die afgaat vóór elke login-oppervlakte live gaat. |

### 9b. S8 — Identity & Session Security (conditionele gate)

**Waarom nu in het plan, al is er nog geen klantlogin:** 2.0 ontwerpt oppervlakken die
later een identiteit vragen ("Bekijk boeking", zakelijke boeker, chauffeur, Control). Zonder
expliciete gate glipt een login-UI mee in een design-PR.

**Huidige stand** (`proxy.ts`, ADR-015): geen Supabase Auth voor klanten; `/klant` en
overige `/dashboard` → 404; `/dashboard/brain` achter HTTP Basic Auth; `/dashboard/invoices`
met HttpOnly-sessie op een gedeeld wachtwoord (`OPS_DASHBOARD_PASSWORD`); `/admin` (Control)
default-deny met Supabase-auth + verplichte MFA (Control Sprint 1). ADR-015 is aanvaard
voor staging; productie is een apart eigenaarsbesluit.

**Trigger:** S8 moet groen zijn vóór een PR die (a) een login-, account- of
"mijn boekingen"-scherm publiek bereikbaar maakt, (b) een nieuwe rol (customer, business
booker, driver, ops) in productie activeert, of (c) de gedeelde ops-wachtwoorden vervangt.
Tot die trigger: **geen login-UI in 2.0** — "Bekijk boeking" blijft een link in de
bevestigingsmail, niet een account.

| Eis | Bewijs |
|---|---|
| Sessiecookies `HttpOnly`, `Secure`, `SameSite=Lax` (ops/admin `Strict`), `__Host-`-prefix, geen tokens in `localStorage` | header-/cookie-test |
| Idle- en absolute timeout per rol (klant ruim, ops/admin kort); sessierotatie bij login en rolwijziging | unit-test op sessiebeleid |
| Intrekking werkt direct: ingetrokken gebruiker of verwijderde rol verliest toegang bij volgende request | test tegen staging (sluit aan op S4 RLS-matrix) |
| MFA verplicht voor ops/admin; step-up voor gevoelige acties (refund, rolwijziging, export) | Control-tests uitbreiden |
| Brute-force/credential-stuffing: limiet per account én per IP op gedeelde store (B6); geen account-enumeratie in foutteksten en timing | adversarial test |
| CSRF-bescherming op alle muterende routes met cookie-auth (Origin-check of token) | API-matrix S2 krijgt kolom "CSRF" |
| Magic link / reset-links: eenmalig, kort geldig, niet in logs | test |
| Uitfasering gedeelde geheimen: `OPS_DASHBOARD_PASSWORD` en Basic Auth → persoonsgebonden accounts met audit-actor (lost `booking_status_transitions.actor` als vrije tekst op) | migratieplan in ADR-015-lijn |
| Auth-events gelogd zonder PII (user-id, geen e-mail/wachtwoord), met audit trail | S6-grep uitgebreid |

**Legacy security debt (los van de trigger).** "S8 niet getriggerd" betekent níét dat de
huidige identiteitsbeveiliging akkoord is. Bekende schuld, blokkeert 2.0 niet:

| Item | Risico | Einddatum |
|---|---|---|
| `/dashboard/invoices` op gedeeld `OPS_DASHBOARD_PASSWORD` | geen persoonsidentiteit, geen intrekking per persoon, audit-actor niet verifieerbaar | zodra Control facturatie overneemt; uiterlijk [datum, eigenaar] |
| `/dashboard/brain` achter HTTP Basic Auth | gedeelde credentials, geen MFA, geen sessietimeout | zodra Control de Pricing Brain-weergave heeft; uiterlijk [datum, eigenaar] |
| `booking_status_transitions.actor` als vrije tekst | niet herleidbaar wie een status wijzigde | met ADR-015 in productie |

Deze tabel wordt bij elke Control-release herzien; een item verdwijnt alleen met bewijs
dat de oude toegang is uitgeschakeld.

---

## 10. Performance- en a11y-budgetten (gelden per PR)

- Budget p75 mobiel: LCP < 2,5s, INP < 200ms, CLS < 0,1 op `/`, `/boeken`, `/tarieven`,
  `/taxi-almere-schiphol`. Een PR die > 10% verslechtert t.o.v. baseline wordt niet gemerged.
- Geen nieuwe runtime-dependency voor motion (CSS + View Transitions + bestaande hooks).
- Afbeeldingen via `next/image` met `sizes`; hero-afbeelding `priority`; AVIF/WebP via Next.
- WCAG 2.2 AA: keyboard door hele boekingsflow, focus na fout, 44×44 targets
  (bestaande `booking-touch-targets.test.ts` uitbreiden), contrast `text-ink/55` ≥ 4.5:1
  controleren (anders `/65`), headings één `h1` per pagina.

### 10b. Visual regression gate (PR 0.3)

Handmatige screenshots blijven voor review, maar de gate is geautomatiseerd:
**Playwright `toHaveScreenshot`** (nieuwe devDependency `@playwright/test`, geen
runtime-impact) met baselines in de repo.

- **Kerncomponenten × toestanden:**
  | Component | Toestanden |
  |---|---|
  | Hero (Arrival) | leeg · ingevuld · prijs ready · onrequest · error |
  | SentencePattern | leeg · focus op veld · suggesties open · quote loading · ready |
  | Quote-resultaat (RouteFinder "UW RIT") | ready · onrequest · met retour |
  | Booking (BookingSection) | stap Route · Rit · Gegevens met validatiefout · Bevestigen |
  | Payment / confirmation | betaalstap · pending · `confirmed` (aanvraagstatus §8) · unconfirmed |
  | Header | top · gescrold · mobiel menu open · actieve nav |
  | Footer | desktop · mobiel met StickyCta-clearance |
- **Viewports:** 375, 768, 1280. **Deterministisch:** `prefers-reduced-motion: reduce`,
  fonts geladen vóór opname, vaste datum/tijd (`page.clock`), en `/api/pricing/quote`,
  `/api/places`, `/api/payments/*` via `page.route()` op fixtures — nooit live Supabase of
  Stripe. Stripe Elements-iframe wordt gemaskeerd.
- **Drempel:** `maxDiffPixelRatio` 0.001 per snapshot; elke diff faalt de PR.
- **Baseline bijwerken** alleen via `--update-snapshots` in dezelfde PR, met voor/na in de
  PR-beschrijving en expliciet akkoord van de reviewer. Baselines op Linux (CI) gegenereerd
  om font-rendering-drift tussen macOS en CI te vermijden.
- **Intentional vs. technisch verschil:** baselines worden alleen gemaakt en vergeleken in
  het vastgepinde Playwright-Docker-image (`mcr.microsoft.com/playwright:v<exact>`),
  met exacte `@playwright/test`-versie (geen `^`) en dezelfde fonts als productie
  (`next/font` self-hosted, geen systeemfont-fallback). Een Playwright- of browserupgrade
  is een eigen PR die alléén baselines ververst — nooit samen met UI-wijzigingen. Zo
  betekent een diff in een design-PR altijd: de UI veranderde.
- **Volgorde:** PR 0.3 legt de baseline vast op de *huidige* UI, vóór Fase 1. Elke
  2.0-PR laat daarna zien wat er bewust veranderde.

---

## 11. PR-volgorde

Elke PR: vanaf verse `origin/main` (fetch + ancestry-check), ≤ ~400 regels diff waar
mogelijk, staging-check, reduced-motion aan/uit, en **visual-regression-gate §10b groen**
(of bewust bijgewerkte baselines met voor/na in de PR).

**Fase 0 — Baseline (geen UI-wijziging).** Volgorde 0.1 → 0.2 → 0.3 → 0.4a.

**Regel: baseline-PR's repareren geen productgedrag.** Vindt 0.1–0.4 een bestaand probleem
(a11y, SEO, perf, meetfout), dan wordt het een finding in
`docs/experience-2.0/baseline/findings.md` (+ issue) en apart opgelost ná de Baseline Gate.
Anders verandert de nulmeting tijdens het meten.

- 0.1 Lighthouse/CWV-meting (script in `scripts/`, output in `docs/experience-2.0/baseline/`) voor de vier budgetpagina's; axe-run; funnel-events uit `lib/analytics.ts` inventariseren. In dezelfde run: huidige server-side aantallen en meetmogelijkheden voor quotes, bookings en payments vastleggen (welke tabel/kolom, welke periode, wat níét meetbaar is).
- 0.2 SEO-snapshot-test: alle sitemap-URL's met title, canonical, hreflang, `h1` als fixture → test faalt bij verlies. Vangnet voor alle volgende fases.
- 0.3 Visual regression-baseline (§10b) op de huidige UI.
- 0.4a **Server truth**: read-only rapportage (script, service-role, geen schemawijziging) van quote → booking → payment-conversie per week, uit quote-snapshots, bookings en payments. Onafhankelijk van B8.
- 0.4b **Experience analytics**: client-events §11b (`hero_view` → `payment_success`). **Geblokkeerd op B8.** Start op de dag dat de provider live gaat; er wordt geen historische clientdata gesuggereerd die er niet is. Rapportage zet 0.4a en 0.4b altijd naast elkaar met hun eigen startdatum.

**Baseline Gate** (hard, vóór Fase 1):
`CWV ✓ · axe ✓ · SEO snapshot ✓ · visual snapshots ✓ · server measurement ✓` — elk als
bestand in `docs/experience-2.0/baseline/` of groene test in de repo. 0.4b hoort er niet bij.

**Fase 1 — Foundations**
- 1.1 Merkregel (B4) + tokens (type, motion, easing-alias) + gradient-achtergrond eruit.
- 1.2 Display-font (B1) — alleen als besloten; anders overslaan.
- 1.3 `JourneyLine` + state-functie + tests; Button v2 (nog niet adopteren).
- 1.4 Hero-choreografie + LCP-meting t.o.v. 0.1.
- 1.5 `docs/design-system/README.md` (§13a) + links vanuit `horizon.css`/`motion.tsx`.

**Fase 2 — Booking UX (hoogste commerciële prioriteit)**
- 2.1 SentencePattern 2.0 desktop: interactieve tekst, passagiers, JourneyLine, prijsreveal. Split uit `patterns.tsx`.
- 2.2 AddressAutocomplete suggestie-sheet.
- 2.3 Handoff + adressen uit de URL (§7) + View Transition.
- 2.4 BookingSection-stappenweergave + focus-na-fout + split; StickyCta contextueel.
- 2.5 Bevestigingsmoment (§8).
- 2.6 Mobiel: gestapelde zin + bottom sheet.
- 2.7 RouteFinder-resultaat → "UW RIT" + handoff.

**Fase 3 — Homepage editorial**
- 3.1 Quiet proof + service principles (vervangt donkere vows-sectie).
- 3.2 Vloot "Twee modellen. Eén standaard." + drift; FleetPlate eruit gesplitst.
- 3.3 Fotografie-slots (B2) — structuur nu, gevuld met de bestaande drie campagnebeelden + vloot. Geen tussenbeeld (§13b).
- 3.4 Homepage ISR i.p.v. `force-dynamic` (los, meetbaar).
- 3.5 Header + footer.

**Fase 4 — Motion-afronding**: ScrollReveal → Reveal migreren, cursor-label (optioneel), reduced-motion-audit over alle pagina's.

**Fase 5 — Commerciële architectuur**: nav-IA (B3), producten/zakelijk editorial, e-mailtemplates via communication engine.

**Fase 6 — Security**: S1–S7 lopen **parallel vanaf fase 1**, niet erna. S1 (CSP report-only) en S2 (API-matrixtest) als eerste.

**Fase 7 — SEO-rollout**: tokens/Button/JourneyLine op StadHubPage en `[slug]`, per batch van 5 pagina's, 0.2-snapshot moet groen blijven, GSC-controle na elke batch.

**Fase 8 — Meting**: CWV + stapfunnel §11b + CHTA vs. nulmeting 0.4, 4 weken, altijd aantallen naast percentages. Wijzigingen die niet aantoonbaar beter zijn, worden teruggedraaid, ook als ze mooier zijn.

**Release 2.0.1 — Visual campaign**: de fotoshoot (B2, brief §13b) landt als eigen release ná 2.0, met eigen gate: alle beelden voldoen aan §13b, releases getekend, alt-teksten aanwezig, LCP-budget §10 gehaald met de nieuwe hero-beelden, visual-regression-baselines bewust bijgewerkt.

### 11b. Stapfunnel (instrumentatie PR 0.4, meting Fase 8)

| Event | Moment | Toegestane props |
|---|---|---|
| `hero_view` | hero ≥ 50% in beeld | `surface` (home/tarieven/landing), `layout` (desktop/mobile_sheet) |
| `address_start` | eerste invoer in vertrek of bestemming | `field` |
| `route_complete` | beide adressen gekozen uit suggesties | `pickup_type`/`dropoff_type` (airport/station/address) |
| `quote_ready` | `useRouteQuote` → `ready` | `is_airport`, `is_return`, `price_band` (grof, bv. <75/75–150/>150) |
| `booking_start` | eerste interactie op /boeken (of stap Rit) | `entry` (hero/tarieven/ledger/direct), `handoff_used` |
| `details_complete` | stap Gegevens valide | — |
| `payment_start` | betaalstap getoond | — |
| `payment_success` | server-reconciliatie `confirmed` | — |
| `step_error` | validatie- of API-fout per stap | `step`, `code` (bv. `phone_invalid`, `quote_unavailable`, `rate_limited`) |

- **Abandonment** wordt afgeleid, niet gevuurd: laatste stap per sessie zonder volgende stap
  binnen 30 min. Per stap rapporteren: aantal, doorstroom, drop-off, top-3 `step_error`-codes.
- **Uitsplitsing** op `layout` en `surface`, zodat zichtbaar wordt of bv. de mobiele bottom
  sheet meer drop-off geeft dan de desktopzin.
- **Server als controlebron:** `quote_ready`, booking-aanmaak en `payment_success` zijn ook
  uit de database te tellen (quote-snapshots, bookings, payments). Client- en servertelling
  worden wekelijks naast elkaar gelegd; > 10% verschil = meetfout eerst oplossen.
- **Privacy:** events via `lib/analytics.ts` (bestaande shim); nooit adressen, namen,
  vluchtnummers, e-mail of telefoon; geen exacte prijs. Een test (`lib/analytics-funnel.test.ts`)
  controleert dat props alleen uit de toegestane lijst komen.
- **Randvoorwaarde:** `lib/analytics.ts` stuurt nu naar níéts — er is geen provider geladen,
  en de consent-branch is niet gemerged. Zonder B8 is er geen client-funnel, alleen de
  servertelling.

---

## 12. Definition of Done → bewijs

| Criterium | Bewijs |
|---|---|
| Brand | Grep: 0× "Arrive with confidence"; één Button-component; één reveal-systeem. |
| Normen | Elke publieke claim staat als *Approved* in §0c; status→klanttaal-test groen (geen "bevestigd" bij `pending`/`paid`); geen urgentie- of dark-patterncopy. |
| UX / conversie | Handoff-test groen; nul herinvoer tussen hero/RouteFinder en /boeken (e2e op staging). |
| Mobiel | Complete flow op 375px met duimzone-CTA; touch-target-test groen. |
| A11y | axe 0 serious/critical op kernflow; keyboard-walkthrough gedocumenteerd; reduced-motion-screenshots. |
| Performance | Budgetten §10 gehaald vs. baseline 0.1. |
| Visueel | Visual-regression-gate §10b groen op alle kerncomponenten; elke baselinewijziging heeft voor/na + akkoord. |
| Meting | Alle §11b-events live en getest op toegestane props; client- en servertelling binnen 10%; per stap drop-off en foutcodes zichtbaar. |
| Beeld | 2.0 bevat alleen bestaande echte campagnebeelden; geen stock of AI als service. Fotoshoot = release 2.0.1. |
| SEO | Snapshot-test 0.2 groen; geen indexatiedaling in GSC na fase 7. |
| Security | S1–S7 tests in repo en groen; CSP zonder `unsafe-inline` voor scripts; API-matrixtest dekt 100% van `app/api`. S8 groen óf aantoonbaar niet getriggerd (geen publieke login-UI in 2.0). |

---

## 13. Design-specificaties

Design System 2.0-deliverable (§13a), fotografie-regie en release gate (§13b), header/footer
per breakpoint (§13c) en de mockups (§13d) staan in [design-specs.md](design-specs.md).
