# Schiphol Compliance Dossier

**Status:** open — wacht op schriftelijk antwoord van Schiphol
**Laatst bijgewerkt:** 20 juli 2026
**Eigenaar:** eigenaar T4XI / Noir Driving Services

Dit dossier scheidt wat vaststaat van wat wordt aangenomen. Alles in de tweede
categorie is gemarkeerd als `ONBEVESTIGD` en mag niet als grondslag dienen voor
een prijs, een belofte aan klanten of een operationele afspraak.

---

## 1 · Vastgestelde feiten

Geverifieerd tegen de productiedatabase op 20 juli 2026.

### Routecatalogus

| | Aantal |
|---|---|
| Routes **naar** Schiphol, actief | **31** |
| Routes **naar** Rotterdam The Hague Airport, actief | **2** |
| Routes **vanaf** een luchthaven, actief | **0** |
| Routes **vanaf** een luchthaven, staged | **0** |
| Totaal actief | 43 |
| Totaal staged (intercity + wijk-airport) | 30 |

Er bestaat op dit moment geen enkele route waarbij een luchthaven het vertrekpunt
is. Een aanvraag Schiphol → stad levert `route_not_fixed` op en valt terug op
"offerte op aanvraag".

### Architectuur

De prijsengine is **strikt richtinggevoelig**: `findFixedRoute()` matcht
`pickup_location_id` én `dropoff_location_id` exact. Er is geen omgekeerde lookup
en geen symmetrie-aanname. Een retourroute is dus een aparte rij, geen afgeleide.

Sinds commit `1481216` bestaat er één centrale luchthavencontext
(`airportContext()` in `lib/pricing/service.ts`) die richting bepaalt uit
`locations.location_type`:

| Situatie | `flight_direction` |
|---|---|
| Luchthaven als vertrekpunt | `arrival` |
| Luchthaven als bestemming | `departure` |
| Beide zijden luchthaven | `arrival` (ophaling is operationeel bepalend) |
| Geen luchthaven | `null` |

De quote-API, het boekingsformulier en de booking-route lezen alle drie dat ene
object. De klant kiest de richting niet zelf.

### Datamodel

`public.bookings` bevat `flight_number` en `flight_direction` (nullable, met
CHECK-constraint op `arrival`/`departure`). `create_booking()` heeft precies één
signatuur met 18 parameters — geverifieerd, geen overload.

### Vastgelegd beleid

| Onderwerp | Vastgesteld |
|---|---|
| Inbegrepen wachttijd bij aankomst | 60 minuten vanaf de **geregistreerde landingstijd** |
| Vluchtstatus volgen | handmatig, op basis van het opgegeven vluchtnummer |
| Communicatie ophaallocatie | ná landing, persoonlijk via WhatsApp of telefoon |
| Chauffeurskwalificatie | geldige Nederlandse taxichauffeurskaart |
| Prijsvorm | één inclusieve vaste prijs, geen aparte toeslagregel |

Dit beleid staat in `app/voorwaarden/page.tsx`, artikel 3.

### Kostenmodel

Uit `lib/pricing-brain/cost-model.ts`: vaste overhead €7, €0,42 per kilometer,
€0,72 per minuut chauffeurstijd. Doelmarge 35%, cost-floor 20%.

---

## 2 · Externe afhankelijkheden

Geen van onderstaande punten is schriftelijk bevestigd. Ze zijn afkomstig uit
redenering, niet uit een bron.

| Onderwerp | Status | Bron | Blokkeert |
|---|---|---|---|
| Officiële ophaallocatie voor vooraf geboekte taxi's | `ONBEVESTIGD` | geen | activatie arrival-routes |
| Wachtrecht op die locatie | `ONBEVESTIGD` | geen | prijsmodel én operationeel ontwerp |
| Parkeerregime en tarief | `ONBEVESTIGD` | geen | prijsmodel |
| Toegangsregime (pas, registratie, autorisatie) | `ONBEVESTIGD` | geen | activatie arrival-routes |
| Eventuele contractplicht met Schiphol | `ONBEVESTIGD` | geen | activatie arrival-routes |
| Afwijkende regels bij vluchtvertraging | `ONBEVESTIGD` | geen | houdbaarheid 60-minutenbelofte |
| Loopafstand aankomsthal → ophaallocatie | `ONBEVESTIGD` | geen | houdbaarheid 60-minutenbelofte |
| Overdraagbaarheid platformpassen (Uber/Bolt) naar eigen boekingen | `ONBEVESTIGD` | geen | activatie arrival-routes |
| Alternatieve taxizone met afwijkend regime | `ONBEVESTIGD` | geen | prijsmodel |

### Wat als rekenparameter is gebruikt

In de scenario-analyses is gerekend met **€2,60 per begonnen 20 minuten**. Dat is
een parameter om gevoeligheid mee te tonen, **geen vastgesteld tarief**. Hij staat
nergens in productiecode. Zodra het werkelijke regime bekend is, moeten alle
scenario's opnieuw worden doorgerekend.

### Waarom wachtrecht het zwaarst weegt

De vraag "mag daar gewacht worden" bepaalt niet alleen de kosten maar het hele
operationele ontwerp. Mag het niet, dan parkeert de chauffeur elders, wacht daar,
en rijdt pas voor wanneer de klant zich meldt. Dat verandert de parkeerkosten, de
chauffeurstijd en het moment van klantcontact. De 60-minutenbelofte blijft dan
houdbaar, maar de kostenstructuur eronder is een andere.

---

## 3 · Wat níét blokkeert

De volgende punten zijn bewust zó ontworpen dat het antwoord van Schiphol er geen
wijziging in vereist:

- **Code.** Nergens is een ophaallocatie vastgelegd. Zie ADR-011.
- **Voorwaarden.** Artikel 3 zegt dat de locatie na landing wordt afgestemd, met
  de motivering dat luchthavens plaatsen aanwijzen en kunnen wijzigen.
- **Bestaande routes.** De 33 actieve routes naar een luchthaven raken dit dossier
  niet: daar zet de chauffeur af en vertrekt weer.

---

## 4 · Open acties

| # | Actie | Eigenaar |
|---|---|---|
| 1 | Vragenlijst versturen aan Schiphol Area & Access Control | eigenaar |
| 2 | Antwoord archiveren in dit dossier, met datum en afzender | eigenaar |
| 3 | Statusvelden bijwerken van `ONBEVESTIGD` naar bevestigd | eigenaar |
| 4 | Prijsscenario's herrekenen met werkelijke parkeerkosten | ontwikkeling |
| 5 | Zes arrival-routes in staging plaatsen | ontwikkeling |

Zie `docs/compliance/schiphol-questionnaire.md` voor de vragenlijst.

---

## 5 · Overige openstaande compliance-punten

Deze blokkeren de **website**, niet de luchthavenmodule. Ze staan hier zodat het
overzicht compleet is:

| Onderwerp | Status |
|---|---|
| Juridische toetsing privacyverklaring en voorwaarden | open |
| BTW-identificatienummer | ontbreekt, zichtbaar gemarkeerd in beide documenten |
| Bewaartermijnen (anders dan de wettelijke 7 jaar) | nog vast te stellen |
| Verwerkersovereenkomsten Supabase, Resend, Google, Vercel | open |
