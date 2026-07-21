# KPI-definities — luchthavenophalingen

**Laatst bijgewerkt:** 20 juli 2026

Alleen definities. Er wordt geen dashboard gebouwd en er is nog geen enkele
meting: T4XI heeft nul uitgevoerde luchthavenophalingen.

Elke KPI verwijst naar velden uit het meetinstrument
(`Ophaalregistratie Schiphol`), zodat de definitie en de bron niet uit elkaar
kunnen lopen.

---

## Tijd

### K1 · Gemiddelde wachttijd na landing

**Definitie:** `instaptijd − officiële landingstijd`, in minuten, gemiddeld over
alle ophalingen in de periode.

**Waarom:** dit is de kostendrijver van het hele model. De 60 minuten inbegrepen
tijd is een vaste kostenpost van maximaal €43,20 aan chauffeurstijd, ongeacht de
ritafstand.

**Streefwaarde:** nog niet vast te stellen. De hypothese is een gemiddelde rond de
35 minuten; die moet worden bevestigd of verworpen door meting.

---

### K2 · Gemiddelde totale chauffeursduur

**Definitie:** `moment klant afgezet − moment chauffeur vertrekt`, in minuten.

**Waarom:** de werkelijke kostprijs van een ophaling. Het kostenmodel rekent
€0,72 per minuut; deze KPI vertelt hoeveel minuten een ophaling werkelijk kost —
inclusief de aanrijtijd die nu in de vaste overhead van €7 verdwijnt.

---

### K3 · Gemiddelde coördinatietijd

**Definitie:** `moment eerste contact − officiële landingstijd`, in minuten.

**Waarom:** vervangt de aanname van 8 minuten coördinatie per rit. Loopt dit ver
op, dan is het bericht na landing niet betrouwbaar genoeg.

---

### K4 · Gemiddelde loopafstandtijd

**Definitie:** `instaptijd − moment klant meldt bagage gereed`, in minuten.

**Waarom:** scheidt de loopafstand van de bagage- en douanetijd. Alleen dit deel
is beïnvloedbaar door de keuze van ophaallocatie; de rest niet.

---

## Betrouwbaarheid

### K5 · Percentage vertraagde vluchten

**Definitie:** aandeel ophalingen met vluchtstatus `Vertraagd <30`,
`Vertraagd 30–60` of `Vertraagd >60`.

**Waarom:** meet de planningslast van de luchtvaartmaatschappij. Let op: een
vertraagde vlucht verklaart géén overschrijding van de inbegrepen wachttijd — die
loopt vanaf de wérkelijke landing. Deze KPI meet dispatch-inspanning, geen
margeverlies.

---

### K6 · Percentage ophalingen boven 60 minuten

**Definitie:** aandeel ophalingen waarbij K1 groter is dan 60.

**Waarom:** dit is de staart die het prijsmodel breekt. Uit de scenario-analyse:
bij een toeslag van €30 gaat Schiphol → Amsterdam Centrum bij 41 minuten wachten
door nul. Deze KPI bepaalt of de belofte betaalbaar is.

**Signaalwaarde:** stijgt dit boven ongeveer 10%, dan moet ofwel de toeslag
omhoog, ofwel er een minimumprijs komen voor ophalingen.

---

### K7 · Percentage wrijvingsritten

**Definitie:** aandeel ophalingen waarbij *direct kunnen parkeren* of
*ophaallocatie direct bruikbaar* op **Nee** staat.

**Waarom:** verklaart uitschieters in K2 zonder dat de chauffeur tekst hoeft te
typen. Een structureel hoog percentage wijst op een ophaallocatie die operationeel
niet werkt.

---

### K8 · Percentage no-shows

**Definitie:** aandeel ophalingen waarbij aan alle vier de no-showvoorwaarden uit
artikel 7 van de vervoersvoorwaarden is voldaan.

**Waarom:** raakt zowel omzet als de vraag of de communicatie na landing werkt.

---

## Geld

### K9 · Gemiddelde parkeerkosten per ophaling

**Definitie:** gemiddelde van het bedrag op de bon. Ritten zonder bon tellen niet
mee in het gemiddelde, maar wel in de dekkingsgraad.

**Waarom:** dit is op dit moment de grootste onbekende in het kostenmodel. Het
verschil tussen €0 en €12 per rit is €12 op de meerkosten.

**Dekkingsgraad:** aandeel ritten met een echte bon in plaats van een schatting.
Onder 80% is het gemiddelde niet betrouwbaar genoeg om op te prijzen.

---

### K10 · Gemiddelde marge Airport Arrival Service

**Definitie:** `(klantprijs − werkelijke kosten) / klantprijs`, waarbij de
werkelijke kosten bestaan uit ritkosten volgens het kostenmodel, plus K2 maal
€0,72, plus K9.

**Waarom:** de enige KPI die uiteindelijk bepaalt of het product klopt.

**Ondergrens:** 20% — de cost-floor uit het prijsmodel. Daaronder is de route niet
verdedigbaar zonder expliciete portfoliokeuze.

---

## Wanneer deze KPI's betekenis krijgen

Niet eerder dan bij **tien** gemeten ophalingen, en pas werkelijk stuurbaar vanaf
ongeveer **twintig**. Tot die tijd zijn het definities zonder waarden.

Wat er níét moet gebeuren is deze KPI's vullen met de aannames uit het Airport
Unit Economics-model. Die aannames zijn er om vervángen te worden.
