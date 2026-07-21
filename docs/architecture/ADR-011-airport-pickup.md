# ADR-011 — De ophaallocatie op een luchthaven wordt niet in het systeem vastgelegd

**Status:** aanvaard
**Datum:** 20 juli 2026
**Context:** Sprint 11.1 / 11.2 — luchthavenophalingen

> **Nummering.** Dit is de eerste ADR in deze repository. Het nummer 011 sluit aan
> op de sprintnummering, niet op een reeks ADR-001 tot en met 010 — die bestaan
> hier niet. Zoek er niet naar.

---

## Context

T4XI wil ritten aanbieden waarbij een passagier op Schiphol wordt opgehaald. Dat
is operationeel iets anders dan een afzetrit: de chauffeur moet ergens naartoe
rijden, daar mogelijk wachten, en de passagier moet die plek kunnen vinden.

De verleiding is om die plek in het systeem vast te leggen — in de
boekingsbevestiging, in de vervoersvoorwaarden, in een constante, of in een
databasekolom. Dat lijkt behulpzaam voor de klant en maakt de bevestigingsmail
concreter.

Op het moment van dit besluit is echter **geen enkel gegeven over het Schiphol-
ophaalregime schriftelijk bevestigd**. Niet welke locatie is aangewezen voor
vooraf geboekte taxi's, niet of daar gewacht mag worden, niet welk tarief geldt,
en niet welke toegangsautorisatie vereist is. Zie
`docs/compliance/schiphol-operation.md`.

---

## Overwogen opties

| Optie | Waarom niet gekozen |
|---|---|
| **App Pick Up Point** | Toegangsregime en toepasselijkheid op eigen boekingen onbevestigd. Platformpassen zijn vermoedelijk gebonden aan het platform waarvoor ze zijn uitgegeven. |
| **P41** | Geen bevestiging dat dit voor vooraf geboekt taxivervoer is aangewezen, noch over wachten of tarief. |
| **P1** | Als parkeerlocatie denkbaar, maar loopafstand en tarief onbevestigd. Bovendien: parkeren is iets anders dan een aangewezen ophaalplaats. |
| **Taxistandplaats** | Bedoeld voor opstapvervoer zonder reservering. Toepassing op vooraf geboekte ritten onbevestigd, en mogelijk gebonden aan een vergunningsregime. |

Elke optie hierboven berust op gevolgtrekking, niet op een bron. Vastleggen van
één ervan zou een aanname tot systeemgedrag promoveren.

---

## Besluit

**De ophaallocatie wordt operationeel bepaald en na de landing persoonlijk met de
klant afgestemd. Het systeem legt geen locatie vast.**

Concreet betekent dat:

1. Geen constante, kolom, configuratiewaarde of enum met een ophaallocatie.
2. Geen locatie in de boekingsbevestiging of in de operationele notificatie.
3. De vervoersvoorwaarden noemen géén plek, maar het **proces**: na landing
   stemmen wij de exacte locatie persoonlijk af via WhatsApp of telefoon, met de
   motivering dat luchthavens op- en afstapplaatsen aanwijzen en kunnen wijzigen.
4. De operationele notificatie draagt dispatch op de aankomststatus te
   controleren en de locatie af te stemmen — het toont geen locatie en geen
   gesimuleerde vluchtstatus.

---

## Gevolgen

**Positief.** Het antwoord van Schiphol — welke locatie dat ook is — vereist geen
codewijziging, geen migratie en geen aanpassing van de juridische tekst. Wijzigt
Schiphol later zijn regime, dan verandert er een werkinstructie, geen software.
De architectuur is daarmee bestand tegen een externe onzekerheid die wij niet
beheersen.

**Negatief.** De klant weet bij het boeken nog niet precies waar hij moet staan.
Dat vraagt een betrouwbaar bericht ná de landing; dat bericht is nu de zwakke
schakel in plaats van de code. Die afweging is bewust: een onbetrouwbaar bericht
is te repareren, een verkeerde belofte in de voorwaarden niet.

**Neutraal.** De inbegrepen wachttijd van 60 minuten start bij de geregistreerde
landingstijd en is daarmee onafhankelijk van waar wordt opgehaald. De belofte
blijft dus geldig ongeacht de uitkomst.

---

## Wanneer dit besluit herzien mag worden

Uitsluitend wanneer Schiphol **schriftelijk** heeft bevestigd welke locatie voor
vooraf geboekte taxi's is aangewezen, of daar gewacht mag worden en onder welke
voorwaarden. Ook dán is vastleggen in code niet vanzelfsprekend: de vraag blijft
of de winst voor de klant opweegt tegen de gebondenheid.

Wat in elk geval **niet** volstaat om dit besluit te herzien: een pagina op een
website, ervaring van een chauffeur, of een redenering over hoe het waarschijnlijk
zit.
