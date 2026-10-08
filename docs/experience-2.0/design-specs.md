# T4XI Digital Experience 2.0 — Design-specificaties

Hoort bij [masterplan.md](masterplan.md). Sectienummers lopen door (§13).

## 13. Design-specificaties

### 13a. Design System 2.0 — op te leveren document (PR 1.5)

Er bestaat nu geen losse design guideline in de repo; de regels leven in de
headercommentaren van `horizon.css` en `motion.tsx`. PR 1.5 levert
`docs/design-system/README.md` als enige bron, gelinkt vanuit die headers (geen tweede
waarheid). Elke latere PR die een token of component wijzigt, werkt dit document in
dezelfde PR bij — reviewregel.

| Laag | Inhoud | Bron in code |
|---|---|---|
| Foundations | Kleur (fog/overlay/subtle/field/card/ink/accent/stone/line, contrastparen), typografie (display/UI/meta-schaal §3), grid (`max-w-site` 75rem, 12 kolommen, gutter `5vw` / 16px mobiel), spacing (4-px-basis; sectieritme 64/96/128), radius (field 14, card 24 — geen nieuwe), borders (hairline `line`/`line-strong`), elevation (max. 2 niveaus: `card`, `cta`), iconografie (`Icon.tsx`, 1.5px stroke, geen nieuwe set) | `tailwind.config.ts`, `horizon.css` |
| Componenten | Button, Link/TextAction, Input, Select, DatePicker (native in sheet), AddressAutocomplete, JourneyLine, PriceDisplay, VehiclePlate, TrustItem, Sheet (`<dialog>`), Toast (alleen voor niet-kritieke info), Header, Footer | per component: anatomie, states (default/hover/focus-visible/active/disabled/loading/error), a11y-contract, do/don't |
| Patterns | Booking sentence, Price calculation, Checkout, Confirmation (statusmapping §8), Error (inline, focus naar eerste fout), Empty, Loading (skeleton, geen spinner op prijs), Dashboard (utility, geen editorial motion) | verwijzing naar implementatie |
| Motion | Tokens §5, de vijf Horizon-werkwoorden, reduced-motion-gedrag per component, §5b verboden | `horizon.css` |
| Voice | "Precisie zonder vertoon.", klanttaal per bookingstatus, claims-check §0c | `messages/*.json`, Experience Standard |

### 13b. Fotografie-regie (brief voor B2)

Eén fotograaf, één campagne, vier series: **Departure** (chauffeur arriveert, koffer
wordt aangenomen, deur open), **Journey** (passagier achterin, zacht daglicht, werk-
of rustmoment, stille cabine), **Arrival** (vertrekhal, hotel, zakelijke entree),
**Details** (carrosserie, deurgreep, interieur, bagage, USB-C, chauffeur alleen deels).

- Licht: natuurlijk, vroege ochtend / blauw uur; geen flitslook, geen HDR.
- Kleur: gedempt, aansluitend op fog/ink; nabewerking zoals nu (`saturate-[0.88]`).
- Mensen: echte chauffeur(s) en modellen met getekende release; klanten nooit zonder
  expliciete toestemming (ES 29).
- Verboden: stockfoto-look, zichtbare/leesbare kentekens, nep-landingsbaan, vliegtuig
  naast de auto, overdreven poseren, merklogo's van derden prominent, AI-gegenereerd
  beeld gepresenteerd als echte service.
- Levering: RAW + 3 crops per beeld (16:9, 4:5, 1:1), min. 3000 px lange zijde,
  alt-tekst per beeld aangeleverd door T4XI; bestanden via static import (blur-placeholder).
- **Release gate (B2, besloten):** 2.0 gaat live met de bestaande `t4xi-campagne-0{1,2,3}`
  + vlootfoto's. Liever minder beeld dan middelmatig tussenbeeld: geen stock, geen
  AI-vulling, geen snelle eigen foto's die niet aan deze brief voldoen. De shoot landt als
  release 2.0.1 "Visual campaign", en een beeld gaat pas live als het elk punt hierboven
  haalt.

### 13c. Header en footer per breakpoint

**Header** (`Header.tsx`)

| | < 768 | 768–1023 | ≥ 1024 |
|---|---|---|---|
| Links | Monogram T4XI | Monogram | Monogram |
| Midden | — | — | Diensten · Tarieven · Zakelijk · Over T4XI (tekst, `hz-guide-line`) |
| Rechts | "Boek" (primary, compact) + menuknop (44×44) | NL/EN + "Boek een rit" + menuknop | NL/EN + "Boek een rit" (primary) |
| Hoogte top / gescrold | 64 / 56 | 72 / 60 | 88 / 76 |
| Achtergrond | top: transparant op homepage, `fog` elders; gescrold: `fog/90` + `backdrop-blur-sm` + hairline onder | idem | idem |
| Menu | full-height sheet: nav, daarna tel/WhatsApp, NL/EN; focus-trap, Esc sluit | idem | n.v.t. |

Scrollovergang via `--hz-ui` (280ms), getriggerd door een IntersectionObserver-sentinel
(geen scroll-listener). Geen layout-shift: vaste `height` + `transform` op de inhoud.

**Footer** (`Footer.tsx`)

| Zone | < 768 | ≥ 1024 |
|---|---|---|
| Statement | "Arrive composed." display-statement, links uitgelijnd | idem, groter, max. 60% breedte |
| Journey Line | verticaal: steden onder elkaar, punten op de lijn | horizontaal: AMSTERDAM — ALMERE — UTRECHT — ROTTERDAM — DEN HAAG — SCHIPHOL; steden linken naar hun stadspagina (SEO-winst) |
| Sitemap | 2 kolommen accordeonloos (alles zichtbaar) | 4 kolommen: Diensten · Zakelijk · T4XI · Contact |
| Legal | KvK, voorwaarden, privacy, cookie-instellingen | één regel |
| Veiligheid | `pb-[calc(72px_+_env(safe-area-inset-bottom))]` blijft (StickyCta) | `lg:pb-0` |

### 13d. Visuele referentie

Mockups van hero (desktop + mobiel), prijsreveal, RouteFinder-resultaat, boekstappen,
bevestiging (aanvraag-status), homepage-editorial en footer: artifact "T4XI Experience 2.0 mockups" — https://claude.ai/artifact/HyZBtQ8PRc4Lr7fNky7fCf
(link in PR 1.5). De mockups zijn richtinggevend voor compositie en hiërarchie; tokens
en copy in dit plan gaan voor.

### 13e. Button-varianten (vastgelegd vóór adoptie, besluit eigenaar PR #60)

Eén component: `components/ui/Button.tsx` (klassen in `components/ui/button-styles.ts`).
Drie varianten, geen andere knopstijlen (§5b).

| Actie | Voorbeelden | Variant | Rust | Hover / focus |
|---|---|---|---|---|
| Primaire boekingsactie | "Boek deze rit", "Bevestig", "Bekijk mijn vaste prijs", "Betaal en vraag aan" | `primary` | **Gevuld**: ink, fog-tekst (13,64:1) | Vulling links → rechts in accent-light (fog-tekst 8,71:1) |
| Secundaire actie | Bellen, WhatsApp, terug, meer info | `secondary` | **Omlijnd**: ink-kader, ink-tekst (13,64:1), geen vulling | Lichte vulling links → rechts (overlay, ink-tekst 12,61:1) |
| Inline / tertiair | "Meer over T4XI →", links in lopende tekst of onder een kaart | `text` | Ink-tekst, geen kader; optionele pijl | Onderstreping links → rechts, pijl 4px |

Regels:
- **Maximaal één `primary` per scherm of sectie.** Twee gelijkwaardige acties: één `primary`, de ander `secondary`.
- Omlijnd is uitsluitend `secondary`; een primaire actie is nooit alleen een kader.
- **Touch:** de rustvorm draagt de hiërarchie — primary is zonder hover herkenbaar gevuld. `:active` toont dezelfde vulling als hover als directe drukfeedback; er is geen hover-afhankelijke informatie. Aanraakdoel ≥ 44px (`lg` ≥ 52px).
- Focus: ink-ring 2px met 2px offset, dus buiten de vulling en zichtbaar op fog. Op een donkere achtergrond eerst een lichte ring toevoegen (nog niet nodig: niets geadopteerd).
- Disabled/loading: primary verliest de donkere vulling (overlay, `stone-text` 4,86:1); secondary/text in `stone-text` (5,26:1 op fog). Nooit `text-stone` (F-11). Loading = `aria-busy`, label blijft staan, geen spinner.
- Geen lift (`-translate-y`), geen `scale`, geen schaduw; reduced motion = geen transitie.

### 13f. Display-serif (B1, besloten 08-10-2026)

**Brand Mode** = de niet-transactionele, merk- en redactionele delen van de site:
sectiestatements, merkstatements en editorial koppen. Alles waar de klant iets invult,
kiest, een prijs leest of een actie start, is **transactioneel** en blijft sans.

| | Regel |
|---|---|
| Wel serif | Hero-h1 "Van voordeur tot vertrekhal." (Arrival) en de standaardkop van `NarrativePattern` (homepage: Certainty, Journey, Invitation); later merkstatements zoals het footer-statement "Arrive composed." (PR 3.5) — alleen op display-grootte |
| Nooit serif | De booking sentence in de hero (invoervelden, prijsregel, knop), BookingSection, PaymentStep, RouteFinder, prijzen/prijsregels (`LedgerPattern`), StickyCta, Button, formulieren, eyebrows/kickers, body |
| Grootte | ≥ 48px op elke viewport: token `text-display-serif` = `clamp(3rem, 7.6vw, 6.75rem)` (48→108px), line-height 1.04 |
| Gewicht | draagstem 600 (`font-semibold`), echostem 400 (`font-normal`, `text-stone-text`); variabel bestand, dus geen extra download |
| Letterspacing | `-0.015em` (minder strak dan Outfit-display: serif heeft eigen contrast) |
| Stijl | alleen rechtop; geen `italic`, geen synthetische cursief |
| Fallback | `var(--font-playfair), Georgia, serif`; `next/font` met `display: swap` en metrische fallback |
| Bron | één token: `font-display-serif` + `text-display-serif` (`tailwind.config.ts`); `font-playfair` is een legacy-alias voor dagtochten (migreert in fase 5) |
| Bestanden | bestaande `Playfair_Display`-aanroep in `app/[locale]/layout.tsx`: `latin`, `style: "normal"`, geen `weight` → één woff2 |
| Bewaking | `lib/design/display-font.test.ts` |

**Bestaande uitzonderingen (legacy, migratie in fase 5).** `/dagtochten`
(`app/[locale]/dagtochten/page.tsx`, `components/dagtochten/RoutesExplorer.tsx`) gebruikt
`font-playfair` nog (a) cursief via `italic` op `<em>` — het cursieve bestand wordt niet
geladen, de browser maakt de cursief zelf na — en (b) in prijsweergave. Beide botsen met B1.
Tot fase 5 blijven ze ongewijzigd en vallen ze buiten de test; in fase 5 worden ze rechtop
en sans in prijzen, en verdwijnt de alias `font-playfair`.
