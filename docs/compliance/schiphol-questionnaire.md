# Vragenlijst Schiphol — ophalen van vooraf geboekte passagiers

**Te richten aan:** Schiphol, Area & Access Control
**Doel:** schriftelijke bevestiging waarop het bedrijfsproces kan worden gebaseerd
**Status:** nog niet verzonden

Elke vraag hieronder blokkeert iets concreets. Vragen 3 en 4 wegen het zwaarst:
daar hangt niet alleen de prijs aan, maar het hele operationele ontwerp.

---

## Begeleidende tekst

> Geachte heer/mevrouw,
>
> Ik exploiteer een taxionderneming met een geldige Nederlandse taxivergunning.
> Mijn klanten boeken rechtstreeks via mijn eigen website; wij werken niet via
> Uber, Bolt of een ander platform. Wij willen passagiers die op Schiphol
> aankomen ophalen op basis van een vooraf geboekte rit met een vaste prijs.
>
> Graag ontvang ik schriftelijk antwoord op onderstaande vragen, zodat wij ons
> bedrijfsproces daarop kunnen inrichten.

---

## 1 · Officiële ophaallocatie

**Vraag.** Welke locatie is aangewezen voor het ophalen van passagiers door een
vooraf geboekte taxi?

**Waarom nodig.** Zonder dit weten wij niet waar de chauffeur heen rijdt en kunnen
wij de klant na landing geen plek noemen.

**Wat hiervan afhangt.** Het bericht na landing en de werkinstructie voor
chauffeurs. **Niet** de code of de vervoersvoorwaarden — die noemen bewust geen
locatie (ADR-011).

---

## 2 · Toegangsvoorwaarden

**Vraag.** Welke toegangspas, voertuigautorisatie, registratie of overeenkomst is
vereist om die locatie te gebruiken? Is een afzonderlijk contract met Schiphol
noodzakelijk?

**Waarom nodig.** Bepaalt of het product überhaupt geleverd kan worden en tegen
welke vaste kosten.

**Wat hiervan afhangt.** Of de zes ophaalroutes ooit geactiveerd worden. Risico A4.

---

## 3 · Wachtregels

**Vraag.** Mag een vooraf geboekte taxi op die locatie wachten op een passagier?
Zo ja, hoe lang? Zo nee, waar mag dan gewacht worden?

**Waarom nodig.** Dit is de zwaarstwegende vraag. Mag er niet gewacht worden, dan
parkeert de chauffeur elders, wacht daar, en rijdt voor wanneer de klant zich
meldt. Dat verandert de parkeerkosten, de chauffeurstijd en het moment van
klantcontact.

**Wat hiervan afhangt.** Het complete kostenmodel, het operationele draaiboek en
de haalbaarheid van de 60 minuten inbegrepen wachttijd. Risico A2.

---

## 4 · Parkeerkosten

**Vraag.** Welk tarief geldt voor het parkeren of wachten op die locatie? Bestaat
er een regeling of abonnement voor taxiondernemingen?

**Waarom nodig.** De parkeerkosten zijn op dit moment de grootste onbekende in het
prijsmodel. Het verschil tussen €0 en €12 per rit is €12 op de meerkosten — meer
dan het verschil tussen alle onderzochte wachttijdbeleiden bij elkaar.

**Wat hiervan afhangt.** De hoogte van de Airport Arrival Service en daarmee de
klantprijs van alle zes de routes.

---

## 5 · Wachttarieven

**Vraag.** Geldt er een afwijkend tarief wanneer de wachttijd oploopt, bijvoorbeeld
boven een half uur of een uur?

**Waarom nodig.** Onze inbegrepen wachttijd is 60 minuten. Loopt het tarief in die
periode progressief op, dan is de kostenberekening niet lineair.

**Wat hiervan afhangt.** De scenario-analyse voor €25, €30 en €35 toeslag.

---

## 6 · Vluchtvertraging

**Vraag.** Geldt er een afwijkend regime wanneer een vlucht vertraagd is en de
chauffeur daardoor langer aanwezig moet zijn?

**Waarom nodig.** Bij vertraging schuift ons ophaalmoment mee. Als dat betekent dat
de chauffeur buiten een toegestaan tijdvak aanwezig is, botst onze belofte met het
regime van Schiphol.

**Wat hiervan afhangt.** Artikel 3 van de vervoersvoorwaarden en het draaiboek bij
nachtelijke aankomsten. Risico A8.

---

## 7 · Loopafstand

**Vraag.** Wat is de gebruikelijke loopafstand vanaf de aankomsthal naar die
locatie? Is er een route die geschikt is voor reizigers met veel bagage of met
beperkte mobiliteit?

**Waarom nodig.** Een lange loopafstand verbruikt de inbegrepen tijd vóórdat de
chauffeur iets fout doet, en raakt de toegankelijkheid van de dienst.

**Wat hiervan afhangt.** KPI K4 en de houdbaarheid van de 60-minutenbelofte.
Risico A6.

---

## 8 · Eigen boekingen

**Vraag.** Gelden er andere voorwaarden voor ritten die rechtstreeks bij ons zijn
geboekt, vergeleken met ritten via een platform als Uber of Bolt? Zijn passen of
autorisaties die via zo'n platform zijn verstrekt bruikbaar voor eigen boekingen?

**Waarom nodig.** Wij nemen aan van niet, maar dat is een gevolgtrekking en geen
bevestigd gegeven. Wij willen ons proces niet op een aanname baseren.

**Wat hiervan afhangt.** Of vraag 2 een ander antwoord krijgt dan voor
platformritten.

---

## 9 · Alternatieve locatie

**Vraag.** Bestaat er een alternatieve zone — kort parkeren, taxizone of andere
voorziening — die voor vooraf geboekt vervoer gebruikt mag worden, en welk regime
geldt daar?

**Waarom nodig.** Is wachten op de aangewezen locatie niet toegestaan, dan hebben
wij een tweede plek nodig om het alternatieve ontwerp op te baseren.

**Wat hiervan afhangt.** Het terugvalscenario bij risico A2.

---

## 10 · Documentatie

**Vraag.** Waar is dit beleid schriftelijk vastgelegd, en hoe worden wijzigingen
gecommuniceerd aan taxiondernemingen?

**Waarom nodig.** Wij willen ons kunnen baseren op een vindbare bron in plaats van
op correspondentie, en tijdig weten wanneer het regime verandert.

**Wat hiervan afhangt.** Risico A1 en het onderhoud van dit dossier.

---

## Na ontvangst

1. Antwoord archiveren in `docs/compliance/schiphol-operation.md`, met datum en
   afzender.
2. Statusvelden bijwerken van `ONBEVESTIGD` naar bevestigd, met bronverwijzing.
3. Prijsscenario's herrekenen met de werkelijke parkeerkosten.
4. Risicoregister herzien — met name A2, A4 en A6.
5. Pas daarna: zes routes in staging.
