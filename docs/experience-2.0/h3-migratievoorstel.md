# H-3 — Migratievoorstel `20261006150000` (ter beoordeling)

Status: **voorstel, niet toegepast.** Vereist akkoord eigenaar. Stand 07-10-2026.
Bestand: `supabase/migrations/20261006150000_h3_booking_quote_source_and_payment_start.sql`.

## 1. Betekenis naast de bestaande quotevelden

| Veld | Bestaat | Betekenis | Gezet door | Beperkingen |
|---|---|---|---|---|
| `price_snapshots.quote_id` | ja | Identiteit van een opgeslagen quote (prijs + ritgegevens + vingerafdruk) | `create_price_snapshot` bij elke getoonde prijs | uniek |
| `bookings.quote_id` | ja | **Prijs-lock**: de snapshot waarvan het bedrag bindend is voor deze boeking | uitsluitend `create_booking_from_snapshot` | FK → `price_snapshots`, `on delete set null`; partiële **unieke** index `bookings_quote_id_key` (één boeking per lock) |
| `bookings.source_quote_id` | **nieuw** | **Attributie**: de quote die de klant zag toen hij de boeking indiende — ook als de boeking daarna een aanvraag werd (handmatige bagagereview) | app (`lib/bookings/quote-link.ts`), best-effort na het aanmaken | FK → `price_snapshots`, `on delete set null`; **geen** unieke index; partiële index |
| `pricing_quote_logs` | ja | Log van elke prijsberekening (ook niet-opgeslagen) | `logQuote` | heeft **geen** quote-id; blijft buiten dit voorstel (rest van F-04) |
| `bookings.stripe_payment_intent_id`, `payment_status`, `paid_at` | ja | Betaalkoppeling en -status | `link_booking_payment`, webhook | ongewijzigd |
| `bookings.payment_started_at` | **nieuw** | Moment van de **eerste** succesvolle koppeling van een PaymentIntent aan de boeking (= betaalstart) | `link_booking_payment` | nooit overschreven (`coalesce`) |

**Invariant:** als `quote_id` gevuld is, hoort `source_quote_id` gelijk te zijn. Op het lock-pad
zet de app beide; de backfill maakt bestaande rijen gelijk. De invariant wordt in dit voorstel
**niet** door de database afgedwongen (zie §6, keuze A).

**Waarom niet `quote_id` hergebruiken:** door de unieke index zou een aanvraag-boeking met
`quote_id` een latere geldige lock-boeking op dezelfde quote laten falen. Dat verandert de
quote-lock, en dat mag H-3 niet.

## 2. Validatie

- **Herkomst:** `source_quote_id` komt uitsluitend uit een quote die `resolveBookingPrice` al
  server-side heeft gevalideerd (bestaat, niet verlopen, geldige bron, vingerafdruk past bij
  de ingediende rit). Ruwe clientinvoer komt er nooit in (`resolveQuoteLink`, unit-tests).
- **Referentiële integriteit:** FK naar `price_snapshots(quote_id)`; een niet-bestaande quote
  kan niet worden opgeslagen.
- **Meervoudigheid bewust toegestaan:** meerdere boekingen mogen naar dezelfde quote wijzen
  (bv. eerst een aanvraag, later een lock-boeking). Daarom geen unieke index.
- **`payment_started_at`:** alleen via `link_booking_payment` (security definer, alleen
  `service_role`), servertijd (`pg_catalog.now()`), eerste koppeling wint. Retries met
  dezelfde PaymentIntent veranderen het tijdstip niet; `pi_conflict`, `already_paid` en
  `no_price` raken de kolom niet.
- **`link_booking_payment` verder identiek:** signature, return-codes, statusovergang
  `unpaid → pending`, guards, `search_path` en rechten zijn gelijk aan `20260724120000`. Een
  test vergelijkt de functietekst regel voor regel met het origineel; de H-3-agent heeft
  read-only vastgesteld dat de productieversie gelijk is aan dat origineel.

## 3. Bestaande records (productie, read-only, 07-10-2026)

| Telling | Aantal | Gevolg |
|---|---:|---|
| bookings totaal | 10 | — |
| bookings met `quote_id` | **0** | backfill `source_quote_id := quote_id` wijzigt **0 rijen** |
| bookings met PaymentIntent | 5 | `payment_started_at` blijft **null**; het historische moment is niet afleidbaar (geen `updated_at`). 0.4a blijft die via `stripe_payment_intent_id` tellen |
| price_snapshots | 707 (vanaf 30-07-2026) | geen wijziging |
| nieuwe kolommen aanwezig | 0 | migratie is niet toegepast |

Er is geen opruimtaak voor `price_snapshots`; `on delete set null` is daarom nu theoretisch.

## 4. Uitrolvolgorde

1. **Staging** (`ztlhydagjqfzkyfiqgio`): migratie toepassen.
2. Staging-verificatie: één lock-boeking en één aanvraag-boeking met getoonde prijs →
   `source_quote_id` gevuld; betaalstart via de testbetaalflow → `payment_started_at` gezet,
   tweede koppeling met dezelfde PI → tijdstip ongewijzigd; `link_booking_payment` geeft
   dezelfde return-codes als vóór de migratie.
3. `lib/types/database.ts` regenereren (eigen commit).
4. **Productie**: alleen na akkoord eigenaar; daarna migratieledger controleren (prod moet
   in sync blijven, zie migratie-governance).

De app-code in PR #54 werkt vóór, tijdens en na deze stappen: zonder kolom degradeert de
koppeling naar één PII-vrije waarschuwing.

## 5. Rollback

Voorkeur: **forward-only** (de kolommen zijn nullable en onschadelijk; er zijn geen backups/PITR).

- Functie terug: de `create or replace` van `link_booking_payment` uit `20260724120000`
  opnieuw uitvoeren als nieuwe migratie (zelfde signature, rechten blijven staan).
- Kolommen weg (verliest meetdata): index droppen, FK droppen, `source_quote_id` en
  `payment_started_at` droppen — exacte SQL staat in de header van het migratiebestand.
- App-code hoeft niet eerst terug: die verdraagt een ontbrekende kolom.

## 6. Open keuzes voor de eigenaar

- **A. Invariant afdwingen?** Nu niet. Alternatief: een `before insert or update`-trigger
  `source_quote_id := coalesce(source_quote_id, quote_id)`, of een CHECK
  `quote_id is null or source_quote_id = quote_id` (die CHECK vereist dan dat
  `create_booking_from_snapshot` ook `source_quote_id` zet — een wijziging aan de lock-RPC,
  dus buiten H-3).
- **B. Akkoord op de aparte kolom `source_quote_id`.**
- **C. Akkoord op de wijziging van `link_booking_payment`** (betaalpad, één regel).
- **D. Rest van F-04** (`pricing_quote_logs` zonder quote-id; geen surface/locale/sessie):
  apart voorstel.
