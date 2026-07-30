# Booking Engine V2 — Fase 1 Audit (Sprint 7.6)

> Read-only audit van de bestaande prijsarchitectuur. Geen productiegedrag gewijzigd,
> geen migraties, geen pricingregels aangepast. Alle conclusies zijn gebaseerd op de
> daadwerkelijke code, migraties, database-types en tests (branch `feature/booking-engine-v2`,
> uitgangspunt `main @ a9b8a76`).

## 1. Executive summary

**Centrale vraag — "één betrouwbare prijsbron, of kunnen quote/booking/Stripe/DB afwijken?"**

**Antwoord: er is functioneel één server-side bron van waarheid.** De prijs komt overal uit
`getPricingQuote()` (`lib/pricing/service.ts`), die uitsluitend `fixed_route_prices` leest. De
client stuurt **nooit** een bedrag: `POST /api/payments/create-intent` weigert expliciet
`amount/currency/price/tax/...`. De Stripe-`amount` wordt server-side afgeleid uit de opgeslagen
`bookings.price_euros`.

**Belangrijkste nuance / risico:** de quote wordt **twee keer, los van elkaar** berekend
(preview via `/api/pricing/quote` én opnieuw bij `POST /api/bookings`), op verschillende momenten,
zonder dat de quote wordt "vastgeklikt". Wijzigt `fixed_route_prices` tussen preview en boeking,
dan kan de getoonde preview-prijs afwijken van de daadwerkelijk geboekte/afgerekende prijs. Dit is
een **temporeel** consistentierisico, geen client-trust-lek.

**Verdere kernbevindingen:**
- **Toeslagen zijn NIET actief** in runtime. `fixed_route_prices` zijn all-in; de regel-gebaseerde
  fallback (`computeRuleBasedQuote`) retourneert altijd `null` (`FALLBACK_CUSTOMER_VISIBLE = false`).
  De tabel `price_adjustments` (nachttarief e.d.) bestaat maar wordt nergens toegepast.
- **Tussenstops bestaan niet** — geen datamodel, geen pricing, geen UI, geen booking-payload.
- **`bookings.notes` bestaat maar is ongebruikt** (geen UI-veld, niet gemapt in API/RPC).
- **Voertuigkeuze beïnvloedt de prijs niet** — `price_multiplier = 1.0` en de quote gebruikt altijd
  `executive-ev`. De UI-dropdown is cosmetisch t.o.v. de prijs.
- **De "Price Brain" is analytics/simulatie**, niet het runtime-prijspad (`lib/pricing-brain/*` en
  `/dashboard/brain` worden nergens in `lib/pricing`, de API-routes of de booking-flow geïmporteerd).
- **`lib/types/database.ts` is stale**: de `bookings`-Row mist de payment-kolommen
  (`payment_status`, `amount_due_cents`, …) die de Stripe-migratie toevoegde.
- **Geen persistente price breakdown / pricing version** — alleen één getal `price_euros`.

**Conclusie:** de huidige engine is bewust simpel en veilig (vaste routes, all-in, server-authoritatief).
V2 mag deze bron **niet dupliceren**, maar er één expliciete, persistente `PriceQuote` omheen bouwen
die quote, booking, Stripe, DB, bevestiging, e-mail en interne ritgegevens uit dezelfde bron voedt.

## 2. Huidige architectuur

```
AddressAutocomplete (PDOK + /api/places)         [client, geen prijs]
        │  (pickup.label, dropoff.label)
        ▼
useRouteQuote  ──POST──▶ /api/pricing/quote ──▶ getPricingQuote() ──▶ fixed_route_prices
  (preview)                (server)                 (server, anon read)      (Supabase)
        │  toont €-preview (niet-bindend)
        ▼
BookingSection ──POST──▶ /api/bookings ──▶ getPricingQuote() (OPNIEUW) ──▶ create_booking() RPC
                          (server)            → price_euros (autoritatief)     → bookings.price_euros
                                                                                       │
PaymentStep ──POST──▶ /api/payments/create-intent ──▶ leest booking.price_euros ──────┘
  (client)             (server, service-role)          → bookingToAmount() → Stripe PI
                                                        → link_booking_payment() (PI↔booking)
        │
   Payment Element (Stripe) → betaling
        │
Stripe webhook ──▶ /api/stripe/webhook ──▶ process_stripe_payment_event() ──▶ bookings.payment_status='paid'
   (signed)          (server)                (SECURITY DEFINER)                  amount_paid_cents
        │
PaymentStep polt /api/payments/status ──▶ 'paid' → UI "Betaling bevestigd"
sendBookingEmails() ──▶ Resend (klant + ops), prijs = price_euros (server)
```

**Runtimes:** alle prijs-/booking-/betaallogica draait **server-side** (`runtime = "nodejs"`,
`dynamic = "force-dynamic"`). De client rekent nergens een bindend bedrag uit.

## 3. Volledige pricing dataflow (met bindendheid)

| Fase | Bron van bedrag | Server/Client | Financieel bindend? |
|---|---|---|---|
| Prijsindicatie (preview) | `getPricingQuote` → `fixed_route_prices` | server | Nee (indicatief) |
| Booking-aanmaak | `getPricingQuote` (opnieuw) → `price_euros` | server | **Ja** (commitrecord) |
| Opslag DB | `create_booking(p_price_euros)` → `bookings.price_euros` | server (RPC) | **Ja** |
| Stripe PaymentIntent | `bookingToAmount(booking.price_euros)` → cents | server | **Ja** |
| Webhook → paid | `process_stripe_payment_event` verifieert `amount_received == amount_due` | server (DEFINER) | **Ja** |
| Bevestigingspagina | polt `/api/payments/status` (`amountPaid`, uit DB) | server-status | weergave |
| E-mail | `sendBookingEmails({ price: priceEuros })` (server) | server | weergave |
| Interne ritgegevens | `bookings`-rij (`price_euros`, payment_*) | server | administratief |

**Cents-conversie** gebeurt op één plek: `eurosToCents(euros) = Math.round((euros + EPSILON) * 100)`
(`lib/payments/create-intent.ts`). Voor prijzen met 2 decimalen is dit exact (€57,00 → 5700).

## 4. Pricing-entrypoints

| # | Bestand:functie | Input | Output | Verantwoordelijkheid | Side | Bindend | Afwijkingsrisico |
|---|---|---|---|---|---|---|---|
| 1 | `lib/pricing/service.ts::getPricingQuote` | pickup, dropoff, vehicleClass?, passengers, luggage, returnTrip | `PricingQuoteResult` (available/price/returnPrice/airport…) | **De** prijsbepaling (vaste route) | server | indirect | — (single source) |
| 2 | `lib/pricing/service.ts::findFixedRoute` | pickupId, dropoffId, vehicleClassId | rij uit `fixed_route_prices` | DB-lookup vaste prijs | server | ja | — |
| 3 | `lib/pricing/service.ts::findLocation` + `location-aliases.ts::resolveLocationSlug` | vrij adres | location-slug | adres → route-slug | server | nee | **slug-resolutie** (adres→wijk/stad) |
| 4 | `lib/pricing/service.ts::computeRuleBasedQuote` | — | `null` | regel-fallback (UIT) | server | nee | inactief |
| 5 | `app/api/pricing/quote/route.ts::POST` | pickup, dropoff, returnTrip, passengers | quote JSON (preview) | HTTP-laag preview | server | **nee** | preview ≠ booking (temporeel) |
| 6 | `app/api/bookings/route.ts::POST` | volledige boeking (geen prijs) | booking + `price_euros` | boeking + autoritatieve prijs | server | **ja** | 2e quote-berekening |
| 7 | `create_booking()` RPC (`20260707120000`) | `p_price_euros` (server) | booking-rij | opslag | server (DEFINER) | ja | vertrouwt `p_price_euros` van de route |
| 8 | `lib/payments/create-intent.ts::bookingToAmount` | `booking.price_euros` | cents | € → cents | server | **ja** | afronding (verwaarloosbaar) |
| 9 | `lib/payments/create-intent.ts::createBookingPaymentIntent` | booking + Stripe fn | PI + link | Stripe-amount + koppeling | server | **ja** | — (idempotent) |
| 10 | `link_booking_payment()` RPC (`20260724120000`) | booking_id, pi, amount, currency | outcome | PI↔booking + unpaid→pending | server (DEFINER) | ja | row-lock aanwezig |
| 11 | `process_stripe_payment_event()` RPC | event, pi, status, amount, currency | outcome | webhook → paid (amount-check) | server (DEFINER) | **ja** | — |
| 12 | `lib/pricing/rate-card.ts::loadRateCard` | — | tarievenlijst | /tarieven-weergave | server (anon) | nee | leest **alle** routes (weergave) |
| 13 | `app/[locale]/dashboard/brain/data.ts::loadBrainDashboard` | — | brain-view | intern dashboard | server (anon) | nee | analytics |

**Client-side prijsberekeningen:** geen. `useRouteQuote` en `PaymentStep` tonen alleen server-waarden.

> **Implementatie-update (PR 7.6.2, 2026-07-30):** entrypoints 5 en 6 roepen `getPricingQuote`
> niet langer direct aan, maar via de nieuwe centrale functie
> `lib/pricing/engine.ts::calculateBookingPrice` — een **pure pass-through** (byte/waarde-identieke
> uitkomst, geen prijs-/afronding-/fallbackwijziging). `engine.ts` is nu de enige runtime-caller van
> `getPricingQuote`. Het "2e quote-berekening / preview ≠ booking (temporeel)"-risico blijft ongewijzigd
> bestaan tot de quote-lock (PR 7.6.3+). Contract: `docs/architecture/booking-price-contract.md`.

## 5. Huidige toeslagenmatrix

| Component | Bestaat? | Waar | Actief in runtime? | Volgorde | Identiek in quote/booking/Stripe/DB? | Tests |
|---|---|---|---|---|---|---|
| Basistarief (regel) | tabel `pricing_rules` | `20260705230000` | **NEE** (fallback uit) | n.v.t. | n.v.t. | brain/rates |
| **Vaste routeprijs** | ✅ `fixed_route_prices.price` | migraties + `service.ts` | **JA** (enige actieve) | 1 | **ja** | rate-card, location-aliases, airport |
| Kilometerprijs | `pricing_rules.price_per_km` | `20260705230000` | NEE | — | — | — |
| Tijdprijs | `pricing_rules.price_per_minute` | idem | NEE | — | — | — |
| Minimumprijs | `pricing_rules.minimum_fare` | idem | NEE | — | — | — |
| Chauffeurkosten | — | — | NEE (in all-in prijs) | — | — | — |
| Marge | brain-analyse | `pricing-brain`, brain-dashboard | analytics | — | — | brain |
| **Nachttarief** | `price_adjustments` (23:00–06:00 +15%, `active`) | `20260705230000` | **NEE** (nergens toegepast) | — | — | — |
| **Retour** | ✅ `fixed_route_prices.return_price` (vaste waarde) | `service.ts` | **JA** | 2 | **ja** | — |
| Wachttijd | genoemd in `voorwaarden` (handmatig) | copy | NEE | — | — | — |
| Meet-and-greet | — | — | NEE | — | — | — |
| Luchthavenservice | context (vluchtnummerplicht), **geen prijs** | `airport-context.ts` | context-JA, prijs-NEE | — | context | airport-context (14) |
| Tussenstop | — | — | NEE | — | — | — |
| Parkeren | — | — | NEE | — | — | — |
| Bagage | validatie (capaciteit), **geen prijs** | quote-capaciteitscheck | NEE | — | — | — |
| Passagiers/capaciteit | zachte check (`max_passengers/luggage`) → `capacity_exceeded` | `service.ts` | JA (blokkeert, prijst niet) | pre-1 | ja | — |
| Handmatige toeslagen | — | — | NEE | — | — | — |
| Kortingsregels | `price_adjustments` (retour −10%, `inactive`) | `20260705230000` | NEE | — | — | — |
| Afronding | `eurosToCents` (€→cents) | `create-intent.ts` | JA | laatste | ja | create-intent |
| **BTW** | `fixed_route_prices.vat_rate` (9%, **opgeslagen, niet los berekend**) | migraties | metadata | — | ja (in all-in) | — |

**Kernpunt:** de effectieve runtime-"matrix" bestaat vandaag uit **precies twee** waarden per route:
`price` (enkel) en `return_price` (retour), beide all-in inclusief 9% BTW. Alle andere componenten
zijn óf inactief (fallback/adjustments) óf handmatig/operationeel.

## 6. Tussenstopanalyse

Tussenstops zijn **niet gemodelleerd**. Bevindingen per laag:

| Laag | Status |
|---|---|
| Frontend booking-state | geen stop-veld (`BookingSection`: van/naar/datum/tijd/voertuig/passagiers/bagage) |
| Routeberekening | geen route-engine; alleen slug-lookup + optionele lat/lon-opslag |
| Maps/geocoding | PDOK + Google Places **alleen** voor adres-autocomplete, niet voor routing/afstand |
| DB-kolommen/tabellen | geen `stops`/`waypoints`/`booking_routes`-tabel |
| Pricing-input | `getPricingQuote` kent alleen pickup+dropoff |
| Booking-payload | `POST /api/bookings` accepteert geen stops |
| Stripe-metadata | alleen `booking_ref`, `locale`, `amount_source` |
| Confirmation-UI | geen stops |
| Interne ritgegevens | geen stops |

Antwoorden:
1. **Nee**, tussenstops bestaan nog niet (alleen marketing-copy "geen tussenstops" in `dagtochten.ts`
   en een terms-vermelding dat een stopover een handmatige meerprijs kan zijn).
2. Geen vaste toeslag.
3. Extra km/rijtijd worden **niet** meegenomen (geen afstandsbron in runtime).
4. Stop-/wachttijd wordt niet meegenomen.
5. Volgorde n.v.t.
6. Meerdere stops n.v.t.
7. **Nodig:** nieuwe tabel `booking_stops` (booking_id, order, address, lat/lon, expected_stop_seconds?),
   route-afstand/-tijd-bron (Google Directions/Distance Matrix), pricing-input uitbreiden, payload + UI + confirmation.

## 7. Datamodelanalyse

**`public.bookings`** (kern) — Row uit `lib/types/database.ts` + Stripe-migratie:
`booking_ref, id (uuid), ride_type, from_address, to_address, from_lat/lon, to_lat/lon, ride_date,
ride_time, vehicle, persons, luggage, price_euros (numeric), customer_name/phone/email, status,
email_sent, notes, created_at`, + payment: `stripe_payment_intent_id, payment_status, amount_due_cents,
amount_paid_cents, payment_currency, paid_at`, + `flight_number, flight_direction`.

| Aspect | Bevinding |
|---|---|
| Bedragen in **euro's** | `price_euros numeric(10,2)` — de **canonieke** prijs |
| Bedragen in **cents** | `amount_due_cents`, `amount_paid_cents` (payment-laag; afgeleid van `price_euros`) |
| Client-aanleverbaar bedrag | **geen** — client stuurt geen prijs (booking noch create-intent) |
| Server-herberekend | `price_euros` bij booking (via `getPricingQuote`); `amount_due_cents` bij create-intent |
| Race conditions | `link_booking_payment`/`process_stripe_payment_event` gebruiken `FOR UPDATE` (row-lock) + `stripe_webhook_events` PK (idempotency) |
| Historisch/redundant | `notes` (ongebruikt); `pricing_rules`/`price_adjustments` (inactief); brain_* (analytics) |
| **Type-drift** | `lib/types/database.ts` `bookings.Row` **mist** de payment-kolommen → types stale t.o.v. schema |
| Ontbrekend voor V2 | geen `price breakdown`/`totals`/`pricing_version`/`quotes`-tabel; geen `booking_stops` |

Overige relevante tabellen: `fixed_route_prices` (price/return_price/distance_km/estimated_duration_min/
vat_rate/service_type/valid_from/active), `locations`/`cities`/`districts`/`airports`/`vehicle_classes`
(referentie), `pricing_quote_logs` (best-effort audit van quotes, service-role), `stripe_webhook_events`
(idempotency). Er is **geen** aparte `quotes`-tabel: een quote is efemeer (behalve de best-effort log).

## 8. Security- en integriteitsrisico's

| Vraag | Bevinding |
|---|---|
| Wordt een client-prijs vertrouwd? | **Nee.** `parsePaymentRequest` weigert `amount/currency/price/tax/…`; `POST /api/bookings` leest geen client-prijs. |
| Stripe altijd server-berekend bedrag? | **Ja.** `bookingToAmount(booking.price_euros)` → Stripe `amount`. Metadata `amount_source=server_stored_booking_price`. |
| Kan de bookingprijs na PI wijzigen? | `price_euros` wordt na booking niet meer geschreven door de betaalflow; `link_booking_payment` downgradet nooit `paid`. **Geen immutability-lock** op `price_euros` zelf (theoretisch kan een admin/service-role het wijzigen; niet via de client). |
| Idempotency? | **Ja**, twee lagen: `buildIdempotencyKey` (Stripe, per booking+amount) en `stripe_webhook_events` PK (`ON CONFLICT DO NOTHING`). |
| Dubbele toeslag mogelijk? | Nvt — geen toeslagen actief. (V2-risico zodra adjustments komen.) |
| UI ander bedrag dan Stripe? | Mogelijk **temporeel**: preview-quote ≠ booking-quote als `fixed_route_prices` tussentijds wijzigt (geen quote-lock). De betaalde `amount` = altijd `price_euros` van de booking (consistent met DB). |
| Breakdown gekoppeld aan totaal? | Geen breakdown; alleen `price_euros`. Geen cryptografische/logische koppeling (nog niet nodig). |
| Bedragen immutable na betaalstart? | Guarded: webhook zet `paid` alleen bij `amount_received == amount_due`; `paid` is terminaal (processing/failed/canceled downgraden niet). |
| Rounding-verschillen? | `eurosToCents` met `EPSILON`; exact voor 2-decimale euro's. Geen bekend risico. |

**Netto:** geen kritieke integriteitslekken. Het enige reële punt is het **quote-lock-gat** (preview vs
booking) en het ontbreken van een expliciete, persistente breakdown — beide zijn ontwerpdoelen van V2.

## 9. Voertuigkeuze- en opmerkingenanalyse

- **Voertuigkeuze UI:** `BookingSection` toont een dropdown (Lynk & Co 01 / Tesla Model Y per stad).
  De waarde gaat als **vrije tekst** `vehicle` naar `create_booking` (`bookings.vehicle`).
- **Prijsinvloed:** **geen.** `getPricingQuote` gebruikt altijd `DEFAULT_VEHICLE_CLASS = "executive-ev"`;
  `vehicle_classes.price_multiplier = 1.0` voor beide klassen. De keuze is cosmetisch t.o.v. de prijs.
- **Fleet-copy:** teksten die een specifiek merk (Tesla/Lynk & Co) "garanderen" moeten worden nagelopen
  (PR 7.6.8) — een concrete voertuigbelofte is operationeel bindend en kan botsen met beschikbaarheid.
- **Opmerkingenveld:** `bookings.notes` bestaat (nullable) maar wordt **nergens** gevuld (geen UI-input,
  niet in de `POST /api/bookings`-payload, niet in `create_booking`-parameters). Veilige opslag/weergave
  vereist: UI-textarea → payload `notes` → nieuwe RPC-parameter `p_notes` → weergave in bevestiging/e-mail/ops.
  Let op de bestaande waarschuwing (`20260720020000`): operationele beloften horen **niet** in vrije-tekst
  `notes` (niet doorzoekbaar) — vluchtnummer heeft daarom een eigen kolom. Behandel `notes` puur als
  niet-bindende klantopmerking.

## 10. Testdekking

**Commando's & uitkomst (allemaal groen):**
- `npm run test:payments` → **70/70** (create-intent 14, payment-flow 22, webhook 24, status 6, csp 4)
- `npm run test:rates` → **43/43** (airport-context 14, location-aliases 12, rate-card 9, public-read-grants 8)
- `npm run test:brain` → **26/26**
- `npx tsx --test lib/config/environment.test.ts` → **25/25** (env-guard)

**Karakter van de dekking:** sterk voor (a) de TS-orkestratie (client-state-machine, create-intent-logica,
webhook-mapping, adres-/slug-resolutie) en (b) **SQL-contract** (assertions op de migratie: `FOR UPDATE`,
terminal-guards, execute-grants). **Zwak/ontbrekend:** een geautomatiseerde **DB-integratietest** die de
RPC's tegen een echte Postgres draait (nu handmatig op staging bewezen, niet in CI). Geen tests voor:
quote↔booking-consistentie, prijs-immutability, en (nog niet bestaande) toeslagen/stops.

**Testbaarheid:** goed — de betaallaag injecteert Stripe/Supabase (pure functies), en de guards zijn puur.
V2 kan dezelfde stijl volgen: `calculateBookingPrice(input): PriceQuote` als pure, volledig geteste functie.

## 11. Voorgestelde doelarchitectuur

Eén server-side bron: **`calculateBookingPrice(input): PriceQuote`** in `lib/pricing/` (bv.
`lib/pricing/engine.ts`), die de bestaande `fixed_route_prices`-lookup **omvat** (niet vervangt) en een
expliciete, persisteerbare structuur teruggeeft:

```ts
type PriceQuote = {
  currency: "EUR";
  subtotalCents: number;               // basis (vaste route of, later, dynamisch)
  adjustments: Array<{
    code: string;                      // "return" | "night" | "stop" | "waiting" | ...
    label: string;
    amountCents: number;               // + of −
    calculation?: string;              // uitlegbaar
    metadata?: Record<string, unknown>;
  }>;
  totalCents: number;                  // subtotal + Σ adjustments (canoniek)
  route: {
    distanceMeters: number;            // 0 zolang geen afstandsbron
    durationSeconds: number;
    stops: Array<{ order: number; address: string; expectedStopSeconds?: number }>;
  };
  vehicleClass: string;
  pricingVersion: string;              // bv. "fixed-2026-07" — traceer welke regels golden
  source: "fixed_route_prices" | "rule_based";
};
```

**Invarianten die V2 moet garanderen:**
1. `calculateBookingPrice` is de **enige** plek die een bindend bedrag produceert; quote-API, booking-API
   en de bevestiging lezen dezelfde functie/dezelfde persistente quote.
2. Bij **booking** wordt de **volledige `PriceQuote`** (breakdown + `pricingVersion` + `totalCents`)
   gepersisteerd op de boeking. Create-intent, webhook, status, bevestiging, e-mail en interne view lezen
   dié opgeslagen quote — geen herberekening met mogelijk andere tarieven.
3. Stripe-`amount` = `PriceQuote.totalCents` van de opgeslagen quote (== `price_euros*100` voor vaste routes;
   backward-compatible).
4. Voor vaste routes is `subtotalCents = price` (of `return_price` als adjustment), `adjustments = []`,
   `totalCents = price_euros*100` — **identieke uitkomst** als vandaag (geen prijswijziging).

## 12. Voorgestelde databasewijzigingen (additief, non-destructief)

Allemaal **nieuwe, nullable** kolommen/tabellen — niets verwijderen, `price_euros` blijft canoniek tijdens transitie:
- `bookings.price_breakdown jsonb null` — de volledige `PriceQuote` (adjustments etc.).
- `bookings.pricing_version text null` — welke prijsregels golden.
- `bookings.total_cents integer null` — canoniek totaal in cents (naast `price_euros` tijdens transitie).
- `bookings.notes` — bestaat al; alleen UI/API aansluiten (PR 7.6.7).
- Nieuwe tabel `public.booking_stops (id, booking_id fk, stop_order int, address text, lat/lon, expected_stop_seconds int null, created_at)` — meerdere stops, volgorde bewaard (PR 7.6.5).
- (optioneel) `bookings.route_distance_meters`, `route_duration_seconds` zodra een afstandsbron bestaat.

Types (`lib/types/database.ts`) **regenereren** (nu stale — mist payment-kolommen).

## 13. Migratiestrategie zonder big-bang

1. **Contract eerst** (PR 7.6.1): types + `PriceQuote`-interface, geen gedrag.
2. **Wrapper** (PR 7.6.2): `calculateBookingPrice` die intern `getPricingQuote` aanroept en voor vaste routes
   een **byte-identieke** total teruggeeft. Achter de bestaande API's, geen gedragswijziging. Tests: nieuw == oud.
3. **Persistentie** (PR 7.6.3): nieuwe nullable kolommen + booking slaat de breakdown/versie op; `price_euros`
   blijft leidend; niets breekt voor oude boekingen.
4. Daarna pas **nieuwe** prijscomponenten (toeslagen/stops) — elk als additieve `adjustment`, achter feature-flag,
   met tests, zonder de vaste-route-uitkomst te veranderen tenzij expliciet zakelijk besloten.
Elke stap is los te deployen en te valideren op staging (het bestaande `feature/env-hardening`-patroon).

## 14. Backward-compatibilityplan

- `price_euros` blijft de canonieke total tot V2 volledig bewezen is; `total_cents`/`price_breakdown` zijn
  aanvankelijk aanvullend.
- Bestaande boekingen (zonder breakdown) blijven geldig: read-paden vallen terug op `price_euros` als
  `price_breakdown` null is.
- Stripe-amount blijft `= server-berekende total` (voor vaste routes ongewijzigd).
- Geen enkele bestaande route/API/UI wordt verwijderd in de datamodel-/engine-PR's (voertuigkeuze-verwijdering
  is een aparte, bewuste PR 7.6.8).

## 15. Rollbackplan

- Elke PR is **additief** (nieuwe nullable kolommen/tabellen, wrapper achter dezelfde API) → revert = de
  merge-commit terugdraaien; geen datamigratie nodig, geen gegevensverlies (kolommen blijven bestaan of
  worden genegeerd).
- Geen `DROP`/`TRUNCATE`/destructieve DDL in de voorgestelde stappen.
- `price_euros` wordt nooit verwijderd of overschreven door V2 zolang V1 de bindende bron is.
- Productie-rollback = zelfde patroon als PR #2: revert merge → Vercel herdeployt de vorige werkende versie.

## 16. Open zakelijke beslissingen (voor Denzel)

1. **Toeslagen activeren?** Moeten nachttarief / wachttijd / meet-and-greet / parkeren / bagage
   **klantzichtbare, geprijsde** items worden, of blijven ze all-in/handmatig? (Nu: all-in, niets los.)
2. **Tussenstop-prijsmodel:** vaste toeslag per stop, óf afstand+tijd-gebaseerd (vereist een route-engine
   met kosten, bv. Google Distance Matrix)? En: max. aantal stops?
3. **Voertuigklasse & prijs:** moet klassekeuze de prijs beïnvloeden (nu multiplier 1.0), of wordt de keuze
   verwijderd (PR 7.6.8)? Welke fleet-belofte mag de copy doen?
4. **Retour:** vaste `return_price` per route behouden, of overstappen op een berekende factor (seed was ×1,8)?
5. **Dynamische prijs voor niet-vaste routes:** de regel-fallback activeren (km/tijd) i.p.v. "offerte op
   aanvraag"? Zo ja, vereist een afstandsbron + kalibratie.
6. **Quote-lock:** moet een getoonde preview-prijs voor X minuten "vastgeklikt" worden zodat booking ==
   preview, ook als tarieven wijzigen?

## 17. Implementatieplan in kleine PR's

| PR | Titel | Scope | Gedragswijziging? |
|---|---|---|---|
| 7.6.1 | Audit + contracten | dit document + `PriceQuote`-types, types regenereren | nee |
| 7.6.2 | Centrale pricingfunctie achter bestaande API | `calculateBookingPrice` wrapt `getPricingQuote`, identieke uitkomst, tests nieuw==oud | nee |
| 7.6.3 | Persistente breakdown + pricing version | nullable kolommen + booking slaat quote op | nee (additief) |
| 7.6.4 | Toeslagen-engine | adjustment-framework (nog leeg voor vaste routes), feature-flag | alleen achter flag |
| 7.6.5 | Tussenstop-datamodel + routing | `booking_stops` + afstandsbron + pricing-input | achter flag |
| 7.6.6 | Tussenstop-UI | booking-state + payload + confirmation | achter flag |
| 7.6.7 | Opmerkingenveld | UI textarea → `p_notes` → opslag/weergave (niet-bindend) | ja (klein, veilig) |
| 7.6.8 | Voertuigkeuze verwijderen + fleet-copy | UI-dropdown weg, copy corrigeren | ja (UI) |
| 7.6.9 | Stripe/booking/confirmation gelijktrekken | alles leest de opgeslagen `PriceQuote` | ja (consistentie) |
| 7.6.10 | Regressie- + acceptatietests | incl. DB-integratietest (A–L) in CI, quote↔booking-consistentie | tests |

**Aanbevolen eerste implementatie-PR na deze audit: 7.6.2** (centrale pricingfunctie als wrapper — nul
gedragswijziging, maximale toekomstwaarde, volledig testbaar). 7.6.7 (notes) is een goede kleine
parallel-win.

## 18. Acceptatiecriteria per PR (samengevat)

- **7.6.1:** dit document gemerged; `PriceQuote`-type gedefinieerd; `database.ts` geregenereerd (payment-kolommen aanwezig); geen runtime-gedrag gewijzigd; gate groen.
- **7.6.2:** `calculateBookingPrice(input)` bestaat; voor elke bestaande vaste route geldt `totalCents == price_euros*100` (property-test tegen de seed); quote-API en booking-API gebruiken dezelfde functie; geen prijswijziging op staging; tests nieuw==oud.
- **7.6.3:** booking persisteert `price_breakdown`+`pricing_version`+`total_cents`; oude boekingen (null breakdown) blijven werken; Stripe-amount == `total_cents`; read-paden vallen terug op `price_euros`.
- **7.6.4–7.6.6:** elke nieuwe adjustment/stop verandert de vaste-route-prijs **niet** tenzij zakelijk bevestigd; dubbele-toeslag-test; volgorde-test; feature-flag default uit.
- **7.6.7:** notes zichtbaar in bevestiging/e-mail/ops; nooit bindend; injectie-veilig; lengtelimiet.
- **7.6.8:** geen voertuig-prijsinvloed verandert (was al 1.0); copy claimt geen specifiek merk zonder dekking.
- **7.6.9:** één opgeslagen quote voedt quote/booking/DB/Stripe/bevestiging/e-mail/intern; consistentietest.
- **7.6.10:** DB-integratietest (A–L) draait in CI; quote↔booking-consistentie + prijs-immutability afgedekt.

---

## Stopvoorwaarden — beoordeling

| Stopvoorwaarde | Getriggerd? |
|---|---|
| Productieprijs niet reconstrueerbaar | **Nee** — één bron (`fixed_route_prices` → `price_euros` → Stripe) |
| Databasevelden spreken elkaar tegen | **Nee** (wel: `database.ts`-types stale — cosmetisch, geen datategenspraak) |
| Client-sent prijs financieel bindend | **Nee** — expliciet geweigerd |
| Bestaande tussenstoplogica onduidelijk | **Nee** — bestaat niet (schone lei) |
| Migratie kan gegevensverlies veroorzaken | **Nee** — voorgestelde migraties zijn additief |
| Tests onvoldoende om veilig te refactoren | **Deels** — TS/contract sterk; **DB-integratietest ontbreekt in CI** (nu handmatig op staging bewezen). Aanbeveling: 7.6.10 vroeg meenemen. |

**Geen blokkerende stopvoorwaarde.** De architectuur is veilig genoeg om V2 additief te bouwen, mits de
DB-integratietest wordt toegevoegd vóór of tijdens de eerste gedrag-rakende PR.
