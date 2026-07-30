# Price Snapshot Contract — ontwerp (PR 7.6.3A)

**Status:** ONTWERP. Dit document beschrijft het datamodel en de invarianten voor
de persistente prijs-snapshot en de quote-lock. **Er wordt niets geïmplementeerd,
niets gemigreerd en niets opgeslagen.** Het dient als contractreview vóór PR 7.6.3B
(database) überhaupt geschreven wordt.

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

```ts
type PriceSnapshot = {
  quoteId: string;            // server-side gegenereerd; stabiel door de hele flow
  pricingVersion: string;     // bv. "2026.07.v1" — inert in 7.6.3 (opgeslagen, niet vertakt)
  currency: "EUR";

  // ── Geld: uitsluitend integer cents (geen floats) ──
  subtotalCents: number;      // basis (vandaag: de fixed-route prijs) in cents
  adjustments: PriceAdjustment[]; // additief; leeg in 7.6.3 (nog geen toeslagen)
  totalCents: number;         // = subtotalCents + Σ adjustments[].amountCents

  routeSnapshot: RouteSnapshot;
  createdAt: string;          // ISO-8601 UTC — moment van vastleggen
};

type PriceAdjustment = {
  code: string;               // machine-leesbaar, bv. "return_discount" (toekomst)
  label: string;              // klantzichtbaar
  amountCents: number;        // + = toeslag, − = korting; additief, nooit verborgen
  taxable: boolean;
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

## 4. `quoteId` — levensduur & lock

- **Generatie:** server-side (bv. UUID v4 of `gen_random_uuid()` in de DB),
  **nooit** door de client aangeleverd.
- **Stabiliteit:** één `quoteId` loopt ongewijzigd door: quote → booking →
  PaymentIntent-metadata → webhook-verwerking → bevestiging → e-mail → dashboard →
  factuur. Iedereen leest hetzelfde record.
- **Lock:** zodra een prijs geaccepteerd is, wordt **niet herberekend**; alle
  consumers lezen `totalCents` uit de snapshot. Stripe rekent uitsluitend met
  `snapshot.totalCents` (via de bestaande server-side afleiding), nooit met een
  client-bedrag.

## 5. Kernbeslissing vóór 7.6.3B — wanneer ontstaat de snapshot?

Dit bepaalt het datamodel en moet expliciet gekozen worden vóór er een migratie
geschreven wordt.

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

Optie A is de kleinste stap maar levert niet de volledige lock. De keuze is aan
Denzel; dit document schrijft nog geen migratie.

## 6. Geldrepresentatie & invarianten

1. **Alle bedragen in integer cents.** Geen floats in de snapshot. Conversie blijft
   via de bestaande `eurosToCents` (één afronding, `Math.round(euros*100)`).
2. `totalCents === subtotalCents + Σ adjustments[].amountCents` — hard afdwingen.
3. `adjustments` is **strikt additief en expliciet**; geen verborgen dubbele
   toepassing (zakelijke beslissing #1). In 7.6.3 is de array **leeg**.
4. `currency === "EUR"`.
5. Een vastgelegde snapshot is **immutabel**: latere tariefwijzigingen raken 'm niet.
6. `pricingVersion` en `quoteId` zijn verplicht en niet-leeg zodra een snapshot bestaat.

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

## 9. Voorgestelde PR-opdeling 7.6.3 (alleen 7.6.3A wordt nu opgeleverd)

| Sub-PR | Inhoud | Muteert productie? |
|--------|--------|---------------------|
| **7.6.3A** | **Dit ontwerpdocument. Geen code, geen DB.** | **nee** |
| 7.6.3B | Additieve tabel(len)/kolommen (`price_snapshots`), nog niet gebruikt | migratie op staging eerst |
| 7.6.3C | `calculateBookingPrice` → snapshot; booking refereert `quoteId` | ja (gedrag) |
| 7.6.3D | Stripe gebruikt uitsluitend `snapshot.totalCents` | ja (gedrag) |
| 7.6.3E | Bevestiging, e-mail, dashboard, factuur lezen exact dezelfde snapshot | ja (gedrag) |

## 10. Expliciet buiten scope van 7.6.3A

Geen database-, schema-, RPC-, UI-, Stripe-, voertuig-, notes- of tussenstop­wijziging.
Geen actieve toeslagen. Geen dynamische fallback. Geen code. Uitsluitend dit ontwerp.

## 11. Open beslissingen voor Denzel (vóór 7.6.3B)

1. **Snapshot-moment:** Optie A (bij acceptatie) of B (bij preview, aanbevolen)?
2. **Geldigheidsvenster** van een preview-quote (bv. 15/30/60 min) — alleen relevant bij Optie B.
3. **`quoteId`-type:** UUID (DB-`gen_random_uuid()`) akkoord?
4. **`pricingVersion`-startwaarde:** `"2026.07.v1"` akkoord, en waar leeft de constante (pricing-engine)?
5. **Opschoning** van niet-geboekte preview-snapshots (TTL/cron) — nodig bij Optie B.
6. **Facturen** binnen 7.6.3E-scope, of pas in de latere compliance-stap (#9 in de roadmap)?
