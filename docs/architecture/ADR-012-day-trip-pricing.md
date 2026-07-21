# ADR-012 — Prijsstrategie voor dagtochten

**Status:** `Proposed`
**Datum:** 21 juli 2026
**Context:** Sprint 12.3 — Single Source of Truth
**Voorafgaand onderzoek:** auditrapport dagtochten, 21 juli 2026

---

## Context

Er bestaan op dit moment **drie** bronnen voor dezelfde dagtochtprijs, die elkaar
tegenspreken.

**1 · De contentbron.** `lib/dagtochten.ts` bevat tien dagtochten met vaste
pakketprijzen van €349 tot €1.295, plus afstanden en rijtijden. Geen van die
waarden is herleidbaar tot een berekening of externe bron; ze zijn overgenomen uit
het oude v14-bronbestand.

**2 · De prijsengine.** Die kent deze prijzen niet. Voor elke dagtochtbestemming
antwoordt `/api/pricing/quote` met "Offerte op aanvraag":

```
amsterdam → brugge      Offerte op aanvraag
amsterdam → antwerpen   Offerte op aanvraag
amsterdam → keulen      Offerte op aanvraag
```

De klant ziet dus een prijs op `/dagtochten` die het boekingssysteem niet kent.

**3 · De routedataset.** `data/pricing/fixed-routes.master.csv` bevat 60 inactieve
`day_trip`-regels met afstandsgebaseerde prijzen per vertrekstad. Die liggen
9% tot 76% onder de publieke pakketprijzen:

| Bestemming | Contentbron | CSV (executive-ev) |
|---|---|---|
| Antwerpen | €595 | €420 – €551 |
| Brugge | €795 | €504 – €658 |
| Brussel | €795 | €471 – €636 |
| Düsseldorf | €795 | €452 – €671 |
| Keulen | €795 | €504 – €732 |

Twee modellen die elkaar uitsluiten: de contentbron heeft **één prijs per
bestemming**, de CSV **een prijs per vertrek-bestemmingpaar**.

### Waarom dit nu speelt

Bovendien is niet vastgesteld of de chauffeur tijdens het bezoek beschikbaar
blijft. Dat is geen detail — het is de grootste enkele onzekerheid in de hele
prijsstelling. Doorgerekend met het bestaande kostenmodel (€7 + €0,42/km +
€0,72/min):

| Dagtocht | Prijs | Halve dag (4u) | Werkdag (8u) | 08:00–20:00 (12u) |
|---|---|---|---|---|
| Keukenhof | €349 | €213 · **39%** | €386 · **−11%** | €559 · **−60%** |
| Delft | €499 | €247 · 51% | €420 · 16% | €593 · **−19%** |
| Antwerpen | €595 | €306 · 49% | €479 · 20% | €651 · **−9%** |
| Brugge | €795 | €381 · 52% | €554 · 30% | €727 · 9% |

Het verschil tussen een halve en een hele dag is 8 × 60 × €0,72 = **€345,60 per
rit** — meer dan de volledige verkoopprijs van Keukenhof.

Deze tabel toont dat de duur een dominante kostenfactor is. Zij zegt **niet** welke
duur juist is. Dat volgt uit de productdefinitie, niet uit het kostenmodel; zie de
besluitvolgorde hieronder.

---

## Beslissingsopties

### Optie A — Zelfstandig marketingproduct

De dagtochtenpagina beheert haar eigen vaste prijzen.

- Prijs blijft in het contentbestand
- Quote-engine geeft "offerte op aanvraag"
- Boeking verloopt via persoonlijk contact
- Geen koppeling met route- of kostenmodel

**Voor:** kleinste technische verandering, volledige commerciële vrijheid,
geschikt voor maatwerk.

**Tegen:** meerdere prijssystemen naast elkaar, risico op afwijkende prijzen,
handmatig onderhoud, beperkte boekingsautomatisering.

> Dit is feitelijk de huidige situatie — inclusief het probleem dat de pagina een
> prijs toont die de engine niet kent. Optie A kiezen betekent die discrepantie
> bewust aanvaarden en expliciet communiceren, niet hem laten bestaan.

### Optie B — Volledig engineproduct

Elke dagtocht wordt door de prijsengine berekend.

- Prijs uit routeafstand, reistijd, chauffeurstijd en overige kosten
- Website en offerte gebruiken dezelfde berekening
- `lib/dagtochten.ts` bevat uitsluitend redactionele content

**Voor:** echte Single Source of Truth, consistente berekening, schaalbaar naar
nieuwe vertrekplaatsen.

**Tegen:** het operationele model moet eerst exact vaststaan, vaste
marketingprijzen kunnen verschuiven, complexere implementatie, en routekosten
alleen volstaan niet.

> Keukenhof laat zien waarom dat laatste geen theoretisch bezwaar is. Op afstand
> gerekend is het een rit van 40 km; op gebonden chauffeurstijd een dagproduct van
> €559 kostprijs. Geen van beide levert €349 op. Een puur afstandsmodel prijst dit
> product structureel verkeerd.

### Optie C — Centraal pakketproduct *(aanbevolen)*

De prijs blijft een bewust vastgesteld pakketbedrag, maar wordt centraal beheerd
en door de prijsengine ontsloten.

- Content blijft in `lib/dagtochten.ts`
- Pakketprijs staat in één centrale pricingbron
- Website, quote en boeking halen die prijs uit dezelfde bron
- De prijs hoeft niet afstandsgebaseerd te zijn
- Interne kostencalculatie **valideert** het pakketbedrag in plaats van het te
  bepalen
- De engine rekent niet dynamisch, maar distribueert wel één officieel bedrag

**Voor:** vaste premiumpositionering, één klantzichtbare prijsbron, controle over
marges, website en API lopen gelijk, later uit te breiden met
vertrekplaatsvarianten.

**Tegen:** pakketprijzen moeten eerst operationeel gevalideerd worden, vraagt
migratie van contentprijzen naar pricingdata, en vereist een heldere definitie
van wat inbegrepen is.

---

## Aanbevolen beslissing

**Optie C.**

Een dagtocht is inhoudelijk geen intercityrit. De klant koopt geen kilometers maar
een gereserveerde chauffeur, beschikbaarheid, planning en een dagarrangement. De
verkoopprijs mag daarom niet rechtstreeks worden afgeleid uit alleen kilometers,
kale rijtijd en een retourmultiplier.

De prijs wordt als pakket vastgesteld op basis van onder meer:

- totale chauffeurstijd
- totale voertuigkilometers
- wachttijd of beschikbaarheid op locatie
- parkeer- en tolkosten
- gewenste marge
- operationele buffer

Na vaststelling wordt dat bedrag centraal opgeslagen en door alle kanalen
gebruikt.

Dit is dezelfde conclusie als bij luchthavenophalingen (ADR-011 en Sprint 11.1):
**bij een product waar de chauffeur gebonden is, domineert tijd de kosten, niet
afstand.** Het verschil is dat een dagtocht dat in extremere mate doet.

### Ontwerpregel: de klant koopt een product, geen kostenmodel

De interne kostprijsberekening en de externe verkoopprijs mogen bewust van elkaar
gescheiden zijn. De kostprijs is een **toets**, geen formule waaruit de prijs
rolt.

Dat betekent concreet:

- Een pakketprijs hoeft niet evenredig met afstand of duur te bewegen.
- Twee tochten met vergelijkbare kosten mogen verschillend geprijsd zijn wanneer
  ze commercieel verschillen.
- Een tocht mag onder de doelmarge liggen als daar een expliciete reden voor is —
  mits die reden is vastgelegd en niet per ongeluk ontstaat.
- De klant ziet nooit een opbouw van kostenposten, maar één bedrag met een
  heldere omschrijving van wat erin zit.

Dit is dezelfde lijn als bij de Airport Arrival Service: waarde specificeren, niet
kosten. Het onderscheidt een premium dienst van een rekenmachine.

Wat deze regel **niet** toestaat: een prijs die niemand heeft getoetst. De
scheiding tussen kostprijs en verkoopprijs is een bewuste keuze per product, geen
vrijbrief om de kostprijs niet te kennen.

---

## Gevolgen

Na goedkeuring:

- `lib/dagtochten.ts` houdt uitsluitend redactionele content
- Publieke prijzen verdwijnen daaruit
- Prijs, afstand en reistijd krijgen een centrale eigenaar
- De 60 inactieve CSV-regels worden **niet** automatisch geactiveerd; eerst wordt
  vastgesteld of ze vervallen of worden vervangen
- Website en quote-engine tonen hetzelfde resultaat
- Geen dagtocht wordt actief boekbaar voordat de kostprijs is gevalideerd

Wat dit besluit **niet** doet: het legt geen enkele prijs vast. Dat kan pas na de
open vragen hieronder.

---

## Open beslissingen vóór implementatie

De volgorde is dwingend. Elke stap is pas te beantwoorden wanneer de vorige vast
staat.

### Stap 1 — Productdefinitie

**Wat koopt de klant precies?** Dit is een bedrijfskeuze, geen uitkomst van een
berekening.

| Variant | Wat de klant koopt | Wat dit met de kosten doet |
|---|---|---|
| 1 | Vervoer heen en terug; chauffeur vertrekt tussentijds | Alleen rijtijd telt; chauffeur kan tussentijds ander werk doen |
| 2 | Vervoer plus wachttijd; chauffeur blijft beschikbaar | Volledige dagduur telt als chauffeurstijd |
| 3 | Volledige privéchauffeur voor een dag | Als 2, plus ritten tussen locaties gedurende de dag |
| 4 | Arrangement met vaste maximale duur | Als 2, maar met een plafond dat de staart afsnijdt |

De duurtabel hierboven hoort bij varianten 2, 3 en 4. Bij variant 1 is de kostprijs
fundamenteel lager en beweegt hij wél met afstand mee — dan zijn Keukenhof en
Brugge echt verschillende producten in plaats van één productcategorie.

Deze keuze bepaalt ook of één pakketprijs per bestemming houdbaar is.

### Stap 2 — Operationele duur

Volgt uit stap 1, en is pas daarna te beantwoorden:

| # | Vraag |
|---|---|
| 1 | Hoeveel chauffeurstijd is inbegrepen? |
| 2 | Hoeveel vrije tijd op locatie krijgt de klant? |
| 3 | Wat is de maximale ritduur? |
| 4 | Welke regels gelden bij uitloop? |
| 5 | Wat is de meerprijs per extra uur? |

Pas hierna is een kostprijsmodel te maken.

### Stap 3 — Overige openstaande vragen

| # | Vraag | Waarom het uitmaakt |
|---|---|---|
| 6 | Zijn parkeren, tolwegen en milieuzones inbegrepen? | Buitenlandse tochten raken alle drie |
| 7 | Vertrek uit Amsterdam, of meerdere vertrekplaatsen? | Bepaalt of één prijs per bestemming houdbaar is |
| 8 | Gewenst minimaal brutomargepercentage? | Toetssteen voor elk pakketbedrag |
| 9 | Zijn maaltijden of overnachting van de chauffeur ooit relevant? | Luxemburg en Rijnvallei zijn lange dagen |
| 10 | Welke bagagecapaciteit wordt gegarandeerd? | Nu staat er "Bagage in overleg" — dat zegt niets |
| 11 | Directe online boeking, of handmatige bevestiging? | Bepaalt of de engine bindend moet prijzen |

Vraag 9 is alleen relevant bij varianten 2 en 3. Vraag 11 volgt grotendeels uit
stap 1: een strak gedefinieerd arrangement is te automatiseren, volledig maatwerk
niet.

---

## Wat er tot goedkeuring niet gebeurt

Geen code, geen prijsdata, geen CSV-regels, geen migraties. De tien
contentprijzen blijven staan zoals ze zijn — inclusief de bekende discrepantie
met de engine, die met dit besluit wordt opgelost en niet eerder.
