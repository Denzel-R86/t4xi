# Verificatieverkeer markeren — voorstel

**Opgesteld:** 2026-10-12 · **Status:** VOORSTEL, niet geïmplementeerd

De uitsluitingslijst in `lib/pricing/event-shadow-test-traffic.ts` is een correctie
achteraf. Dit document beschrijft de structurele weg, zodat een volgende
verificatieronde de Gate 6.4-tellers niet opnieuw vervuilt.

---

## Het probleem

`markObservationsSynthetic` is een server-side dependency van
`calculateBookingPrice`. De publieke route `/api/pricing/quote` zet die vlag niet
— en hoort dat ook niet te doen, want een publiek veld dat observaties als
synthetisch markeert, is een productie-achterdeur: wie het kent kan zijn eigen
ritten uit de meting houden.

Gevolg: elke verificatie via de echte API levert observaties met
`is_synthetic = false` op. Die tellen mee als echt klantbewijs.

Op 2026-10-12 leverde dat 22 quotes op waarvan 17 aantoonbaar machinaal waren.
Het onderscheid kon alleen achteraf worden gemaakt, uit de aankomstintervallen —
0,75 tot 3,07 seconden voor de testreeksen tegen 13,98 tot 44,88 seconden voor
verkeer dat niet aantoonbaar test was. Dat is forensiek, geen meetopzet.

## Waarom de payload nu geen uitsluitsel geeft

`pricing_quote_logs.request_payload` bevat uitsluitend `pickup`, `dropoff`,
`luggage`, `passengers`, `returnTrip` en `vehicleClass`. Geen datum, geen tijd,
geen bron, geen user-agent. Er is dus geen enkel veld waaraan testverkeer te
herkennen is.

## Voorgestelde oplossing

Een header die alleen werkt met een geheim, en die uitsluitend de **observatie**
markeert — nooit de prijs.

```
x-t4xi-verification: <waarde van VERIFICATION_TOKEN>
```

1. De route leest de header en vergelijkt hem in constante tijd met
   `process.env.VERIFICATION_TOKEN`. Ontbreekt de variabele, dan is de functie
   uit en wordt de header genegeerd.
2. Bij een match geeft de route `markObservationsSynthetic: true` mee aan
   `calculateBookingPrice`. Dat pad bestaat al; er komt geen nieuwe logica bij.
3. De klantprijs verandert niet. De vlag raakt uitsluitend
   `pricing_event_shadow_logs.is_synthetic`.
4. Zonder geldige header gedraagt de route zich exact zoals nu.

### Waarom dit veilig is

De vlag kan de prijs niet beïnvloeden — `observeEventFees` loopt ná de
snapshotopbouw en `chargeable` hangt uitsluitend aan `mode === "live"`. Een
aanvaller met het token kan dus niet goedkoper rijden; hij kan alleen zijn eigen
observatie uit een interne meting houden. Dat is een beperkt belang, en het token
hoort bij de overige productiegeheimen in Vercel.

### Wat het oplost

`is_synthetic = true` wordt dan weer een betrouwbaar onderscheid, en de bestaande
filter in `selectDecisionPopulation()` doet de rest. De handmatige
uitsluitingslijst hoeft niet meer te groeien.

## Werkwijze zolang dit niet is geïmplementeerd

1. **Kies een vertrekdatum buiten elk eventvenster.** Dan is de observatie
   `matched = false` en raakt ze de 30-matched-drempel niet. Dat is de
   belangrijkste drempel en de enige die niet door volume te halen is.
2. **Leg de quote-id's direct vast** en voeg ze toe aan
   `EXCLUDED_TEST_TRAFFIC`, mét het gemeten interval als bewijs.
3. **Draai verificatiequotes aaneengesloten**, niet verspreid: dan is het
   machinale tempo aantoonbaar en blijft het onderscheid met echt verkeer scherp.
4. **Verifieer bij voorkeur op een Preview-deployment**, die naar staging wijst.
   Dan ontstaat er geen productieobservatie. Dat was de weg bij PR #78; bij
   PR #74 kon het niet, omdat de routes juist op productie moesten worden
   nagerekend.

## Wat dit níet oplost

Het onderscheid tussen een bezoeker zonder boekingsintentie en iemand die
afhaakt vóór de prijsaanvraag. Daarvoor is bezoekersmeting nodig, en die
ontbreekt volledig op productie — zie `t4xi-funnel-meetgat` in de projectnotities.
