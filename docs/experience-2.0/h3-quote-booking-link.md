# H-3 — Quote → booking → betaling meetbaar maken

Herstel-PR voor findings **F-04** (koppeling quote ↔ booking, betaalstart) en **F-05**
(`logQuote` negeert insertfouten). **B8 (analyticsprovider) blijft open**: geen provider,
geen client-tracking. F-03 valt daardoor buiten deze PR.

## Boekingspaden (`POST /api/bookings`)

| Pad | Wanneer | RPC | `quote_id` (lock) | `source_quote_id` (nieuw) |
|---|---|---|---|---|
| `snapshot_lock` | gevalideerde `quoteId`, bindende bagage | `create_booking_from_snapshot` | ja (RPC, ongewijzigd) | ja (= `quote_id`) |
| `quote_on_request_review` | gevalideerde `quoteId`, maar bagage vraagt handmatige review (`overleg`, of 3 koffers bij > 3 personen) | `create_booking` (prijs leeg) | nee | **ja**: de getoonde quote |
| `fixed_route_without_quote` | geen `quoteId` (oude client/API-aanroeper), vaste route | `create_booking` (met prijs) | nee | nee: er bestaat geen snapshot |
| `on_request` | geen prijs beschikbaar | `create_booking` (prijs leeg) | nee | nee: er bestaat geen snapshot |

De afleiding staat in `lib/bookings/quote-link.ts` (`resolveQuoteLink`, puur en getest).
`source_quote_id` wordt alleen gevuld met een `quoteId` die `resolveBookingPrice` al heeft
gevalideerd (bestaat, niet verlopen, geldige bron, vingerafdruk klopt), nooit met rauwe
clientinvoer.

De huidige webclient (`BookingSection`) stuurt altijd een `quoteId` mee zodra er een prijs
is getoond. Op de paden zonder snapshot valt niets te koppelen: daar heeft de klant nooit
een prijs-snapshot gezien. Een heuristische koppeling op tijd en invoer is bewust niet gedaan.

### Waarom een aparte kolom en niet `quote_id`

`bookings.quote_id` hoort bij de quote-lock. Er staat een partiële unieke index op
(`bookings_quote_id_key`) en `create_booking_from_snapshot` zet hem. Vul je `quote_id` op
het aanvraagpad, dan loopt een latere geldige lock-boeking op dezelfde snapshot (klant past
de bagage aan en boekt binnen 15 minuten opnieuw) tegen die index. De RPC faalt dan en de
klant krijgt een 500. Dat zou de quote-lock veranderen. Daarom is attributie
(`source_quote_id`, zonder unieke index) gescheiden van de lock (`quote_id`).

## Wat er verandert

- `app/api/bookings/route.ts`: na de prijsbepaling `resolveQuoteLink(...)`; na het aanmaken
  van de boeking een best-effort `persistSourceQuoteId(...)`. Lock-beslissing, RPC-parameters,
  prijs, statuscodes en response zijn ongewijzigd.
- `lib/bookings/quote-link.ts`: padafleiding plus best-effort update. Gooit nooit. Een
  ontbrekende kolom (`PGRST204`/`42703`) geeft één PII-vrije waarschuwing per proces.
- `lib/pricing/service.ts` (F-05): `logQuote` controleert nu `{ error }` van de insert, en de
  fire-and-forget `.catch` logt in plaats van stil te slikken. Er wordt alleen de fase en een
  foutcode of foutnaam gelogd, geen invoer, adressen of ruwe PostgREST-melding. De offerte
  wordt nog steeds nooit geblokkeerd. Zonder service-role key wordt de insert nog steeds stil
  overgeslagen (ongewijzigd).
- Betaalstart: geen app-wijziging. Het tijdstempel wordt in de database gezet (zie migratie).

## Migratievoorstel (vereist akkoord eigenaar)

`supabase/migrations/20261006150000_h3_booking_quote_source_and_payment_start.sql`. Niet
toegepast op staging of productie.

1. `bookings.source_quote_id uuid null`, FK naar `price_snapshots(quote_id)` met
   `on delete set null`, en een partiële index. Backfill: `source_quote_id := quote_id` waar
   een lock bestaat.
2. `bookings.payment_started_at timestamptz null`. Geen backfill: het historische moment is
   niet af te leiden.
3. `link_booking_payment`: dezelfde functie, met als enige extra regel
   `payment_started_at` in de bestaande UPDATE, alleen gezet bij een nieuwe koppeling (nog
   geen PI op de boeking). Retries met dezelfde PaymentIntent veranderen het niet, en een
   historische boeking met PI maar zonder starttijd blijft NULL (zie
   `h3-migratievoorstel.md` §2 en §8). Signature, return-codes, de overgang `unpaid → pending`, de guards en de
   rechten blijven gelijk. Een test vergelijkt de functietekst met het origineel. De
   productiedefinitie (read-only opgevraagd op 2026-10-06) is gelijk aan het
   repo-origineel.

Additief en idempotent. Alleen het aanvullen van `source_quote_id` schrijft naar bestaande
rijen. De rollback staat in de header van het bestand. Forward-only heeft de voorkeur.

### Volgorde van uitrol

| Toestand | Gedrag |
|---|---|
| Code live, migratie niet | Boekingen werken zoals nu. `source_quote_id` wordt overgeslagen met één waarschuwing. Er komt geen `payment_started_at`. |
| Migratie toegepast, code niet | `payment_started_at` wordt gevuld. `source_quote_id` alleen via de backfill. |
| Beide | Volledige meting. |

Na toepassen: `lib/types/database.ts` opnieuw genereren. Die is bewust niet handmatig
aangepast.

## Hoe 0.4a dit straks meet

- **Quote → booking:** bookings met `coalesce(source_quote_id, quote_id)` gevuld, gedeeld door
  het aantal `price_snapshots` (of unieke fingerprints) in dezelfde week. Splits op `quote_id`
  (bindend geboekt) en "alleen `source_quote_id`" (prijs gezien, als aanvraag geboekt).
- **Booking → betaalstart:** `payment_started_at is not null`. Voor rijen van vóór de migratie
  geldt `stripe_payment_intent_id is not null` als vervanger, zonder tijdstempel.
- **Betaalstart → betaald:** `payment_status = 'paid' and paid_at is not null`. Doorlooptijden:
  `payment_started_at − created_at` en `paid_at − payment_started_at`.
- **Quote-logverlies (F-05):** zichtbaar als `[pricing] quote-log niet opgeslagen`-regels in
  de Vercel-logs, niet in de database.

## Risico's en wat open blijft

- Eén extra UPDATE per boeking met een quote. Die is best-effort en awaited, met
  verwaarloosbare latency bij het huidige volume. Een fout breekt de boeking niet.
- `source_quote_id` kan op meerdere bookings dezelfde quote dragen, bijvoorbeeld een aanvraag
  en daarna een lock-boeking. Dat is bedoeld (geen unieke index). Tel in 0.4a op unieke quote
  als je conversie per quote wilt.
- Nog open uit F-04: `pricing_quote_logs` heeft geen `quote_id`, en er zijn geen kolommen voor
  surface, locale of sessie. Snapshots blijven de quote-bron voor 0.4a. B8 en F-03 blijven
  ook open.
