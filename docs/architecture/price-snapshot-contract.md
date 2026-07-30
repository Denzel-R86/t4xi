# Price Snapshot Contract (PR 7.6.3A ontwerp · 7.6.3B database)

**Status:** ONTWERP VASTGESTELD. Alle kernkeuzes zijn door Denzel bevestigd
(2026-07-30, zie §11). De bijbehorende **additieve** migratie (`price_snapshots`)
is geschreven in PR 7.6.3B — **datamodel + migratie + rollbackplan only**, geen
runtimecode, geen booking-/Stripe-/UI-wijziging, geen deploy. De tabel wordt in
7.6.3B nog **niet gebruikt**.

**Voorloper:** [`booking-price-contract.md`](booking-price-contract.md) (PR 7.6.2) —
`calculateBookingPrice()` is nu het enige runtime-entrypoint voor klantprijzen, een
pure pass-through om `getPricingQuote()`. Dit document beschrijft hoe die functie in
7.6.3C+ een **gepersisteerde, herbruikbare** uitkomst gaat produceren.

---

## 1. Doel

Eén geaccepteerde prijs = één opgeslagen resultaat dat door **booking, Stripe,
bevestiging, e-mail, dashboard en facturen** identiek gelezen wordt (zakelijke
beslissing #6, quote-lock). Vandaag wordt de prijs bij preview én bij booking
apart berekend; zonder lock kan dat temporeel afwijken als tarieven tussentijds
wijzigen. De snapshot sluit dat venster.

**Niet-doelen in 7.6.3:** toeslagen activeren, tussenstops, dynamische fallback,
voertuigkeuze, breakdown-UI. Die volgen in latere PR's en hangen aan dit contract,
maar worden hier niet gebouwd.

## 2. Het model — `PriceSnapshot`

Voorgesteld contract (TypeScript-vorm; nog niet geïmplementeerd):

De snapshot is **genormaliseerd**: `price_snapshots` (de kop) + de child-tabel
`price_snapshot_adjustments` (de regels). In-memory ziet dat er zo uit:

```ts
type PriceSnapshot = {
  quoteId: string;            // door de APPLICATIE gegenereerd (UUID v7); GEEN DB-default,
                              // precies één generator; niet-oplopend, nooit client-aangeleverd
  pricingVersion: string;     // "2026.07.v1" — inert in 7.6.3 (opgeslagen, niet vertakt)
  pricingSource: PricingSource; // vandaag altijd "fixed_route_prices"
  currency: "EUR";

  // ── Geld: uitsluitend integer cents (geen floats) ──
  subtotalCents: number;      // basis (vandaag: de fixed-route prijs) in cents
  totalCents: number;         // = subtotalCents + Σ adjustments[].amountCents (invariant in app-laag)

  adjustments: PriceSnapshotAdjustment[]; // relationeel geladen; leeg in 7.6.3
  routeSnapshot: RouteSnapshot;
  calculatedAt: string;       // ISO-8601 UTC — wanneer de prijs is BEREKEND
  expiresAt: string;          // calculatedAt + 15 min — quote-lock geldigheidsvenster
  createdAt: string;          // ISO-8601 UTC — wanneer de rij is vastgelegd (audit)
};

// Vandaag alleen "fixed_route_prices"; de rest is forward-compatible en maakt
// audits/support later eenvoudiger. Nog geen logica; uitsluitend opslag/labeling.
type PricingSource =
  | "fixed_route_prices" | "dynamic" | "manual"
  | "hotel_rate" | "airport_rate" | "contract_rate" | "promotion";

// Aparte tabel price_snapshot_adjustments (NIET als JSONB) → sorteren, filteren,
// rapporteren, BTW uitsplitsen, toeslagen analyseren, support. Leeg in 7.6.3.
type PriceSnapshotAdjustment = {
  id: string;                 // DB-gegenereerde surrogate-PK (interne, niet-flow-spannende id)
  quoteId: string;            // FK → price_snapshots.quote_id (ON DELETE CASCADE)
  code: string;               // machine-leesbaar, bv. "return_discount"
  label: string;              // klantzichtbaar
  amountCents: number;        // + = toeslag, − = korting (mag negatief); additief, nooit verborgen
  taxable: boolean;
  vatRate: number | null;     // voor BTW-uitsplitsing/rapportage
  sortOrder: number;          // weergavevolgorde
};

type RouteSnapshot = {
  pickupSlug: string;
  dropoffSlug: string;
  vehicleClass: string;       // vandaag altijd "executive-ev"
  distanceKm: number | null;
  estimatedDurationMin: number | null;
  source: "fixed_route_prices";
  sourceLabel: string | null; // fixed_route_prices.source_label
  validFrom: string | null;   // valid_from van de gebruikte tariefregel → reproduceerbaar
  returnApplied: boolean;
  vatRate: number;
};
```

**Waarom deze velden:** ze maken de prijs **volledig reconstrueerbaar** los van de
huidige tarieftabel. Een tariefwijziging morgen verandert een reeds vastgelegde
snapshot nooit.

## 3. `pricingVersion` (nu al vastleggen, nog niet gebruiken)

- **Formaat:** `"JAAR.MAAND.vN"`, bv. `"2026.07.v1"`. Kalender-gebaseerd + revisie.
- **Semantiek:** identificeert de set prijsregels/logica waarmee `totalCents` tot
  stand kwam. Eén constante in de pricing-engine, bumpen bij elke gedrags­wijziging
  aan de berekening.
- **Inert in 7.6.3:** wordt **opgeslagen en meegegeven**, maar er hangt **geen
  branch-logica** aan. Geen A/B, geen conditionele prijzen. Alleen de ruimte.
- **Waarom nu:** latere waarde voor prijsdiscussies met klanten, historische
  reconstructie, toekomstige prijswijzigingen, A/B-pricing, audits, support en
  compliance. Achteraf toevoegen zou hermigratie van bestaande boekingen vergen.

### 3b. `pricingSource` (nu al vastleggen)

Naast `pricingVersion` legt elke snapshot vast **waar de prijs vandaan komt**.
Vandaag is dat altijd `"fixed_route_prices"`. Het veld is forward-compatible voor
`dynamic`, `manual`, `hotel_rate`, `airport_rate`, `contract_rate`, `promotion`.
Nog **geen logica** — alleen opslag/labeling — maar het maakt audits en support
later aanzienlijk eenvoudiger. De migratie borgt dit met een `CHECK` op de
toegestane waarden, zodat de kolom nu al gevalideerd én uitbreidbaar is.

## 4. `quoteId` — levensduur & lock

- **Generatie — één strategie:** de **applicatie** genereert de `quote_id` precies
  één keer bij het maken van de snapshot (**UUID v7**, tijd-geordend; v4 als fallback
  zolang v7 niet beschikbaar is). De **DB-kolom heeft géén default** → er is precies
  één generator, geen dubbele bron. Niet-oplopend, niet-afleidbaar, geen hash, geen
  numerieke ID, en **nooit** door de client aangeleverd (de server genereert intern,
  niet uit de request-body).
- **Stabiliteit:** één `quoteId` loopt ongewijzigd door: quote → booking →
  PaymentIntent-metadata → webhook-verwerking → bevestiging → e-mail → dashboard →
  factuur. Iedereen leest hetzelfde record.
- **Lock:** zodra een prijs geaccepteerd is, wordt **niet herberekend**; alle
  consumers lezen `totalCents` uit de snapshot. Stripe rekent uitsluitend met
  `snapshot.totalCents` (via de bestaande server-side afleiding), nooit met een
  client-bedrag.

## 5. Kernbeslissing — wanneer ontstaat de snapshot? → **BESLIST: Optie B (bij preview)**

Denzel heeft gekozen voor **Optie B**: `preview → persistente snapshot → quoteId →
booking → Stripe → mail/dashboard/factuur`. Dit levert de volledige quote-lock
(preview == booking == Stripe == bevestiging). De client krijgt alleen een
**ondoorzichtige `quoteId`** terug; bij booking haalt de server de snapshot
**server-side** op en gebruikt `totalCents` daaruit — de client stuurt nooit een
bedrag. Geldigheidsvenster **15 minuten**; verlopen/onbekende `quoteId` → verse
server-berekening (zoals nu). De onderstaande afweging blijft ter documentatie.

| | **Optie A — bij acceptatie (booking)** | **Optie B — bij preview** |
|---|---|---|
| Snapshot ontstaat | wanneer de klant boekt (`/api/bookings`) | bij offerte-preview (`/api/pricing/quote`) |
| `quoteId` naar client vóór booking | nee | ja (client stuurt 'm mee terug) |
| Lock preview→booking | zwak: preview en booking nóg apart berekend; snapshot legt alleen het booking-moment vast | sterk: booking hergebruikt exact de preview-snapshot |
| Vertrouwt de client iets? | nee (prijs blijft server-afgeleid) | **client stuurt `quoteId`** → server moet snapshot server-side ophalen/valideren; nog steeds geen client-*prijs* |
| Extra opslag | alleen geaccepteerde boekingen | ook niet-geboekte previews (opschoning/TTL nodig) |
| Complexiteit | laag | hoger (TTL, garbage collection, geldigheidsvenster) |

**Aanbeveling (te bevestigen):** **Optie B met server-side validatie** lost het
temporele driftrisico daadwerkelijk op (dat is de reden voor de quote-lock). Om
client-vertrouwen te vermijden: de client krijgt alleen een **ondoorzichtige
`quoteId`** terug; bij booking haalt de server de snapshot **server-side** op en
gebruikt `totalCents` daaruit — de client stuurt nooit een bedrag. Snapshots
krijgen een **geldigheidsvenster** (bv. quote geldig N minuten); verlopen of
onbekende `quoteId` → val terug op een verse server-berekening (zoals nu).

Optie A is de kleinste stap maar levert niet de volledige lock — daarom niet gekozen.

## 6. Geldrepresentatie & invarianten

**Structureel (in de DB, 7.6.3B) — uitsluitend vorm, geen financieel oordeel:**

1. **Alle bedragen in integer cents.** Geen floats. Conversie via `eurosToCents`
   (één afronding, `Math.round(euros*100)`).
2. `subtotal_cents >= 0`, `total_cents >= 0`. Een adjustment-`amount_cents` **mag
   negatief** zijn (korting) → daar geen tekencheck.
3. `currency = 'EUR'`.
4. `expires_at > calculated_at` (temporeel-structureel).
5. Snapshot **immutabel** — afgedwongen op grant-niveau (service_role:
   `SELECT/INSERT/DELETE`, **geen `UPDATE`**), op zowel de kop- als de child-tabel.
6. `pricingVersion`, `pricingSource` en `quoteId` zijn `NOT NULL`.

**Financieel (in de applicatielaag + tests, 7.6.3C) — bewust NIET in CHECK-constraints:**

7. `totalCents === subtotalCents + Σ adjustments[].amountCents`. De DB oordeelt niet
   inhoudelijk over de prijs; de berekening wordt met retour/nacht/parkeren/wachttijd/
   tussenstops/airport-fee/korting te complex (en is cross-table). App + tests bewaken 'm.
8. `adjustments` zijn **strikt additief en expliciet**; geen verborgen dubbele
   toepassing (zakelijke beslissing #1). Leeg in 7.6.3.
9. `expiresAt = calculatedAt + 15 min` (quote-lock-venster; DB heeft dit als default,
   app zet 't expliciet).

## 7. Dataflow (doel, ná 7.6.3C–E)

```
calculateBookingPrice(input)
      │  (v2: produceert PriceSnapshot i.p.v. losse quote)
      ▼
  PriceSnapshot  ──persisteer──▶  price_snapshots (quoteId PK)
      │
      ├─▶ booking            → refereert quoteId (snapshot.totalCents → price_euros)
      ├─▶ Stripe PaymentIntent → amount uit snapshot.totalCents (server-side)
      ├─▶ webhook            → verifieert tegen snapshot.totalCents
      ├─▶ bevestiging + e-mail → tonen snapshot (subtotal/adjustments/total)
      ├─▶ dashboard          → leest snapshot
      └─▶ factuur            → leest snapshot (compliance/reconstructie)
```

Eén bron, door iedereen gelezen. Geen enkele consument herberekent.

## 8. Relatie tot bestaande code

- `calculateBookingPrice()` blijft het enige entrypoint. In 7.6.3C wordt de
  **pass-through** een **snapshot-producent**; `contractVersion` klapt dan van
  `"legacy-passthrough"` → `"v2"`. Tot die PR verandert er niets aan runtime-gedrag.
- Backward-compat: boekingen zonder snapshot (alle bestaande) blijven geldig; de
  snapshot is **additief** en optioneel tot de flow er echt op leunt.
- Geen wijziging aan `getPricingQuote()`, RPC's, of Stripe-afleiding in 7.6.3A.

## 9. PR-opdeling 7.6.3

| Sub-PR | Inhoud | Status | Muteert productie? |
|--------|--------|--------|---------------------|
| **7.6.3A** | Dit ontwerpdocument. Geen code, geen DB. | ✅ opgeleverd | nee |
| **7.6.3B** | Additieve tabellen `price_snapshots` + `price_snapshot_adjustments` + rollbackplan. **Nog niet gebruikt.** | ⬅ deze PR | nee (staging eerst; prod nooit blind) |
| 7.6.3C | `calculateBookingPrice` → snapshot; booking refereert `quoteId` | gepland | ja (gedrag) |
| 7.6.3D | Stripe gebruikt uitsluitend `snapshot.totalCents` | gepland | ja (gedrag) |
| 7.6.3E | Bevestiging, e-mail, dashboard lezen exact dezelfde snapshot | gepland | ja (gedrag) |

## 10. Opschoning (garbage collection)

- Snapshots **zonder** booking → verwijderen **na 48 uur** (`created_at < now()-48h`
  en geen booking die de `quote_id` refereert). De cleanup-job komt in 7.6.3C+,
  zodra `bookings.quote_id` bestaat; de index op `created_at`/`expires_at` staat er
  in 7.6.3B al klaar voor.
- Snapshots **met** booking → **nooit** verwijderen zolang wettelijke
  bewaartermijnen gelden.
- `expiresAt` (15 min) is het **quote-lock-venster**, los van de 48u-GC: een quote
  ouder dan 15 min is niet meer geldig voor booking, maar de rij mag nog 48u blijven
  bestaan voor audit/hergebruik-detectie.

## 11. Scope van 7.6.3B (database)

Uitsluitend: de additieve tabellen `price_snapshots` + `price_snapshot_adjustments`,
constraints, indexen, RLS + grants, en het rollbackplan. **Geen** runtimecode,
booking-logica, Stripe-wijziging, UI, RPC of deploy. De tabellen worden nergens
gelezen/geschreven in deze PR.

## 12. Rollbackplan (7.6.3B)

De migratie is puur additief (twee nieuwe tabellen, geen wijziging aan bestaande
objecten of data). Terugdraaien is een schone `DROP` (child eerst i.v.m. de FK):

```sql
-- Rollback 7.6.3B — verwijdert uitsluitend de nieuwe, ongebruikte tabellen.
begin;
drop table if exists public.price_snapshot_adjustments;
drop table if exists public.price_snapshots;
commit;
```

Veilig omdat de tabellen in 7.6.3B door geen enkele code worden gebruikt (geen
externe FK's wijzen ernaar vóór 7.6.3C). Validatie: **eerst op staging** toepassen
en de `DROP`-rollback bewijzen; **productie nooit blind** muteren.

## 12b. Design-review 7.6.3B — verwerkt (Denzel, 2026-07-30)

| Punt | Aanbeveling | Resolutie |
|------|-------------|-----------|
| quoteId-strategie | één generator, niet beide | **App genereert altijd** (UUID v7), DB-kolom zonder default → één bron, geen client-id |
| adjustments | aparte tabel i.p.v. JSONB | **`price_snapshot_adjustments`** (FK, cascade; code/label/amount/taxable/vat_rate/sort_order) |
| DB-constraints | alleen structureel | `total=subtotal`-CHECK **verwijderd**; DB doet alleen integer/`>=0`/`EUR`/temporeel; financiële invariant → app-laag + tests |

## 13. Bevestigde beslissingen (Denzel, 2026-07-30)

1. **Snapshot-moment:** Optie B — bij preview. ✅
2. **Geldigheidsvenster:** 15 minuten; daarna verse quote + nieuw `quoteId` + nieuw snapshot. ✅
3. **`quoteId`-type:** UUID v7 (v4 fallback); niet-oplopend/afleidbaar. ✅
4. **`pricingVersion`:** start `"2026.07.v1"`, later één centrale constante `PRICING_VERSION` (geen logica, alleen opslag). ✅
5. **Opschoning:** niet-geboekte snapshots na 48u; geboekte nooit (bewaartermijnen). ✅
6. **`pricingSource`** toegevoegd (nu `fixed_route_prices`, forward-compatible). ✅
7. **`calculatedAt` + `expiresAt`** toegevoegd naast `createdAt`. ✅
8. **Facturen:** buiten 7.6.3-scope (latere compliance-/facturatiesprint), maar de architectuur laat facturen later hetzelfde snapshot lezen. ✅
