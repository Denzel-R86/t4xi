# SEO-nulmeting — Search Console, 2026-09-02

**Meetdatum:** 2026-09-02
**Bron:** Google Search Console, export "Performance on Search"
**Periode:** laatste 3 maanden (2026-06-04 t/m 2026-09-02), zoektype Web
**Property:** lijkt een Domain-property — zowel `www.t4xi.nl` als `t4xi.nl` komen in de pagina-export voor

Dit is het nulpunt voor SEO Sprint 1. Het doel van dit document is dat over 4-8 weken
onomstotelijk vaststaat wat er vóór de wijzigingen gemeten werd, en met name dat
Almere en Spijkenisse toen letterlijk op nul stonden.

---

## 1. Totaal

| Meting | Waarde |
|---|---|
| Impressies (3 maanden) | 680 |
| Clicks | 6 |
| Unieke queries in export | 93 |
| Unieke pagina's met vertoningen | 23 |

**Google ontdekte de site pas half augustus.** Vóór 6 augustus: 13 impressies over
67 dagen (0,2 per dag). Vanaf 6 augustus: 667 impressies over 25 dagen (26,7 per dag).
Alle conclusies hieronder gaan dus feitelijk over een venster van circa vier weken.

---

## 2. Pagina's — de nulmeting per URL

| Pagina | Impressies | Clicks | Gem. positie |
|---|---|---|---|
| `/tarieven` | **552** | 0 | **58,4** |
| `/taxi-amsterdam-schiphol` | 45 | 0 | 69,9 |
| `https://www.t4xi.nl/` | 39 | 3 | 7,2 |
| `https://t4xi.nl/` | 20 | 3 | 13,4 |
| `/en` | 14 | 0 | 8,9 |
| `/diensten` | 10 | 0 | 2,8 |
| `/over-ons` | 10 | 0 | 5,2 |
| `/boeken` | 7 | 0 | 4,1 |
| `/partner` | 7 | 0 | 7,3 |
| `/zakelijk-vervoer` | 5 | 0 | 97,4 |
| `/en/tarieven` | 2 | 0 | 36,5 |
| `/en/taxi-spijkenisse-schiphol` | 2 | 0 | 5,5 |
| `/en/taxi-amsterdam-schiphol` | 1 | 0 | 83,0 |

`/tarieven` is goed voor **81% van alle vertoningen**. Alle 6 clicks komen van de
homepage op branded queries.

### Wat er NIET in staat

`/taxi-almere-schiphol` en `/taxi-spijkenisse-schiphol` (de Nederlandse versies)
komen in deze export **niet voor**. Zij hadden dus 0 vertoningen.

---

## 3. Queryclusters

| Cluster | Impressies | Aandeel | Gem. positie | Clicks |
|---|---|---|---|---|
| prijs/berekenen (calculator-intentie) | **476** | 77% | **58,1** | 0 |
| Amsterdam ↔ Schiphol | 42 | 7% | 70,8 | 0 |
| branded (`t4xi`) | 27 | 4% | 8,0 | 2 |
| zakelijk | 5 | 1% | 97,4 | 0 |
| **lokaal Almere/Spijkenisse** | **0** | **0%** | — | 0 |

Query-niveau telt 621 impressies en 2 clicks tegenover 680 en 6 op pagina-niveau;
dat verschil is Google's anonimisering van zeldzame queries, geen datafout.

### Grootste queries in het prijs-cluster

```
taxi prijs berekenen        90 impressies   positie 55,5
taxirit berekenen           74              59,8
taxi lange afstanden        29              70,3
kosten taxi lange afstand   26              57,8
taxirit bereken             22              59,4
taxi lange ritten           22              60,4
taxi tarief                 16              60,6
taxi berekenen              13              53,8
taxi kosten berekenen       13              56,7
taxitarieven                11              28,4
```

Google heeft `/tarieven` dus al gekoppeld aan een duidelijk en commercieel
zoekwoordcluster. Het probleem is niet relevantie maar positie.

---

## 4. De nul-baseline voor de lokale hubs

Dit is het punt waarop Sprint 1 wordt afgerekend. Op meetdatum gold:

| Query | Impressies | Positie |
|---|---|---|
| `taxi almere` | 0 | — |
| `taxi almere schiphol` | 0 | — |
| `taxi almere prijs` | 0 | — |
| `taxi spijkenisse` | 0 | — |
| `taxi spijkenisse schiphol` | 0 | — |
| `taxi spijkenisse prijs` | 0 | — |

**Oorzaak, vastgesteld op 2026-09-02:** er bestónden geen stadspagina's.
`/almere`, `/taxi-almere`, `/spijkenisse` en `/taxi-spijkenisse` gaven alle vier
een 404. Alleen de routepagina's `/taxi-almere-schiphol` en
`/taxi-spijkenisse-schiphol` bestonden, en die beantwoorden route-intentie, geen
stadsintentie. De eerdere aanname "de lokale landingspagina's bestaan al, dus het
is vooral een autoriteitskwestie" ging daarmee maar half op.

---

## 5. Technische basis op meetdatum

Read-only crawl van alle 36 sitemap-URL's, dezelfde dag:

| Meting | Resultaat |
|---|---|
| HTTP 200 | 36/36 |
| Canonical aanwezig | 36/36 |
| Hreflang aanwezig | 36/36 (`nl-NL`, `en`, `x-default`) |
| Pagina's met JSON-LD | 36/36 (80 blokken) |
| JSON-LD dat niet parseert | 0 |
| Meta description > 158 tekens | 16/36 |

`robots.txt` staat goed (`Allow: /`, met `/api/`, `/dashboard`, `/klant`, `/studio`
uitgesloten) en meldt de sitemap correct aan.

**www/non-www is correct geconfigureerd** en vraagt geen actie:

```
http://t4xi.nl/       308 → https://t4xi.nl/
https://t4xi.nl/      308 → https://www.t4xi.nl/
http://www.t4xi.nl/   308 → https://www.t4xi.nl/
canonical op non-www: https://www.t4xi.nl
```

Dat beide varianten in GSC voorkomen is een rapportage-artefact van een
Domain-property, geen indexeringsprobleem.

**Let op — nog OPEN:** dat alle 80 JSON-LD-blokken parseren is een JSON-syntaxcheck.
Het bewijst niet dat Google de structured data inhoudelijk geldig of geschikt voor
rich results acht. Structured data staat dus op *technisch PASS,
Google-validatie OPEN*.

`/tarieven` had op meetdatum **478 zichtbare woorden**, 4 h2/h3-koppen en 3
FAQ-vragen — dat is de inhoudelijke maat waartegen de uitbreiding in deze sprint
wordt afgezet.

---

## 6. Waar de volgende meting op let

1. Krijgen `/taxi-almere` en `/taxi-spijkenisse` überhaupt vertoningen? Van 0 naar
   consistente lokale impressies is in deze fase belangrijker dan positie.
2. Beweegt `/tarieven` van gemiddelde positie 58 richting 30, en daarna richting 20?
3. Blijft het clickaandeel branded, of gaan niet-branded queries clicks opleveren?

Let bij de interpretatie op het verschil in intentie: het prijs-cluster is hoog
volume met lage koopintentie (iemand zoekt een getal), lokale queries zijn lager
volume met hoge koopintentie. Positiewinst op `/tarieven` die geen boekingen
oplevert is een signaal om naar de lokale hubs te verschuiven, niet om meer van
hetzelfde te doen.

Herhaal voor een zuivere vergelijking dezelfde crawl en dezelfde
GSC-exportinstellingen (3 maanden, zoektype Web).
