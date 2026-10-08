# T4XI Design System 2.0

De enige bron voor tokens, componenten, patronen, motion en voice van t4xi.nl
(Experience 2.0, PR 1.5 — opdracht: `docs/experience-2.0/design-specs.md` §13a).
Codecommentaren verwijzen hierheen; ze herhalen de regels niet.

**Reviewregel.** Een PR die een token of component wijzigt, werkt dit document in
dezelfde PR bij. `lib/design/design-system-readme.test.ts` faalt zodra een tokenwaarde
hier niet meer gelijk is aan de code.

**Hoe te lezen.** Elke waarde verwijst naar code (`bestand:regel` of tokennaam). Waar
de specificatie (masterplan/design-specs) iets anders zegt dan de code, staat hier de
code — en de tegenstrijdigheid in [Open afwijkingen](#6-open-afwijkingen). Niets
daarvan is in deze PR opgelost.

Visuele referentie (richtinggevend; tokens en copy hier gaan voor, §13d):
[T4XI Experience 2.0 mockups](https://claude.ai/artifact/HyZBtQ8PRc4Lr7fNky7fCf).

Inhoud: [1. Foundations](#1-foundations) · [2. Componenten](#2-componenten) ·
[3. Patterns](#3-patterns) · [4. Motion](#4-motion) · [5. Voice](#5-voice) ·
[6. Open afwijkingen](#6-open-afwijkingen)

---

## 1. Foundations

Bron: `tailwind.config.ts` (`theme.extend`) en `components/horizon/horizon.css` (`:root`).

### 1.1 Kleur

| Token | Waarde | Rol | Bron |
|---|---|---|---|
| `fog` | #F5F3F1 | canvas (bg-base) | `tailwind.config.ts:19` |
| `overlay` | #EEEAE5 | bg-overlay; hover-vulling secondary; inactieve primary | `tailwind.config.ts:20` |
| `subtle` | #E6E2DC | bg-subtle | `tailwind.config.ts:21` |
| `field` | #F9F7F4 | formuliervelden | `tailwind.config.ts:22` |
| `card` | #FFFFFF | cards / bg-raised | `tailwind.config.ts:23` |
| `ink.DEFAULT` | #1F2730 | primaire tekst, donkere footer, primary-vulling | `tailwind.config.ts:25` |
| `ink.soft` | #28313B | zachte ink | `tailwind.config.ts:26` |
| `accent.DEFAULT` | #28313B | CTA / actieve states / prijzen | `tailwind.config.ts:29` |
| `accent.hover` | #1F2730 | hover van accent | `tailwind.config.ts:30` |
| `accent.light` | #3A4652 | hover-vulling primary | `tailwind.config.ts:31` |
| `stone.text` | #5F666D | secundaire tekst — het toegankelijke grijs (F-11) | `tailwind.config.ts:37` |
| `stone.DEFAULT` | #999694 | alleen borders, decoratie, `aria-hidden`-tekens — **nooit tekst** (F-11) | `tailwind.config.ts:38` |
| `stone.subtle` | #CBC8C4 | decoratie | `tailwind.config.ts:39` |
| `line.DEFAULT` | rgba(31,39,48,0.10) | hairline | `tailwind.config.ts:42` |
| `line.strong` | rgba(31,39,48,0.18) | sterkere hairline, inactief kader | `tailwind.config.ts:43` |
| `secondary` | #5F666D | legacy-alias, zelfde waarde als `stone.text` | `tailwind.config.ts:45` |
| `whatsapp` | #25d366 | uitsluitend WhatsApp-merkkleur | `tailwind.config.ts:46` |
| `--hz-line` | rgba(31, 39, 48, 0.28) | Horizon-lijn (spine, focus-onderlijn) | `horizon.css:18` |
| `--hz-line-soft` | rgba(31, 39, 48, 0.12) | zachte Horizon-lijn (ledger, frame, JourneyLine-spoor) | `horizon.css:19` |

CTA-kleuren alleen uit `accent`/`ink` (masterplan §5b).

**Contrastparen** — WCAG 2.x-formule, berekend op de hexwaarden hierboven (geen
transparantie). AA tekst = 4,5:1.

| Voorgrond op achtergrond | Ratio | Gebruik | AA tekst |
|---|---|---|---|
| `ink` op `fog` | 13,64:1 | standaardtekst; secondary-tekst | ja |
| `ink` op `card` | 15,10:1 | tekst in cards | ja |
| `ink` op `field` | 14,12:1 | invoer | ja |
| `ink` op `overlay` | 12,61:1 | secondary in hover | ja |
| `ink` op `subtle` | 11,70:1 | | ja |
| `fog` op `ink` | 13,64:1 | primary in rust | ja |
| `fog` op `accent.light` | 8,71:1 | primary in hover/focus/active | ja |
| `fog` op `ink.soft` / `accent` | 11,91:1 | | ja |
| `stone.text` op `card` | 5,82:1 | | ja |
| `stone.text` op `field` | 5,44:1 | | ja |
| `stone.text` op `fog` | 5,26:1 | secundaire tekst; inactieve secondary/text | ja |
| `stone.text` op `overlay` | 4,86:1 | inactieve primary | ja |
| `stone.text` op `subtle` | 4,51:1 | grenswaarde — niet kleiner/dunner zetten | net |
| `stone.DEFAULT` op `fog` | 2,66:1 | alleen decoratie | **nee** |
| `stone.DEFAULT` op `card` | 2,94:1 | alleen decoratie | **nee** |

Opaciteitsvarianten (`text-ink/55` e.d.) zijn niet gemeten; masterplan §10 eist een
controle (anders `/65`) bij adoptie.

### 1.2 Typografie

Drie families, maximaal (B1, bewaakt door `lib/design/display-font.test.ts`):

| Token | Stack | Rol | Bron |
|---|---|---|---|
| `font-display` | `var(--font-outfit)`, system-ui, sans-serif | UI-display, booking sentence | `tailwind.config.ts:49`; Outfit `app/[locale]/layout.tsx:25` |
| `font-body` | `var(--font-inter)`, system-ui, sans-serif | UI en lopende tekst | `tailwind.config.ts:50`; Inter `layout.tsx:31` |
| `font-display-serif` | `var(--font-playfair)`, Georgia, serif | **alleen Brand Mode-display ≥ 48px** | `tailwind.config.ts:12,52`; Playfair `layout.tsx:41` |
| `font-playfair` | idem | legacy-alias voor `/dagtochten` (migreert fase 5) | `tailwind.config.ts:54` |

Alle drie via `next/font` met `display: "swap"`; Playfair alleen `latin`, `style: "normal"`,
geen `weight` (variabel, één bestand) — `layout.tsx:41-46`.

**Schaal** (`fontSize`, `tailwind.config.ts:56-69`):

| Token | Grootte | Line-height | Letterspacing | Stand |
|---|---|---|---|---|
| `text-display-xl` | clamp(2.75rem, 6vw, 4.5rem) | 1.05 | -0.055em | v14, in gebruik |
| `text-display-lg` | clamp(2rem, 4vw, 3rem) | 1.1 | -0.02em | v14, in gebruik |
| `text-display-md` | clamp(1.5rem, 2.5vw, 2rem) | 1.2 | -0.01em | v14, in gebruik |
| `text-eyebrow` | 0.75rem | 1 | 0.19em | v14, in gebruik |
| `text-display-hero` | clamp(3rem, 7vw, 6.875rem) | 1 | -0.04em | §3, nog niet geadopteerd |
| `text-display-statement` | clamp(2.5rem, 5.5vw, 5.5rem) | 1.05 | -0.03em | §3, nog niet geadopteerd (footer PR 3.5) |
| `text-body-lg` | clamp(1.0625rem, 1rem + 0.25vw, 1.1875rem) | 1.6 | — | §3, nog niet geadopteerd |
| `text-meta` | 0.6875rem | 1.2 | 0.16em | §3 |
| `text-display-serif` | clamp(3rem, 7.6vw, 6.75rem) | 1.04 | -0.015em | B1, Brand Mode |

**Display-serif-regel (B1, design-specs §13f).** *Brand Mode* = niet-transactionele
merk- en redactionele koppen. Serif wél: hero-h1 "Van voordeur tot vertrekhal."
(`app/[locale]/page.tsx:306`) en de standaardkop van `NarrativePattern`
(`components/horizon/patterns.tsx:201`); later merkstatements (footer, PR 3.5). Serif
**nooit**: booking sentence, BookingSection, PaymentStep, RouteFinder, prijzen/`LedgerPattern`,
StickyCta, Button, formulieren, eyebrows/kickers, body. Alleen rechtop (geen `italic`),
draagstem 600 (`font-semibold`), echostem 400 (`font-normal text-stone-text`), ondergrens
48px op elke viewport. Uitzondering tot fase 5: `/dagtochten` (cursief + prijzen in
`font-playfair`), buiten de test.

### 1.3 Grid

| Regel | Waarde | Bron |
|---|---|---|
| Maximale breedte | `max-w-site` = 75rem | `tailwind.config.ts:83` |
| Zijmarge | `px-[5vw]` op alle viewports | `components/horizon/patterns.tsx:137` (`Viewport`), o.a. `app/[locale]/tarieven/page.tsx` |
| Kolommen | 12 (`lg:grid-cols-12`), geen token | enig gebruik `app/[locale]/page.tsx:160` |
| Horizon-lijn | `--hz-y` 62svh, ≤ 768px 56svh | `horizon.css:20,23` |

Spec (§13a) noemt een mobiele gutter van 16px; die bestaat niet in code — zie §6.

### 1.4 Spacing

Tailwinds standaard 4-px-schaal; `tailwind.config.ts` definieert geen eigen `spacing`.
Sectieritme in code: `py-16` (64px) → `md:py-24` (96px), bv. `app/[locale]/tarieven/page.tsx`.
De derde stap 128px (`py-32`) uit §13a wordt nergens gebruikt — zie §6. Witruimte
tussen statements: `Breath` = 22svh (`patterns.tsx:152`).

### 1.5 Radius

| Token | Waarde | Gebruik | Bron |
|---|---|---|---|
| `rounded-field` | 14px | formuliervelden | `tailwind.config.ts:81` |
| `rounded-card` | 24px | cards | `tailwind.config.ts:78` |
| `rounded-card-lg` | 30px | legacy (1 gebruik) | `tailwind.config.ts:79` |
| `rounded-fleet` | 34px | legacy vlootkaarten (2 gebruiken) | `tailwind.config.ts:80` |

Geen nieuwe radii (§13a). Button v2 en JourneyLine hebben geen radius (behalve de punten).

### 1.6 Borders

Hairlines, 1px: `border-line` (standaard) en `border-line-strong` (nadruk, inactief kader);
in Horizon-patronen `--hz-line` / `--hz-line-soft` (§1.1). Een kader in `ink` is
voorbehouden aan Button `primary`/`secondary` (`components/ui/button-styles.ts:39,50`).

### 1.7 Elevation

| Token | Waarde | Bron |
|---|---|---|
| `shadow-card` | 0 22px 60px rgba(31,39,48,0.08) | `tailwind.config.ts:71` |
| `shadow-cta` | 0 18px 34px rgba(31,39,48,0.18) | `tailwind.config.ts:74` |
| `shadow-card-lg` | 0 28px 90px rgba(31,39,48,0.10) | `tailwind.config.ts:72` (legacy) |
| `shadow-hero-card` | 0 30px 90px rgba(31,39,48,0.14) | `tailwind.config.ts:73` (legacy) |
| `shadow-nav` | 0 12px 34px rgba(31,39,48,0.08) | `tailwind.config.ts:75` (legacy) |

Doel §13a: maximaal twee niveaus, `card` en `cta`. De drie overige bestaan en zijn in
gebruik — zie §6. Geen schaduw-stapels (§5b). Button v2 heeft geen schaduw.

### 1.8 Iconografie

Eén set: `components/ui/Icon.tsx` — inline SVG, 24×24 viewBox, `stroke="currentColor"`,
`strokeWidth="1.75"`, round caps/joins, altijd `aria-hidden` (`Icon.tsx:235-264`),
standaardgrootte 20. Geen nieuwe set (§5b). Spec noemt 1,5px stroke — zie §6.

---

## 2. Componenten

Alleen wat in code bestaat heeft een contract. Status per component uit §13a:

| Component | Status | Waar |
|---|---|---|
| Button (incl. Link/TextAction als `variant="text"`) | **gebouwd** (v2), nog nergens geadopteerd | `components/ui/Button.tsx`, `button-styles.ts` |
| JourneyLine | **gebouwd**, nog nergens geadopteerd | `components/horizon/JourneyLine.tsx` |
| AddressAutocomplete | bestaat (v14), nog geen 2.0-contract; ARIA-combobox | `components/shared/AddressAutocomplete.tsx:270` |
| Input / Select (boekingszin) | bestaat als CSS (`.hz-blank`, `.hz-time`, `.hz-focus`), geen component | `horizon.css:102-154` |
| PriceDisplay | nog niet gebouwd; prijs nu via `Odometer` | `components/horizon/motion.tsx:87` |
| Header | bestaat (v14); 2.0-spec §13c nog niet gebouwd | `components/sections/Header.tsx:19` |
| Footer | bestaat (v14); 2.0-spec §13c nog niet gebouwd | `components/sections/Footer.tsx:30` |
| DatePicker (native in sheet) | nog niet gebouwd | — |
| VehiclePlate | nog niet gebouwd; voorganger `FleetPlate` (lokaal in de homepage) | `app/[locale]/page.tsx:96` |
| TrustItem | nog niet gebouwd | — |
| Sheet (`<dialog>`) | nog niet gebouwd | — |
| Toast | nog niet gebouwd | — |

### 2.1 Button v2

Eén knop voor heel 2.0; drie varianten, geen andere knopstijlen (§5b, §13e).

**Anatomie.** Polymorf: met `href` een link (interne paden via de locale-bewuste `Link`;
`tel:`, `mailto:`, `https:`, `#…`, `//…` als gewone `<a>` — `isPlainHref`,
`button-styles.ts:114`), zonder `href` een `<button type="button">`. Label in `<span>`,
optionele pijl `→` in `aria-hidden`-span (`Button.tsx:46-57`).

**API** (`Button.tsx:23-44`): `variant` `"primary" | "secondary" | "text"` (standaard
`primary`), `size` `"md" | "lg"` (standaard `md`), `fullWidth`, `arrow` (standaard aan bij
`text`), `className`; alleen als `<button>`: `loading`, `disabled`, `type`.

| Variant | Rust | Hover / focus-visible / active | Gebruik (§13e) |
|---|---|---|---|
| `primary` | gevuld: `bg-ink text-fog`, kader ink (13,64:1) | vulling links→rechts in `accent-light` (8,71:1), `scaleX` op `--hz-ui` | primaire boekingsactie |
| `secondary` | omlijnd: kader ink, `text-ink` (13,64:1) | lichte vulling `overlay` (12,61:1) | bellen, WhatsApp, terug, meer info |
| `text` | `text-ink`, geen kader | onderstreping links→rechts op `--hz-micro`, pijl 4px (`translate-x-1`) | inline/tertiair |

Bron: `button-styles.ts:34-65,85-86`.

**States.** Focus-visible: ink-outline 2px, offset 2px (`button-styles.ts:30`). Disabled
en loading vervangen de variantklassen: primary `bg-overlay text-stone-text` + kader
`line-strong` (4,86:1); secondary/text `text-stone-text` (5,26:1); nooit `text-stone`
(`button-styles.ts:78-82`). Loading = `disabled` + `aria-busy`, label blijft, geen spinner
(`Button.tsx:92-97`). Er is geen error-state.

**Maten** (`button-styles.ts:67-72`): `md` `px-7 py-3 text-[12px]`; `lg` `min-h-[52px] px-10
py-4 text-[13px]`; `text` `px-1`. Alle varianten `min-h-11` (44px).

**Regels.** Maximaal één `primary` per scherm of sectie; omlijnd is uitsluitend
`secondary`; geen `-translate-y`, geen `scale`, geen schaduw; `:active` toont de hover-
vulling (touch); reduced motion = geen transitie (`motion-reduce:*`). Op donkere
achtergrond eerst een lichte focusring toevoegen (nog niet nodig).

### 2.2 JourneyLine

A → B als één hairline met begin- en eindpunt; werkwoord *Travel* (masterplan §4).
Server-renderbaar, geen hooks; beweging in `components/horizon/journey-line.css`.

**API** (`JourneyLine.tsx:23-39`): `state` (verplicht) `"empty" | "origin" | "route" |
"travelling" | "arrived"`; `from`, `to`, `fromMeta`, `toMeta`; `orientation`
`"horizontal" | "vertical"` (standaard horizontal); `size` `"micro" | "inline" |
"display"` (standaard inline; `micro` toont geen tekst); `decorative`; `label`; `className`.

**Toestanden** (`lib/horizon/journey-line-view.ts:26-32`):

| `state` | Lijn | Vertrek | Bestemming |
|---|---|---|---|
| `empty` | 0 | ○ | ○ |
| `origin` | 50% | ● | ○ |
| `route` | 100% | ● | ○ |
| `travelling` | 100% + 6px-punt reist 600ms | ● | ○ → ● |
| `arrived` | 100% | ● | ● |

`state` komt uit `journeyStateFor` → `journeyTransition` (`lib/horizon/journey-line-state.ts`);
`arrived` alleen bij een backend-bevestigde quote (`status: "ready"` mét `quoteId`).

**Maatvoering** (`journey-line.css:16-35`): punt 7px (`micro` 6px, `display` 9px),
reiziger 6px, minimale lijnlengte 3rem (`micro` 1.5rem, `display` 5rem); namen 0.6875rem
uppercase 0.16em ink, meta 0.6875rem tabular `stone.text`. Lijn via `scaleX`/`scaleY`, nooit
`width`.

**A11y.** Standaard `role="img"` + `aria-label` ("Route van X naar Y", of vertaald via
`label`; `journeyLineLabel`, `journey-line-view.ts:47`); `decorative` → `aria-hidden`
(gebruik als de route al als tekst ernaast staat). Reduced motion: direct eindstaat,
geen reizend punt (`journey-line.css:173-177`).

---

## 3. Patterns

| Pattern | Implementatie | Status |
|---|---|---|
| Booking sentence | `SentencePattern` — `components/horizon/patterns.tsx:276` | v1; 2.0 in PR 2.1 / 2.6 |
| Price calculation | `useRouteQuote` (`components/shared/useRouteQuote.ts`) → `/api/pricing/quote`; weergave `Odometer` (`patterns.tsx:542`) | v1; quote-lock is invariant (masterplan §1) |
| Checkout | `components/booking/BookingSection.tsx`, `PaymentStep.tsx` | v1; stappenweergave PR 2.4 |
| Confirmation | nog niet gebouwd (PR 2.5, masterplan §8); statusbron `lib/bookings/lifecycle.ts` (`BOOKING_STATUSES`) | — |
| Error (inline, focus naar eerste fout) | nog niet gebouwd als patroon (PR 2.4) | — |
| Empty | nog niet vastgelegd | — |
| Loading (skeleton, geen spinner op prijs) | nog niet gebouwd; Button `loading` = `aria-busy` zonder spinner | — |
| Dashboard (utility, geen editorial motion) | `components/dashboard/` | v14 |
| Ledger | `LedgerPattern` — `patterns.tsx:593`, CSS `horizon.css:190-191` | in gebruik |
| Narrative | `NarrativePattern` — `patterns.tsx:160` | in gebruik |
| Editorial figure | `EditorialFigure` — `patterns.tsx:643`, `.hz-frame` `horizon.css:194-206` | in gebruik |
| Viewport / Breath / Spine | `patterns.tsx:109,152,65` | in gebruik |
| Vows / Proof | `patterns.tsx:694,718` | in gebruik; Vows wordt "Service principles" (PR 3.1) |

---

## 4. Motion

Alle beweging is één van vijf werkwoorden van de Horizon Motion Engine
(`components/horizon/motion.tsx`, `horizon.css`). Een animatie die geen werkwoord is,
wordt niet gebouwd. Geen motion-dependency (masterplan §10).

| Werkwoord | Betekenis | Code |
|---|---|---|
| Reveal | content stijgt op naar de lijn (enter) | `Reveal` (`motion.tsx:27`), `.hz-reveal` (`horizon.css:59-72`) |
| Travel | iets beweegt langs de horizon (ambient) | `.hz-spine`, `.hz-travel-*` (`horizon.css:27-52`); JourneyLine |
| Guide | richting bij hover/focus | `.hz-guide-line`, `.hz-guide-arrow`, `.hz-guide-space` (`horizon.css:75-99`); Button `text` |
| Focus | aandacht bij interactie | `.hz-focus` (`horizon.css:102-106`) |
| Confirm | voltooide handeling bevestigt zich | `Odometer` (`motion.tsx:87`), `.hz-confirm-*` (`horizon.css:157-187`) |

**Tokens.** Eén easing, vijf tempo's (§5) plus één bestaande alias:

| Token | Waarde | Gebruik | Bron |
|---|---|---|---|
| `--hz-ease` | cubic-bezier(0.22, 1, 0.36, 1) | de enige easing (chauffeur-curve) | `horizon.css:11` |
| `--hz-micro` | 160ms | hover, underline, pijl, toggles | `horizon.css:12` |
| `--hz-ui` | 280ms | sheets, stapwissel, header-shrink; Button-vulling | `horizon.css:13` |
| `--hz-immediate` | 240ms | bestaande Guide/Focus-klassen; staat niet in §5 | `horizon.css:14` |
| `--hz-composed` | 700ms | koppen, foto-reveal | `horizon.css:15` |
| `--hz-cinematic` | 1100ms | alleen spine-draw en bevestiging | `horizon.css:16` |
| `--hz-ambient` | 6000ms | vloot-drift, spine; onmerkbaar | `horizon.css:17` |

Tailwind-alias met dezelfde fallback (`tailwind.config.ts:87-96`): `ease-premium`,
`duration-micro`, `duration-ui`, `duration-composed`, `duration-cinematic`,
`duration-ambient` (geen alias voor `--hz-immediate`). `lib/design/tokens.test.ts` bewaakt
de gelijkheid. Componentvariabelen: JourneyLine `--jl-run` 600ms (§4,
`journey-line.css:25`).

**Reduced motion per component.** Reveal, spine, Travel-tick, odometer, guide-line,
guide-arrow, confirm-btn: direct eindstaat (`horizon.css:209-216`); `Odometer` slaat de
rol over (`motion.tsx:95`); Button: `motion-reduce:transition-none`
(`button-styles.ts:31,44,55,63,86`); JourneyLine: eindstaat zonder reiziger
(`journey-line.css:173-177`). Zonder JavaScript is alle content zichtbaar: de
Reveal-startstaat geldt alleen onder `html.js` (`horizon.css:54-62`); `Reveal immediate`
voor inhoud boven de vouw (`motion.tsx:37-42`).

**Nog niet gebouwd** (spec §3/§5): `Reveal`-prop `distance` (12/20/26px), `useStagger`,
hero-choreografie (PR 1.4), `.hz-route-*`-klassen, cursor-label.

**Verboden** — de volledige lijst staat in masterplan §5b (reviewchecklist). Kern: geen
gradients/glow/noise buiten `.hz-frame`; geen glass cards; geen bounce/spring, geen
`scale > 1.02`, geen scroll-hijack, geen parallax buiten de vloot, geen sitebrede custom
cursor, geen animated counters (Odometer op prijs is Confirm en blijft), geen autoplay-
video boven de vouw of op mobiel; geen conversietrucs (live-kijkers, countdowns,
nep-doorgestreepte prijzen, voorgeselecteerde extra's); geen carousels voor essentiële
info; geen AI-chatbubble; max. 3 knopstijlen (= Button v2); geen 3D-auto, stock- of
AI-beeld als echte service.

---

## 5. Voice

| | Tekst | Waar | Bron |
|---|---|---|---|
| Merkprincipe (hoe T4XI zich gedraagt) | **"Precisie zonder vertoon."** | intern, documentenset, over-ons | B4; `messages/nl.json:941` |
| Consumententagline (wat de klant ervaart) | **"Arrive composed."** | footer, EN-hero, JSON-LD `slogan` | B4; `messages/nl.json:28`, `messages/en.json:28,1458`, `app/[locale]/layout.tsx:80` |

"Arrive with confidence" bestaat niet meer op site- en SEO-oppervlakken
(`lib/design/tokens.test.ts`). Copy staat in `messages/*.json`.

**Klanttaal per bookingstatus.** INQUIRY ≠ CONFIRMED: geen tekst laat een aanvraag als
bevestiging lezen; website, e-mail, WhatsApp en admin delen één statuscontract
(masterplan §0b). De statussen zijn `lib/bookings/lifecycle.ts` (`inquiry`, `quoted`,
`confirmed`, `assigned`, `in_progress`, `completed`, `cancelled`); de klanttaal-mapping
voor het scherm is nog niet gebouwd (PR 2.5). Betaling ≠ vervoersbevestiging.

**Claims-check (masterplan §0c, verplicht bij elke copy-wijziging).** Een claim zonder
status *Approved* komt niet op de site.

| Claim | Toegestaan |
|---|---|
| Vaste prijs vooraf | ja |
| "Uw vlucht wordt gevolgd" | alleen conditioneel ("bij luchthavenritten met vluchtnummer"), pas na activatie in prod |
| "Uw chauffeur wacht" | nee, tot wachttijdvoorwaarden gepubliceerd zijn (B7) |
| "24/7" | nee, of alleen "24/7 te boeken" |
| Reviewscore | nee (geen verifieerbare bron) |
| Business account / maandfactuur | nee als functie; wel "bespreek facturatie" |
| Specifiek automodel bij bevestiging | nee; voertuigklasse |

Primaire CTA beschrijft wat er gebeurt ("Vraag deze rit aan", "Betaal en vraag aan").

---

## 6. Open afwijkingen

Tegenstrijdigheden tussen specificatie en code, of binnen de code. Niet opgelost in
PR 1.5; elk punt wordt een besluit of een eigen PR.

1. **Gutter mobiel.** §13a: "gutter `5vw` / 16px mobiel". Code: `px-[5vw]` op alle
   breedtes (`patterns.tsx:137`); geen 16px-regel.
2. **Sectieritme 128.** §13a: 64/96/128. Code: alleen 64/96 (`py-16 md:py-24`); `py-32`
   komt nergens voor.
3. **12 kolommen** is geen token of utility; één gebruik (`app/[locale]/page.tsx:160`).
4. **Elevation.** §13a: max. twee niveaus (`card`, `cta`). Code: vijf schaduwtokens,
   alle in gebruik (`tailwind.config.ts:71-75`).
5. **Radius.** §13a: field 14 + card 24, "geen nieuwe". Code heeft ook `card-lg` 30px en
   `fleet` 34px (in gebruik). Daarnaast verbiedt §5b "`rounded-3xl`+ op contentkaarten",
   terwijl `rounded-card` (24px) gelijk is aan `rounded-3xl`.
6. **Icon-stroke.** §13a: 1,5px. Code: `strokeWidth="1.75"` (`Icon.tsx:253`); de
   headercommentaar van `Icon.tsx:2` zegt "stroke 2".
7. **Hardgecodeerde duren in `horizon.css`** buiten de tokens: travel-tick 160ms linear
   (`:50`), guide-line 420ms (`:84`), guide-space 300ms (`:98`), odometer 850ms (`:167`),
   confirm-btn 350ms (`:177,184`), reveal-vertraging 90/180/270ms (`:70-72`). Spec §5
   zegt "vijf tempo's".
8. **Reveal-afstand.** §5: foto-reveal 12–20px; §3: `distance` 12/20/26px. Code: vast 26px
   (`horizon.css:61`), geen `distance`-prop.
9. **`--hz-immediate` (240ms)** staat niet in §5 en wordt nog door Guide/Focus gebruikt;
   §3 noemt het een alias, maar het is een eigen waarde (tussen micro en ui).
10. **Button-vulling en `.hz-confirm-btn`.** §3: primary "hergebruik `.hz-confirm-btn`,
    richting links→rechts". Code: Button v2 heeft een eigen `scaleX`-vulling
    (`button-styles.ts:38-45`); `.hz-confirm-btn` vult nog van onder (`scaleY`,
    `horizon.css:172-187`) en wordt in geen enkele `.tsx` gebruikt.
11. **Hover-tempo Button.** §5 koppelt hover aan `--hz-micro`; de primary/secondary-
    hovervulling loopt op `--hz-ui` 280ms (`button-styles.ts:41,52`). §13e noemt geen duur.
12. **Hero-h1 gebruikt het serif-token niet.** §13f: "één token: `text-display-serif`"
    (line-height 1.04). De hero zet een eigen clamp (48→108px, md 48→112px) met
    `leading-[1.02]` (`app/[locale]/page.tsx:306`).
13. ~~**Verouderde verwijzing.**~~ Opgelost in PR 1.5: `app/[locale]/layout.tsx:37` verwijst
    nu naar design-specs §13f.
14. **Dubbele kleurwaarden.** `accent.DEFAULT` = `ink.soft` (#28313B), `accent.hover` =
    `ink.DEFAULT` (#1F2730), `secondary` = `stone.text` (#5F666D). Geen fout, wel drie
    namen voor twee waarden.
