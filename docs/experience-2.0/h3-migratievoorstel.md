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
| `bookings.payment_started_at` | **nieuw** | Moment waarop de boeking voor het eerst een PaymentIntent kreeg (= betaalstart) | `link_booking_payment`, alleen als er nog geen PI op de boeking stond | herkoppeling verandert het niet; boekingen met een PI van vóór de migratie houden NULL |

**Invariant (afgedwongen):** constraint `bookings_source_quote_matches_lock`
`check (quote_id is null or source_quote_id is null or source_quote_id = quote_id)`.

Precies wat dit garandeert:
- Als **beide** gevuld zijn, wijzen ze naar dezelfde quote. Een afwijkende combinatie wordt
  door de database geweigerd, bij insert én update.
- `source_quote_id` **mag ontbreken**, ook als `quote_id` gevuld is: de attributie is
  best-effort en wordt ná het aanmaken gezet. De database dwingt aanwezigheid dus **niet**
  af. Omdat een CHECK bij NULL slaagt, staan beide NULL-gevallen expliciet in de expressie
  zodat de bedoeling leesbaar is.
- Ontbrekende attributie wordt **gerapporteerd** (§7), niet stil gecorrigeerd. Er is geen
  `coalesce`-trigger: die zou een al ingevulde afwijkende waarde niet corrigeren en een
  ontbrekende waarde maskeren.

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
  `service_role`), servertijd (`pg_catalog.now()`), en **alleen bij een nieuwe koppeling**
  (`v_existing_pi is null`). Retries met dezelfde PaymentIntent veranderen het tijdstip
  niet. Een historische boeking die al een PI had maar geen starttijd, krijgt bij een
  herhaalde koppeling **geen** starttijd (anders zou "nu" als historisch moment gelden).
  `pi_conflict`, `already_paid` en `no_price` raken de kolom niet.
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

- **A. Invariant:** verwerkt als "gelijk als beide gevuld, attributie mag ontbreken" (§1).
  Aanwezigheid afdwingen zou `create_booking_from_snapshot` moeten wijzigen en valt buiten H-3.
- **B. Akkoord op de aparte kolom `source_quote_id`.**
- **C. Akkoord op de wijziging van `link_booking_payment`** (betaalpad, één regel).
- **D. Rest van F-04** (`pricing_quote_logs` zonder quote-id; geen surface/locale/sessie):
  apart voorstel.

## 7. Ontbrekende attributie rapporteren

Na toepassing telt de server-truth-rapportage (0.4a) expliciet:

```sql
select count(*) filter (where quote_id is not null and source_quote_id is null) as lock_zonder_attributie,
       count(*) filter (where quote_id is null and source_quote_id is not null) as aanvraag_met_attributie,
       count(*) filter (where stripe_payment_intent_id is not null and payment_started_at is null) as betaling_zonder_starttijd
from public.bookings;
```

`lock_zonder_attributie > 0` betekent dat de best-effort-update faalde; de app logt dan een
PII-vrije foutcode. Dit wordt een finding, geen automatische correctie. De 0.4a-uitbreiding
volgt pas ná toepassing van de migratie (de kolommen bestaan nu niet).

## 8. Verificatie

- **Unit-tests** (`lib/bookings/quote-link.test.ts`, 15/15): o.a. functietekst identiek aan
  het origineel op de ene betaalstartregel na, de exacte CHECK-expressie, geen unieke index,
  lock-RPC ongemoeid.
- **Uitgevoerd in een echte Postgres** (PGlite, eenmalig buiten de repo; schema van
  `20260724120000` + deze migratie, 2× toegepast) — 12/12 geslaagd:
  idempotent · backfill lock → attributie · eerste nieuwe koppeling zet starttijd en
  `pending` · herhaalde koppeling zelfde PI laat starttijd ongewijzigd · **historische
  boeking met PI zonder starttijd + herhaalde koppeling → starttijd blijft NULL** ·
  `pi_conflict` wijzigt niets · `already_paid` · invariant weigert afwijkende combinatie en
  staat NULL-gevallen en gelijke waarden toe · rechten alleen `service_role`.
- **Controle op de test zelf:** met de eerdere versie (`coalesce` zonder voorwaarde) faalt
  het historische scenario. Die fout zat in het eerste voorstel en is hiermee hersteld.
- Nog niet uitgevoerd: staging (§4). Dit is geen uitvoeringsakkoord.
