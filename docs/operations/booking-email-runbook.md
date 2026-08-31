# Runbook boekingsmail

De boekingsmail is een server-only, best-effort notificatie via de Resend REST-API. Een ontbrekende configuratie of verzendfout mag de boeking en de API-response nooit beïnvloeden. De REST-payload gebruikt bewust `reply_to` (snake_case).

## Environment-contract

| Variabele | Verplicht | Contract |
| --- | --- | --- |
| `RESEND_API_KEY` | Voor verzending | Server-only API-key. Leeg: beide mails worden stil overgeslagen. Nooit loggen of committen. |
| `RESEND_FROM` | Aanbevolen voor productie | Afzender, bijvoorbeeld `T4XI <boeking@t4xi.nl>`. Voor echte klantlevering moet het domein in Resend geverifieerd zijn. Zonder waarde wordt de Resend-sandboxafzender gebruikt. |
| `OPS_EMAIL` | Nee | Interne ontvanger. Zonder waarde: `booking@t4xi.nl`. |
| `OPS_DASHBOARD_USERNAME` | Optioneel | Aparte server-only gebruikersnaam voor `/dashboard/invoices`; anders wordt de bestaande Brain-inlog gebruikt. |
| `OPS_DASHBOARD_PASSWORD` | Optioneel | Apart sterk server-only wachtwoord; anders wordt de bestaande Brain-inlog gebruikt. |

## Eenmalige productie-inrichting (handmatig)

1. Voeg `t4xi.nl` in Resend toe als verzenddomein en plaats de door Resend opgegeven SPF- en DKIM-records bij de DNS-provider.
2. Wacht tot Resend alle domeinrecords als geverifieerd toont.
3. Let op: `onboarding@resend.dev` is alleen een sandboxafzender en levert uitsluitend aan het e-mailadres van het eigen Resend-account. Gebruik die niet voor een echte klanttest.
4. Voeg in Vercel bij het juiste project en de juiste Production-environment `RESEND_API_KEY`, `RESEND_FROM` en zo nodig `OPS_EMAIL` toe. Gebruik voor `RESEND_FROM` een adres op het geverifieerde domein.
5. Start daarna zelf een nieuwe production deployment zodat de environment-waarden actief worden. Controleer dat er geen secret in buildlogs of repository staat.

## Verificatiechecklist

- [ ] Voer `npx tsx scripts/verify-booking-email.ts` uit zonder `--send`; er vindt geen netwerkverkeer plaats.
- [ ] Open de drie gemelde bestanden onder `tmp/booking-email-previews/` in een browser en controleer NL retour, EN luchthaven-arrival en offerte op aanvraag.
- [ ] Voer `npm run test:notifications`, `npm run test:rates` en `npm run test:payments` uit.
- [ ] Voer `npm run typecheck`, `npm run lint` en `npm run build` uit.
- [ ] Controleer in Resend dat `t4xi.nl` inclusief SPF/DKIM geverifieerd is en dat `RESEND_FROM` dit domein gebruikt.
- [ ] Zet voor een gecontroleerde live test lokaal `RESEND_API_KEY` en `RESEND_FROM`, en voer `npx tsx scripts/verify-booking-email.ts --send --to=<eigen-testadres>` uit. Beide door de mailer gemaakte berichten (klant en ops) moeten uitsluitend in dat testpostvak aankomen.
- [ ] Controleer onderwerp, inhoud, links en afzender in het testpostvak; controleer ook de twee succesvolle afleveringen in Resend.
- [ ] Maak daarna via de normale boekingsflow een testboeking en controleer dat een eventuele mailfout de boeking en HTTP-response niet verandert.
- [ ] Controleer dat `bookings.email_sent` alleen `true` wordt wanneer beide mails succesvol zijn verzonden.

## Factuurworkflow

1. De klantmail bevat altijd een PDF-boekingsbevestiging; dit document is nadrukkelijk geen factuur.
2. Open `/dashboard/invoices` en vul factuurnaam, volledig factuuradres en uitvoerend taxibedrijf in.
3. Is de boeking al betaald, dan wordt de definitieve factuur direct uitgegeven en verzonden. Anders gebeurt dit best-effort na het succesvolle Stripe-event.
4. Een uitgegeven factuur is in het scherm vergrendeld. Corrigeer deze nooit door het bestaande nummer te overschrijven; gebruik voor financiële correcties een afzonderlijke creditfactuurworkflow.
5. Controleer in Resend dat de factuurmail één PDF-bijlage heeft en op Delivered staat.

### Factuurmail offline bekijken

1. Voer `npm run preview:invoice-email` uit. Deze modus gebruikt voorbeeldgegevens en maakt geen netwerkverbinding.
2. Open `tmp/invoice-email-previews/invoice-email-paid.html` in een browser.
3. Open `tmp/invoice-email-previews/factuur-F-2026-000001.pdf` en controleer de bijlage.
4. Controleer desgewenst `tmp/invoice-email-previews/invoice-email-paid.txt`; dit is de platte-tekstfallback die Resend naast de HTML ontvangt.

## Mailflows en taakoverdracht

Er lopen vier uitgaande stromen, allemaal via Resend en allemaal met een `text/plain`-deel naast de HTML:

| Trigger | Naar de klant | Naar operations |
| --- | --- | --- |
| Nieuwe boeking (`POST /api/bookings`) | Bevestiging NL/EN + PDF-boekingsbevestiging | Interne mail met **taakoverdracht** |
| Contact- of leadformulier (`POST /api/leads`) | Ontvangstbevestiging NL/EN | Interne aanvraagmail met **taakoverdracht** |
| Geslaagde betaling (Stripe-webhook) | Factuurmail + PDF-factuur | — |
| Handmatige factuur (`/dashboard/invoices`) | Factuurmail + PDF-factuur | — |

De taakoverdracht (`lib/notifications/ops-handover.ts`) is een pure functie: de takenlijst wordt deterministisch afgeleid uit de boeking zelf, met per taak een eigenaar (Dispatch of Administratie) en een deadline. Er staat nooit een verzonnen status in — alleen wat uit de boekingsgegevens volgt.

Vaste kern per boeking: klantcontact → chauffeur/voertuig toewijzen → betaalstatus → factuur. Voorwaardelijk komen erbij: een **kritieke offertetaak** bij `quoteOnRequest` of een ontbrekende prijs (die gaat vóór het klantcontact), een vluchttaak die de richting volgt (aankomst = 60 minuten wachttijd vanaf de geregistreerde landing; vertrek = ophaaltijd toetsen aan de actuele vertrektijd), en een aparte planningstaak voor de retourrit.

De urgentie volgt de tijd tot ophalen en staat in het onderwerp, zodat de inbox zelf al sorteert: `[NU]` binnen 4 uur (of als de ophaaltijd al verstreken is), `[<24 UUR]` binnen een dag, geen prefix daarbuiten. Onderaan de interne mail staan knoppen voor bellen, WhatsApp en e-mail naar de klant.

De ontvangstbevestiging aan een lead belooft exact wat taak 1 van de overdracht als deadline heeft: een persoonlijke reactie binnen één werkdag. Wijzig die twee nooit los van elkaar. De bevestiging is best-effort: mislukt hij, dan blijft de aanvraag geslaagd — de interne mail is bepalend voor de HTTP-response.

## DNS-inrichting voor t4xi.nl (eigenaarsactie bij de DNS-provider)

Nameservers staan bij GoDaddy (`ns59/ns60.domaincontrol.com`). Inkomende mail loopt via Zoho (`mx.zoho.eu`), uitgaande transactionele mail via Resend (DKIM-selector `resend`, return-path `send.t4xi.nl` naar Amazon SES eu-west-1).

### 1. SPF is kapot — dit is de enige echte blokker

Het SPF-record op `t4xi.nl` verwijst twee keer naar dezelfde include, en op dat doel (`dc-8e814c8572._spfm.t4xi.nl`) staan **twee** SPF-records, waarvan er één naar zichzelf verwijst. RFC 7208 §4.5 schrijft voor dat meer dan één SPF-record op een naam een `permerror` oplevert. Gevolg: SPF faalt voor alle mail met afzenderdomein `t4xi.nl` — dus voor alle mail die het team vanuit Zoho verstuurt.

Vervang het TXT-record op `t4xi.nl` (host `@`) door precies één regel:

```
v=spf1 include:zohomail.eu ~all
```

Verwijder daarna de `dc-8e814c8572._spfm.t4xi.nl`-records. Neem `amazonses.com` bewust **niet** op in het root-record: Resend gebruikt `send.t4xi.nl` als return-path, dat subdomein heeft zijn eigen correcte SPF, en een include op rootniveau zou heel Amazon SES machtigen om als `t4xi.nl` te verzenden.

Laat ongemoeid: `resend._domainkey`, `send.t4xi.nl` (TXT en MX) en `zmail._domainkey`. Die zijn correct.

### 2. DMARC-rapporten komen bij niemand aan

De `rua` wijst naar `dmarc_rua@onsecureserver.net`, een standaardadres van de provider. Er is dus geen zicht op wie er namens het domein verstuurt. Zet op `_dmarc.t4xi.nl`:

```
v=DMARC1; p=quarantine; adkim=r; aspf=r; pct=100; fo=1; rua=mailto:dmarc@t4xi.nl; ruf=mailto:dmarc@t4xi.nl
```

Houd de alignment **relaxed**. Bij `aspf=s` zou Resend afvallen, omdat de return-path `send.t4xi.nl` is en niet het hoofddomein. Verscherp pas naar `p=reject` nadat de rapporten enkele weken laten zien dat alleen Zoho en Resend verzenden.

### 3. Optionele hardening

`_mta-sts` plus een `mta-sts.t4xi.nl`-policy en een `_smtp._tls`-record (TLS-RPT) dwingen TLS af op inkomende mail en maken downgrade-pogingen zichtbaar. Geen blokker, wel de logische volgende stap na punt 1 en 2.

### Verificatie na de DNS-wijziging

- [ ] `dig +short TXT t4xi.nl | grep -c v=spf1` geeft `1`.
- [ ] `dig +short TXT dc-8e814c8572._spfm.t4xi.nl` geeft niets meer terug.
- [ ] `dig +short TXT _dmarc.t4xi.nl` toont de nieuwe `rua` op het eigen domein.
- [ ] Stuur een testmail vanuit Zoho én een testboeking naar een Gmail-adres; controleer in "Toon origineel" dat `spf=pass`, `dkim=pass` en `dmarc=pass` staan bij beide.

---

# Communication engine

## Architectuur

```
Booking / Lead / Payment / statusovergang
                  ↓
            domeinevent
                  ↓
      Communication Orchestrator
                  ↓
   policies: taal · kanaal · volgorde · dedup · retry
                  ↓
              template
                  ↓
   ┌──────────────┼──────────────┐
 email        whatsapp/sms     internal
   ↓          (inactief)          ↓
 Resend                        Resend → ops
                  ↓
       communication_deliveries
                  ↑
        Resend-webhook (delivered/bounced/complained)
```

De ontwerpregel is eenrichtingsverkeer: **statusovergangen veroorzaken domeinevents, domeinevents veroorzaken communicatie.** API-routes, de Stripe-webhook en dashboardknoppen roepen geen templates meer aan; ze publiceren een event. Wie een nieuw bericht wil toevoegen raakt dus het templateregister en de policies aan, nooit een route.

| Module | Verantwoordelijkheid |
| --- | --- |
| `lib/communication/events.ts` | Wat er gebeurd is. Geen kanaal, geen taal, geen template. |
| `lib/communication/orchestrator.ts` | De enige verzendweg. Faalt nooit hard; geeft per bericht een uitkomst terug. |
| `lib/communication/policies/*` | Taal, kanaal, volgorde, deduplicatie, retryclassificatie. |
| `lib/communication/templates/registry.ts` | Event + ontvangergroep → bericht. |
| `lib/communication/templates/brand.ts` | Palet, contactgegevens, afzenders, escaping — één bron. |
| `lib/communication/channels/*` | Transport. Weet niet waarom het iets verstuurt. |
| `lib/communication/delivery-log.ts` | Claim vóór verzending + meetbaarheid. |
| `lib/bookings/lifecycle.ts` | Toegestane overgangen; spiegel van de databaseconstraint. |

## Idempotency

De dedup-sleutel is `<event>:<subject>:<ontvangergroep>:<kanaal>` — afgeleid van domeinidentiteit, niet van tijd of inhoud. Hij wordt als unieke kolom in `communication_deliveries` geclaimd **vóór** het verzenden en gaat daarnaast als `Idempotency-Key` mee naar Resend. Een Vercel-retry, een dubbel afgeleverde webhook of twee keer op dezelfde dashboardknop drukken levert daardoor nooit een tweede bericht op.

### Wat er gebeurt als de store niet bereikbaar is

Dit is bewust **geen** fail-open. De laag onderscheidt twee gevallen:

| Situatie | Herkenning | Gedrag |
| --- | --- | --- |
| Migratie nog niet toegepast | RPC bestaat niet **en** `COMMUNICATION_SCHEMA_READY` staat uit | `degraded` — versturen gaat door zonder dedup, met alert. Er valt niets te beschermen wat nog niet bestaat. |
| Schema-regressie | RPC bestaat niet **terwijl** `COMMUNICATION_SCHEMA_READY=true` | `blocked` — er wordt **niet** verstuurd. Hetzelfde symptoom, maar na de uitrol is het geen overgang meer. |
| Database hapert | elke andere fout (verbinding, timeout, permissie) | `blocked` — er wordt **niet** verstuurd. Juist bij een storing zou doorgaan dubbele klantcommunicatie opleveren. |

`COMMUNICATION_SCHEMA_READY` is bewust een expliciete deploy-vlag en geen runtime-capability-check: zo'n check zou tijdens een schemacache-hapering hetzelfde verkeerde antwoord geven als de storing die hij moet opmerken. Zet hem per omgeving aan **direct nadat** de migratie daar is toegepast. `npm run verify:communication` waarschuwt wanneer de vlag en de werkelijkheid uit elkaar lopen, in beide richtingen.

### Deduplicatie en observability zijn twee dingen

Blokkeren beschermt tegen duplicaten, dus het heeft alleen zin waar een duplicaat kán ontstaan. Bij `lead.received` is de `subjectId` een verse UUID per request — twee inzendingen botsen nooit op dezelfde sleutel. Blokkeren zou daar alleen aanvragen kosten zonder één duplicaat te voorkomen, dus die flow loopt door (`duplicatesArePossible()`).

Dat mag echter nooit betekenen dat vastleggen optioneel wordt. Gaat een bericht zonder claim de deur uit, dan probeert `record()` de regel ná verzending alsnog te schrijven — dezelfde RPC, dus de unieke sleutel blijft de rem en er kan geen dubbele regel ontstaan. Lukt ook dat niet, dan draagt de uitkomst `logged: false` en volgt een `delivery_unlogged`-alert. Een onzichtbare aflevering is een eigen incident, geen bijproduct van een deduplicatiebeslissing.

Alle alerts dragen prefix `[ALERT][communication]`: `idempotency_store_missing`, `schema_regression`, `idempotency_store_unavailable`, `delivery_blocked`, `delivery_unlogged`, `settle_failed`. Zet daar een log-alert op in Vercel — elke regel betekent dat een bericht niet is verstuurd, niet te dedupliceren viel, of onzichtbaar bleef.

Bij facturen liggen er twee lagen over elkaar heen die verschillende dingen bewaken: `claim_booking_invoice` beschermt de uitgifte van het factuur**nummer**, de orchestrator beschermt de **verzending**. Een duplicaat op de tweede laag telt daarom als geslaagd.

## Lifecycle

```
inquiry → quoted → confirmed → assigned → in_progress → completed
   └──────────┴───────────┴──────────┴────────────┴──→ cancelled
```

`bookings.status` was tot deze migratie een dode kolom met de waarde `pending`. De nieuwe woordenlijst staat als check-constraint in de database, en `transition_booking_status` is de enige toegestane manier om hem te wijzigen — geen route, webhook of dashboardactie kan eromheen. Elke overgang komt in `booking_status_transitions` met actor en reden.

Een overgang naar de huidige stand is een geslaagde no-op (`changed:false`) en levert dus geen tweede domeinevent op.

De assen blijven gescheiden: `payment_status` (Stripe), `flight_monitoring` (vluchtstatus) en `communication_deliveries` (communicatiestand) zijn eigen domeinen. Er hoort nooit een samengestelde waarde als `confirmed_paid_driver_assigned` in `bookings.status`.

De taakoverdracht in de interne mail volgt deze standen: een bevestigde rit vraagt geen bevestiging meer, een toegewezen rit geen toewijzing, een betaalde rit geen betaalcontrole, een geannuleerde rit niets.

## Bewust nog niet gebouwd

- **WhatsApp en sms** staan in het datamodel en in de kanaalpolicy, maar dispatchen niet. Zulke berichten worden vastgelegd als `skipped` met reden `channel_inactive`. Activeren vraagt providerkeuze, templategoedkeuring bij Meta, opt-in/consent en eigen delivery-semantiek.
- **Getimede communicatie** (rit-reminder, onderweg, reviewverzoek) bestaat niet. Alleen het scheduler-contract in `lib/communication/scheduler.ts` staat er; de standaardimplementatie weigert expliciet in plaats van stil te slagen. Beoogde implementatie is `pg_cron` + `pg_net` in Supabase — beide extensies staan nog uit.
- **Nieuwe klantbeloftes** zijn niet toegevoegd. Lifecycle-events zonder template leveren `no_template` op en laten geen logregel achter. Dat is opzet: een belofte zonder betrouwbare trigger is erger dan geen belofte.

## Uitrolvolgorde

Strikt in deze volgorde. Elke stap bewijst iets voordat de volgende erop bouwt.

1. **SPF repareren** (zie boven). Zolang SPF een `permerror` geeft, verhoogt meer uitgaand volume alleen het risico.
2. **Backfill controleren** op de doelomgeving:

   ```sql
   select status, count(*) from public.bookings group by status;
   ```

   Verwacht is uitsluitend `pending`. Op productie waren dat 9 rijen (gecontroleerd 2026-08-30), aangemaakt tussen 25 juli en 2 augustus. `pending` betekende "aanvraag ontvangen, nog niet bevestigd" en wordt daarom `inquiry`. Elke andere waarde **breekt de migratie af** met een expliciete melding in plaats van stil naar `inquiry` te mappen — dat zou een bevestigde of geannuleerde rit terugzetten naar aanvraag.
3. **Staging: migratie toepassen** (`20260830120000_booking_lifecycle_and_communication.sql`), daarna `COMMUNICATION_SCHEMA_READY=true` op staging, daarna:

   ```bash
   npm run verify:communication -- --env=.env.staging.local
   ```

4. **Staging: webhook activeren** — `RESEND_WEBHOOK_SECRET` zetten en het endpoint registreren. Controleer een echte testmail én het bouncepad (stuur naar een adres dat gegarandeerd bounct) en kijk of de regel in `communication_deliveries` van `sent` naar `delivered` respectievelijk `bounced` gaat.
5. **Productie: migratie toepassen**, daarna `COMMUNICATION_SCHEMA_READY=true` in Vercel Production.
6. **Productie: webhook activeren** — `RESEND_WEBHOOK_SECRET` in Vercel Production, endpoint registreren op `https://www.t4xi.nl/api/webhooks/resend` voor `email.delivered`, `email.bounced` en `email.complained`.
7. **Opnieuw `npm run verify:communication`** (zonder `--env`), nu zonder waarschuwingen.
8. **Pas daarna lifecycle-transities actief gebruiken.** Laat een paar echte boekingen de hele route lopen — `inquiry → quoted → confirmed → assigned → in_progress → completed/cancelled` — en volg er minstens één **end-to-end**, niet alleen op groene aggregaten:

   ```bash
   npm run verify:communication -- --trace=T4XI-2026-XXXX
   ```

   Die trace loopt de keten af: statusovergang → auditregel → verwacht domeinevent → delivery claim → provider-message-id → webhookstatus. Klopt die keten voor één concrete boeking, dan is bewezen dat de architectuur doet wat hij belooft; groene tellingen alleen bewijzen dat niet.

   **Ontwerpgrens die de trace zichtbaar maakt:** een domeinevent laat alleen een spoor na wanneer er een template aan hangt. Lifecycle-events hebben die nog niet, dus daar stopt het bewijs bij de auditregel en meldt de trace `zonder logspoor (geen template)`. Dat is verwacht gedrag, geen fout. Wil je die schakel ook hard bewijsbaar maken, dan is een apart domeinevent-log daarvoor de ingreep — uitdrukkelijk Phase 3-werk, niet iets om vóór de eerste productie-run aan te raken.
9. **Pas daarna Phase 3.** `pg_cron` + `pg_net` aanzetten en als eerste én enige geplande flow de **bestaande vluchtmonitor** activeren — die draait nu niet, want er is niets dat `/api/flights/monitor` aanroept. Eén scheduled flow bewijst scheduler, retries, logging en idempotency in productie. Reminders en reviewverzoeken komen pas daarna.

## Controlescript

`npm run verify:communication` is read-only: het schrijft geen migratie, geen statusovergang en geen mail. Zonder vlaggen rapporteert het de aggregaten; met `--trace=<booking-ref of id>` volgt het één boeking door de hele keten. Het rapporteert de lifecycle-standen (en of er onbekende waarden in zitten), de recente audittrail, of de idempotency-store bestaat en aanroepbaar is, en de afleveringen per stand — inclusief mislukte verzendingen, bounces, regels zonder provider-message-id en het signaal dat álles op `sent` blijft staan, wat betekent dat de webhook niet binnenkomt.

**Nulmeting bij de start:** alle negen bestaande boekingen hebben `email_sent = false`, ook de twee met `payment_status = paid`. Ze dateren van 25 juli tot 2 augustus, vóór `RESEND_API_KEY` in Vercel stond. Of die klanten iets hebben ontvangen is achteraf niet vast te stellen — precies de blindheid die het communicatielog wegneemt. Er is dus geen historische succesbaseline om tegen af te zetten; de eerste gecontroleerde boeking ná de uitrol is meteen ook het eerste bewijs.

Nulmeting op productie vóór de migratie (2026-08-30):

```
[ fout ] lifecycle-standen: pending=9
[ let op] audittabel bestaat nog niet — migratie niet toegepast
[ let op] idempotency-store nog niet geïnstalleerd
[ let op] communicatielog bestaat nog niet — migratie niet toegepast
```

## Verificatie

```bash
npm run test:communication && npm run test:notifications && npm run test:invoices
```

Dekt: toegestane én verboden statusovergangen, dubbele events, idempotency, de volgorde-eis bij aanvragen, inactieve kanalen, ontbrekende templates, en de handtekening- en replay-controle op de webhook.
