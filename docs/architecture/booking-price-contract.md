# Booking Price Contract

**Status:** PR 7.6.2 — centrale prijs-entrypoint geïntroduceerd (pure pass-through).
**Scope van dit document:** het runtime-contract voor klantprijzen. Geen migraties,
geen prijswijziging, geen toeslagen. Bijgewerkt zodra implementatiefeiten veranderen.

---

## 1. De centrale functie

```ts
// lib/pricing/engine.ts  (SERVER-ONLY)
calculateBookingPrice(input: BookingPriceInput, deps?): Promise<BookingPriceResult>
```

`calculateBookingPrice()` is **het enige** runtime-entrypoint voor een klantprijs.
Sinds PR 7.6.2 gebruiken beide bindende call-sites deze functie:

| Call-site | Bestand | Gebruik |
|-----------|---------|---------|
| Offerte-preview | `app/api/pricing/quote/route.ts` | `(await calculateBookingPrice(input)).quote` |
| Booking-creatie | `app/api/bookings/route.ts` | `(await calculateBookingPrice({…})).quote` → `p_price_euros` |

Er zijn geen andere runtime-callers van `getPricingQuote()` meer; alleen
`engine.ts` roept die service nog aan. Analytics/Price Brain
(`lib/pricing-brain/*`) staan buiten dit bindende pad en zijn ongemoeid gelaten.

## 2. Huidige inputs en outputs

**Input** (`BookingPriceInput`, identiek aan de bestaande `PricingQuoteInput`):

| Veld | Type | Betekenis |
|------|------|-----------|
| `pickup` | `string` | slug/naam/vrije tekst ophaalpunt |
| `dropoff` | `string` | slug/naam/vrije tekst bestemming |
| `vehicleClass?` | `string` | default `executive-ev` (klant kiest niet — zie §5) |
| `passengers?` | `number` | capaciteitscheck |
| `luggage?` | `number` | capaciteitscheck |
| `returnTrip?` | `boolean` | retour gevraagd |

**Output** (`BookingPriceResult`):

```ts
{
  quote: PricingQuoteResult;          // LEGACY / PASS-THROUGH — bindend
  contractVersion: "legacy-passthrough";
}
```

`quote` is byte/waarde-identiek aan wat `getPricingQuote()` teruggeeft
(`available/price/singlePrice/returnPrice/returnApplied/currency/vatRate/
distanceKm/estimatedDurationMin/vehicleClass/route/airport/dataSource` óf
`available:false/reason/message/airport`). De wrapper voegt niets toe of weg en
muteert de input niet.

## 3. Financieel bindende bron

```
fixed_route_prices  →  getPricingQuote()  →  calculateBookingPrice().quote.price
                    →  bookings.price_euros (p_price_euros via RPC)
                    →  Stripe-amount (bookingToAmount → eurosToCents, server-side)
```

De klant stuurt **nooit** een prijs. De boekings-RPC krijgt uitsluitend de
server-berekende `priceEuros`; de betaal-laag (`lib/payments/create-intent.ts`)
**weigert** expliciet client-velden `amount`/`currency`/`price`/`payment_status`.
Stripe rekent altijd met het server-opgeslagen bookingbedrag.

## 4. Huidige beperkingen (bewust, PR 7.6.2)

- **Pass-through only.** Geen breakdown, geen pricingVersion, geen quote-lock.
- **Geen quote-snapshot.** De prijs wordt bij preview én bij booking apart
  berekend; er is nog geen opgeslagen, herbruikbaar quote-resultaat. Zolang de
  vaste tarieven tussen die twee momenten niet wijzigen is de uitkomst gelijk —
  het sluiten van dat tijdsvenster is toekomstig werk (§6).
- **Regel-gebaseerde fallback blijft uit** (`FALLBACK_CUSTOMER_VISIBLE = false`);
  niet-vaste routes → "Offerte op aanvraag".
- **Toeslagen, tussenstops, retour-als-losse-rit, voertuigkeuze** bestaan hier
  nog niet en worden in latere PR's toegevoegd.

## 5. Wat absoluut geen clientprijs mag vertrouwen

- **Booking-creatie** (`/api/bookings`) — prijs komt uitsluitend uit
  `calculateBookingPrice()`, nooit uit de request-body.
- **PaymentIntent-creatie** (`lib/payments/create-intent.ts`) — bedrag wordt
  server-side afgeleid uit `booking.priceEuros`; client-bedragen worden geweigerd.
- **Stripe-webhook / statusverwerking** — vertrouwt de DB-boeking, niet de client.
- **Bevestiging & e-mail** — tonen het server-opgeslagen bedrag.

Invariant: er is precies één plek waar een klantprijs ontstaat
(`calculateBookingPrice`), en die leest alleen server-side bronnen.

## 6. Toekomstig contract (nog NIET geïmplementeerd)

De volgende velden zijn het doel voor PR 7.6.3+ en worden hier gedocumenteerd,
niet gevuld. Ze mogen geen fictieve/lege financiële regels introduceren die
productiegedrag veranderen voordat ze echt berekend en gepersisteerd worden:

| Toekomstig veld | Doel |
|-----------------|------|
| `pricingVersion` | versie van de prijsregels waarmee gerekend is |
| `quoteId` | identifier voor **quote-lock**: preview == booking == Stripe == e-mail |
| `breakdown` | subtotaal + expliciete, apart opgeslagen en zichtbare toeslagen |
| `route` (snapshot) | afstand/rijtijd/tussenstops zoals gebruikt bij de berekening |
| `adjustments[]` | expliciete correcties (bv. retourvoordeel) — additief, nooit verborgen dubbel |
| `stops[]` | tussenstops: extra afstand + rijtijd + stoptijd, plus optionele expliciete toeslag |

**Quote-lock (verplicht in V2):** zodra een prijs voor een booking wordt
geaccepteerd, gebruiken booking, Stripe, bevestiging, e-mail en interne gegevens
hetzelfde opgeslagen prijsresultaat (één `quoteId`), niet een herberekening.

## 7. Invarianten (moeten waar blijven)

1. Eén runtime-entrypoint voor klantprijzen: `calculateBookingPrice()`.
2. Quote-preview en booking gebruiken diezelfde functie → gelijk bedrag bij
   gelijke input.
3. De financieel bindende bron blijft `fixed_route_prices` (tot een latere PR
   dit expliciet en achter een flag uitbreidt).
4. Geen client-aangeleverde prijs wordt ooit vertrouwd.
5. Euro→cents-conversie blijft `eurosToCents` (integer cents, één afronding);
   de wrapper introduceert geen extra float-rekenwerk.
6. Currency blijft `EUR`.
