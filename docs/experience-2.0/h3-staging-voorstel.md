# H-3 — Stagingvoorstel (één besluit)

Status: **voorstel, niets uitgevoerd.** Stand 08-10-2026. Alleen staging
(`ztlhydagjqfzkyfiqgio`, ACTIVE_HEALTHY). Productie valt hier buiten.

## 1. Uitgangssituatie (read-only vastgesteld)

| | Staging | Productie |
|---|---|---|
| Laatste migratie in ledger | `20260912130000` | `20260925122616` |
| Mist t.o.v. `main` | `20260925121211`, `20260925121843`, `20260925122616`, `20260928120000` | `20260908120000` … `20260912130000` (Control, bekend S8), `20260928120000` (F-23) |
| `fixed_route_prices` | 47 | 89 |
| bookings | 1 | 10 |
| `source_quote_id` / `payment_started_at` | afwezig | afwezig |
| `link_booking_payment` | logica gelijk aan productie en aan `20260724120000`; alleen commentaarregels verschillen | — |

De ledgers lopen dus in **beide richtingen** uiteen. H-3 heeft alleen `20260724120000`
nodig, en die staat op staging.

Over de vier ontbrekende migraties:
- De drie van **25-09** werken op hard-coded `fixed_route_prices.id`; die id's bestaan
  buiten productie niet. Op staging wijzigen ze **0 rijen** en zijn ze alleen een
  ledgerregel.
- **`20260928120000` (canonical baseline)** zet de vaste routetarieven via
  `on conflict` gelijk aan productie per 28-09. Op staging is dat wél een
  **tariefwijziging**: van 47 naar 89 routes, met mogelijk gewijzigde bedragen.

## 2. Voorstel: optie A (aanbevolen) — alleen H-3

1. Toepassen: **`20261006150000_h3_booking_quote_source_and_payment_start.sql`**, en
   niets anders. Geen tariefwijziging.
2. Controles (alleen testdata op staging; geen echte boeking of betaling):
   1. Schema: beide kolommen aanwezig, FK en partiële index aanwezig, CHECK
      `bookings_source_quote_matches_lock` aanwezig, rechten op
      `link_booking_payment` alleen `service_role`.
   2. Backfill: aantal rijen met `quote_id` vóór en na gelijk; `source_quote_id`
      overal gelijk aan `quote_id` waar die gevuld is.
   3. Via de preview (staging + Stripe-testmodus): één lock-boeking met getoonde prijs
      → `quote_id` en `source_quote_id` gelijk. Eén aanvraag met handmatige
      bagagereview na getoonde prijs → alleen `source_quote_id` gevuld.
   4. Testbetaalstap starten (Stripe-testkaart, niet afronden is voldoende) →
      `payment_started_at` gezet, status `pending`. Pagina herladen (zelfde
      PaymentIntent) → tijdstip ongewijzigd.
   5. Return-codes `link_booking_payment` voor `pi_conflict`, `already_paid`,
      `no_price`: gelijk aan vóór de migratie (op een testboeking).
   6. Telling uit `h3-migratievoorstel.md` §7 draait foutloos.
3. `lib/types/database.ts` opnieuw genereren, als aparte commit in #54.
4. Verwijderen van de testboekingen uit stap 2 op staging (alleen die rijen, op id).

**Herstel (forward-only, staging):**
- Functie terug: de `create or replace` van `link_booking_payment` uit
  `20260724120000` opnieuw uitvoeren (zelfde signature, rechten blijven).
- Kolommen weg: `drop index if exists public.bookings_source_quote_id_idx;` en
  `alter table public.bookings drop constraint if exists bookings_source_quote_matches_lock,
  drop constraint if exists bookings_source_quote_id_fkey,
  drop column if exists source_quote_id, drop column if exists payment_started_at;`
- De app in #54 verdraagt beide toestanden; terugdraaien van code is niet nodig.
- Staging heeft geen backups/PITR (free tier); de stappen hierboven zijn het herstel.

## 3. Optie B — staging eerst gelijktrekken (apart tariefbesluit)

Vóór optie A ook de vier ontbrekende migraties op staging, in versievolgorde.
Gevolg: staging-preview rekent met de productietarieven van 28-09 (89 routes).
Dit is een **tariefwijziging op staging** en daarom bewust een apart besluit.
Herstel: geen (er is geen vorige tarieftoestand vastgelegd); vooraf een
read-only export van `fixed_route_prices` op staging maken als referentie.

## 4. Niet in dit voorstel

- Productie: H-3-migratie, `20260928120000` en de Control-migraties.
- Merge van #54: pas na geslaagde stagingcontroles en de types-commit.
