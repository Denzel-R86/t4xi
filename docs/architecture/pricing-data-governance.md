# Prijsdata-governance

## Identiteit van een prijsrij

`fixed_route_prices.id` is een **technische** primaire sleutel. Hij wordt aangemaakt met
`gen_random_uuid()` en is daarom per omgeving anders. Hij hoort nergens in een migratie te
staan.

De **business-identiteit** van een vaste route is:

```
pickup locations.slug  +  dropoff locations.slug  +  vehicle_classes.code
```

Alle drie zijn `UNIQUE` en identiek tussen omgevingen. Ze resolven naar de al bestaande
`unique (pickup_location_id, dropoff_location_id, vehicle_class_id)`, die als conflictdoel
dient. `service_type` is geen onderdeel van de sleutel: de triple is aantoonbaar al uniek over
alle 89 productierijen.

## Regel

Een migratie die prijsdata aanraakt selecteert rijen via slug en code, nooit via
`fixed_route_prices.id`.

Waarom dit een regel is en geen voorkeur: de drie migraties van 2026-09-25 deden het anders.
Ze targetten hard-coded UUID's uit productie. Op elke andere database raakten ze **nul** rijen,
dus de correcties bestonden alleen op productie terwijl de repository suggereerde dat ze
gemigreerd waren.

## De drie migraties van 25 september

`20260925121211`, `20260925121843` en `20260925122616` zijn **recovered historical ledger
artifacts**. Hun SQL is byte-identiek aan wat productie's `supabase_migrations.schema_migrations`
heeft opgeslagen; het oorspronkelijke Git-bestand is niet teruggevonden en de oorspronkelijke
bytes zijn dus niet bewijsbaar.

Ze staan in de keten omdat productie die versies al kent en de migratie-boekhouding anders niet
sluit. Op een verse installatie doen ze `UPDATE 0` — dat is correct en verwacht: de UUID's die
ze targetten bestaan daar niet. De prijsstate wordt daarna alsnog bereikt door de canonieke
baseline.

## Canonieke baseline

`20260928120000_pricing_canonical_baseline.sql` legt de 89 vaste-routetarieven vast zoals
productie ze op 2026-09-28 draaide, read-only uitgelezen. Het is **geen nieuwe commerciële
prijsbeslissing** — het maakt een bestaande source of truth reproduceerbaar.

De migratie is idempotent en op productie business-semantisch een no-op. Twee guards:
een onbekende slug of code werpt een exception in plaats van stil over te slaan, en bestaande
routes buiten de canonieke set worden gemeld maar niet overschreven of verwijderd.

## Toekomstige prijswijzigingen

Een tariefwijziging is deterministisch, staat in versiebeheer en heeft regressiedekking. Ze
gebruikt de business key, niet het id.

Een prijswijziging die alleen op één database wordt uitgevoerd — via dashboard of los script —
is geen toegestane werkwijze. Dat is precies hoe 42 routes en zeven correcties buiten
versiebeheer terechtkwamen.

## Bewaking

- `lib/pricing/canonical-baseline.test.ts` — bewaakt de 89 business keys, hun uniciteit en de
  fingerprint van de canonieke state. Draait zonder database.
- `scripts/pricing/verify-canonical-baseline.ts` — vergelijkt een **echte** database met de
  canonieke baseline. De bestaande pricingtests mocken de database; daardoor kon een verse
  installatie 47 in plaats van 89 routes opleveren zonder dat één test viel.
