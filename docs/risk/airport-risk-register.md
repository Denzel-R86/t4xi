# Risicoregister — luchthavenophalingen

**Laatst bijgewerkt:** 20 juli 2026
**Scope:** ritten waarbij een luchthaven het vertrekpunt is (`flight_direction = arrival`)

Kans en impact zijn ingeschat, niet gemeten — er zijn nul uitgevoerde
luchthavenophalingen. Herzie dit register na de eerste tien ritten, wanneer het
meetinstrument echte cijfers heeft opgeleverd.

**Schaal:** laag · middel · hoog

---

## A1 · Schiphol wijzigt het ophaal- of toegangsregime

| | |
|---|---|
| **Kans** | Middel — luchthavens herzien verkeersstromen periodiek |
| **Impact** | Laag |
| **Mitigatie** | ADR-011: geen locatie in code of voorwaarden. Een wijziging raakt een werkinstructie, geen software |
| **Eigenaar** | eigenaar |

De impact is laag *omdat* het besluit uit ADR-011 is genomen. Zou de locatie wél
zijn vastgelegd, dan was dit een hoog risico met een release als gevolg.

---

## A2 · Wachten is niet toegestaan op de aangewezen locatie

| | |
|---|---|
| **Kans** | Middel — onbevestigd |
| **Impact** | **Hoog** |
| **Mitigatie** | Alternatief ontwerp voorbereiden: chauffeur parkeert elders, wacht daar, rijdt voor op afroep. Prijsscenario's opnieuw doorrekenen met die kostenstructuur |
| **Eigenaar** | eigenaar (bevestiging) → ontwikkeling (herberekening) |

Dit is het zwaarste openstaande risico. Het raakt niet alleen de kosten maar het
hele operationele ontwerp: parkeerkosten, chauffeurstijd en het moment van
klantcontact veranderen alle drie. Zie vraag 3 en 5 in de vragenlijst.

---

## A3 · Wachttijd loopt structureel op boven 60 minuten

| | |
|---|---|
| **Kans** | Laag tot middel — onbekend zonder meting |
| **Impact** | **Hoog op korte routes** |
| **Mitigatie** | Meetinstrument bij de eerste 10–20 ritten. Overweeg een minimumprijs voor ophalingen in plaats van het inkorten van de belofte |
| **Eigenaar** | eigenaar |

De wachttijd is een vaste kostenpost die niet met afstand meebeweegt: 60 minuten
kost €43,20 aan chauffeurstijd, ongeacht of de rit 15 of 63 kilometer is. Op korte
routes eet dat de hele marge op. Uit de scenario-analyse: bij een toeslag van €30
gaat Schiphol → Amsterdam Centrum bij 41 minuten wachten door nul.

---

## A4 · Geen toegang zonder contract of autorisatie

| | |
|---|---|
| **Kans** | Onbekend — onbevestigd |
| **Impact** | **Hoog** |
| **Mitigatie** | Geen arrival-routes activeren vóór schriftelijke bevestiging. Nul routes staan actief of staged, dus de blootstelling is nu nul |
| **Eigenaar** | eigenaar |

Wordt toegang geweigerd of aan voorwaarden gebonden die T4XI niet vervult, dan
gaat het hele product niet door. Dat is acceptabel zolang er niets is verkocht —
en dat is precies de reden dat er nog niets is geactiveerd.

---

## A5 · Ophaallocatie wijkt af van wat de klant verwacht

| | |
|---|---|
| **Kans** | Middel |
| **Impact** | Middel |
| **Mitigatie** | Locatie wordt pas ná de landing gecommuniceerd, dus er is geen eerdere verwachting gewekt. Het bericht na landing moet betrouwbaar zijn |
| **Eigenaar** | operatie |

Het risico verschuift hiermee van "verkeerde belofte" naar "gemist bericht". Dat
tweede is te herstellen met een telefoontje; het eerste niet.

---

## A6 · Loopafstand is groter dan aangenomen

| | |
|---|---|
| **Kans** | Middel |
| **Impact** | Middel |
| **Mitigatie** | Loopafstand uitvragen (vraag 7). Meten via het veld *klant meldt bagage gereed* → *klant stapt in* |
| **Eigenaar** | eigenaar (uitvraag) → operatie (meting) |

Een lange loopafstand met bagage eet de inbegrepen tijd op vóórdat de chauffeur
iets fout doet. Het meetinstrument legt dit interval apart vast, zodat het
onderscheiden kan worden van douane- en bagagevertraging.

---

## A7 · Platformbeleid van derden verandert

| | |
|---|---|
| **Kans** | Laag voor T4XI |
| **Impact** | Laag |
| **Mitigatie** | T4XI opereert op eigen boekingen en is niet afhankelijk van een platformpas |
| **Eigenaar** | eigenaar |

Alleen relevant als T4XI ooit via een platform zou gaan rijden. Nu niet het geval.

---

## A8 · Vertraagde vlucht valt buiten kantooruren van dispatch

| | |
|---|---|
| **Kans** | Middel |
| **Impact** | Middel |
| **Mitigatie** | Draaiboek met controlemomenten op T−3u en T−1u. Bij nachtelijke aankomsten expliciet beleggen wie de status volgt |
| **Eigenaar** | operatie |

De vluchtcontrole is handmatig. Een aankomst om 02:30 met twee uur vertraging
vraagt om iemand die dat om 04:30 nog volgt. Dit risico is niet technisch maar
personeel.

---

## Samenvatting

| # | Risico | Kans | Impact |
|---|---|---|---|
| A2 | Wachten niet toegestaan | middel | **hoog** |
| A4 | Geen toegang zonder contract | onbekend | **hoog** |
| A3 | Wachttijd boven 60 minuten | laag–middel | **hoog** op korte routes |
| A5 | Locatie wijkt af van verwachting | middel | middel |
| A6 | Loopafstand groter | middel | middel |
| A8 | Vertraging buiten dispatch-uren | middel | middel |
| A1 | Regimewijziging | middel | laag |
| A7 | Platformbeleid derden | laag | laag |

De twee hoogste risico's — A2 en A4 — worden beide weggenomen door één
schriftelijk antwoord van Schiphol.
