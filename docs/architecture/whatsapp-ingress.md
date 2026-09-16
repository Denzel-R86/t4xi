# WhatsApp-ingress: ontvangst zonder booking-effecten

Afgerond op 10 september 2026. Basiscommit `1ebf31c`, met de eerdere signature- en bookingservice-patches. De nieuwe migratie is op 9 september met Supabase CLI 2.109.0 gegenereerd. Geen productie- of stagingdatabase gewijzigd; niets gepusht, gemerged of geactiveerd.

## Geïmplementeerd

`GET /api/webhooks/whatsapp` verifieert Meta's subscription challenge. `POST` verifieert de bestaande HMAC-SHA256-signature op de oorspronkelijke bytes, normaliseert de batch en voert één `receive_whatsapp_events`-RPC uit. Pas na succesvolle commit volgt HTTP 200. Deze laag roept geen booking-, pricing-, customer-, AI- of communicatie/verzendservice aan.

| Bestand | Verantwoordelijkheid |
| --- | --- |
| `app/api/webhooks/whatsapp/route.ts` | Dunne Next.js-route, Node runtime, uncached, configuratie en veilige logging |
| `lib/whatsapp/ingress.ts` | GET-verificatie, begrensde stream, signaturecontrole, ACK na opslag |
| `lib/whatsapp/events.ts` | Alle entries/changes/messages/statuses doorlopen; alleen benodigde velden behouden |
| `lib/whatsapp/store.ts` | Eén Supabase-RPC, receiptvalidatie, bestaande development/production-guard |
| `lib/whatsapp/webhook-signature.ts` | Bestaande, ongewijzigde signatureverificatie |
| `supabase/migrations/20260909114512_whatsapp_ingress.sql` | Drie tabellen, transactionele ingressfunctie en contentopschoning |

## Drie tabellen

**whatsapp_conversations** bevat account/businessnummer, `wa_id`, nullable `language`, `state` (`active`, `handoff`, `closed`), `booking_draft` als afzonderlijk JSON-object, nullable `linked_booking_id` en ontvangsttijdstippen. Er is één conversatie per account/businessnummer/wa_id. Ontvangst opent geen gesloten gesprek opnieuw en wijzigt geen handoff, draft of bookinglink. De taal blijft onbekend totdat een latere flow deze expliciet bepaalt.

**whatsapp_messages** bevat de conversatiekoppeling, account/businessnummer, provider-message-ID, richting, type, genormaliseerde tekst, provider/ontvangsttijdstip en processing-status. Het schema ondersteunt inbound/outbound; deze implementatie schrijft uitsluitend inbound tekstberichten. `stored` betekent opgeslagen door ingress, niet afgehandeld door een bot.

**whatsapp_event_log** bevat accountcontext, HMAC-fingerprint, vast eventtype, verwerkingsresultaat, vaste redencode, eventueel een interne message-ID en ontvangst/verwerkingstijdstippen. Een onbekend event, delivery-status, unsupported message of misvormd subevent is audit-only: geen conversatie, message, booking of ander domeineffect.

Alle tabellen hebben RLS en expliciet ingetrokken public/anon/authenticated-rechten. De server krijgt SELECT/INSERT/UPDATE, geen DELETE; de functies gebruiken invokerrechten en EXECUTE alleen voor service_role. Dit is getest met Supabase-achtige brede default grants, die door de migratie worden ingetrokken. De bestaande Supabase-serverguard verhindert dat deze route vanuit development/staging naar het bekende productieproject schrijft.

## Idempotency en atomiciteit

De harde messageconstraint is `UNIQUE(waba_id, phone_number_id, provider_message_id)`. Scope hoort erbij zodat verschillende businessnummers/accounts elkaar niet raken. De eventfingerprint is stabiel op account + businessnummer + Meta-message-ID; tekstwijzigingen of een andere batchvolgorde wijzigen die sleutel niet. Een andere fingerprint na sleutelrotatie kan een extra auditregel opleveren, maar de unieke provider-ID voorkomt nog steeds een tweede message of conversatie.

De RPC verwerkt de volledige batch in één transactie. Een transactionele advisory lock serialiseert batches per businessnummer, zodat overlappende batches in omgekeerde volgorde niet kunnen vastlopen op conversation-locks. Dit is een bewuste kleine-MVP-keuze, geen onbeperkte schaalclaim. Bij hogere volumes kan later fijnmaziger serialisatie worden ontworpen.

Een bestaande eventfingerprint levert alleen de duplicate-teller in de receipt op; bestaande conversatie/message/audit wordt niet herschreven. Provider-ID-duplicaten worden gecontroleerd vóór conversatiecreatie. Ook een gewijzigde afzender in een replay kan daardoor geen extra conversatie aanmaken. Na een commit waarvan de response verloren gaat, is een retry veilig.

Een fout in één opslagoperatie rolt ook alle eerdere message-, conversation- en audit-inserts uit die batch terug. Geen snelle 200 vóór opslag, geen in-memory dedup, geen fire-and-forget async werk na de response. Er is nog geen worker of state machine.

## Validatie en audit

- Maximaal 128 KiB body, gecontroleerd tijdens het lezen; een oversized stream wordt afgebroken. Maximaal 100 genormaliseerde events per request. Geen gedeeltelijke verwerking bij overschrijding.
- Signature wordt vóór JSON-parsing gecontroleerd. Geen Svix-tijdvenster: signature is authenticatie, geen bewijs van versheid.
- Verwachte WABA-ID en business phone-number-ID moeten overeenkomen. Afwijkende accountdata wordt alleen als geweigerd event geaudit.
- Alleen tekstberichten worden opgeslagen als messages. Media, contacts, profielnamen, contextobjecten, billing/pricing-data en de volledige Meta-payload worden niet bewaard. Unsupported message-types leveren uitsluitend audit op.
- Ongeldige individuele berichten worden als `rejected` geaudit; een onbruikbare JSON/envelope of te grote eventbatch krijgt 400. Tekst met NUL, ongeldige Unicode, lege body of meer dan 4.096 tekens wordt geweigerd.
- Geldige provider-statussen leveren alleen een auditregel op. Er is geen outbound delivery-update of verzendeffect.
- HTTP 401 voor ongeldige signature; 403 voor verkeerde GET-verificatie; 413 voor te grote body; 503 voor ontbrekende configuratie of opslagproblemen; 200 na duurzame verwerking, ook voor duplicates en genegeerde events.

Niet-geauthenticeerde requests en onparseerbare requests krijgen géén database-write. Ze worden met vaste foutcodes in het bestaande applicatielog gemeld. Voor vertrouwde, parseerbare events staat het ontvangst/verwerkingsresultaat in de tabel. De applicatielog bevat alleen resultaatcodes en aantallen, geen berichtinhoud, telefoonnummer, signature, tokens of rauwe databasefout. Betrouwbare centrale retentie van deze applicatielogs is een operationele uitrolvoorwaarde, niet een nieuwe logdienst in deze patch.

## Persoonsgegevens en retentie

Er worden geen volledige Meta-payloads opgeslagen. De noodzakelijke berichttekst heeft een technische contenttermijn van zeven dagen vanaf ontvangst. `purge_whatsapp_expired_content()` wist uitsluitend verlopen tekst, idempotent. Provider-ID's, fingerprints en relaties blijven bewaard zodat contentopschoning geen oude berichten opnieuw actief maakt. Replay na opschoning herstelt de oude tekst niet.

De cleanupfunctie is geïmplementeerd en getest, maar **er is nog geen scheduler actief**. Vóór activering moet een dagelijkse onderhoudstaak deze functie uitvoeren en moet de afloop worden gemonitord. De zeven dagen zijn een technische MVP-default, geen juridisch bewaarbeleid. Wa_id/accountkoppelingen en dedupmetadata hebben nog geen volledige privacy-erasureworkflow; bepaal hun bewaarbeleid en toegangsbeheer vóór livegang. Deze patch claimt geen automatische verwijdering zonder ingeregelde job.

## Configuratie en uitrol

`.env.example` bevat:

- `WHATSAPP_INGRESS_ENABLED=false` (exact `true` vereist om aan te zetten)
- `WHATSAPP_APP_SECRET` voor POST-signatures
- `WHATSAPP_VERIFY_TOKEN` voor GET-subscriptionverification
- `WHATSAPP_FINGERPRINT_SECRET`: afzonderlijke stabiele audit-HMAC-sleutel; niet meedraaien bij normale app-secret/verify-tokenrotatie
- `WHATSAPP_WABA_ID` en `WHATSAPP_PHONE_NUMBER_ID`

Geen secrets in NEXT_PUBLIC-variabelen. De bestaande Supabase-service-role-configuratie blijft server-side. Er zijn in deze sessie geen echte Meta-credentials gebruikt of gewijzigd.

Uitrolvolgorde:

1. Eerst de bookingservice-refactor reviewen; vervolgens deze afzonderlijke ingresspatch reviewen.
2. Reconcileer de echte Supabase-migratiehistorie, controleer de pending set en pas uitsluitend volgens het bestaande repo-beleid toe via db push/CI. Geen wijziging van bestaande migraties en geen selectieve apply_migration.
3. Test de migratie en RLS/RPC-toegang op staging, inclusief de echte PostgREST-call. Richt contentopschoning en logging in.
4. Configureer een testaccount/businessnummer; zet ingress expliciet aan en valideer de GET-challenge en een echt door Meta ondertekend testbericht. Geen AI, prijzen, klantmutaties of bookings activeren.
5. Monitor 503's en ontvangen/stored/ignored/rejected/duplicate-counts. Zet bij een probleem de featureflag uit; behoud de data voor herstel. Een uitgeschakelde endpoint retourneert 503 zodat geen succesvolle verwerking wordt gesuggereerd.

Meta end-to-end, stagingmigratie en productie-uitrol zijn niet uitgevoerd. De officiële Meta-documentatie gaf bij raadpleging HTTP 429; providerhandshake en het actuele payloadcontract moeten daarom ook met het echte Meta-testaccount worden bevestigd vóór activering. De Supabase-changelog is opgehaald en relevante RLS/functionrechten zijn in officiële documentatie gecontroleerd; er is geen gebruik van Realtime, het gewijzigde logs-API of nieuwe Supabase-features.

## Verificatie

- 51 WhatsApp-unit/securitytests geslaagd: 44 nieuw + 7 bestaande signaturetests.
- Volledige suite: 1.187 geslaagd, 0 gefaald, 0 overgeslagen.
- Lint, route-typegeneratie en typecheck geslaagd. De eerste typecheck in de verse checkout miste gegenereerde Next-types; na `next typegen` is deze groen.
- Echte lokale PostgreSQL 15-container, zonder netwerk: SQL-rolechecks, RLS/grants, replay, audit-only events, batchrollback, handoff/closed/draftbehoud, contentpurge en replay na purge geslaagd.
- 20 gelijktijdige ondertekende handlerrequests → exact 1 conversation, 1 message, 1 eventlog en 19 duplicates.
- Overlappende omgekeerd geordende batches → ieder provider-ID éénmaal, zonder deadlock.
- Verloren antwoord ná commit → eerste request 503, retry 200, geen tweede message.
- Writes naar booking/pricing/customer-testtabellen waren met triggers verboden; geen trigger geraakt en records ongewijzigd.

De databaseproef gebruikt de echte migratie en een minimale bestaande `bookings(id)`-tabel plus domein-schrijftraps. Dit is geen volledige Supabase-schema-rebuild, geen live-projectaudit en geen PostgREST-integratietest. Het endpoint is getest als echte Request/Response-handler met PostgreSQL-opslag via de testadapter, zonder een publiek draaiende HTTP-server.

Reproduceerbaar: start de in het script genoemde netwerkloze PostgreSQL-container en draai `node --import tsx scripts/test-whatsapp-ingress-db.ts`. Het script maakt een afzonderlijke testdatabase en verwijdert die in een finally-block. De SQL-tests staan in `supabase/tests/whatsapp_ingress.sql`. Het script weigert een container met netwerktoegang.

Bronnen: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase changelog](https://supabase.com/changelog), [Meta webhooks](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/).

Buildcontrole: `npm run build -- --webpack` eindigde met exit 1 door `ENOTFOUND fonts.googleapis.com` voor Inter, Outfit en Playfair Display. Classificatie: infrastructuur/network failure. Geen geslaagde productiebuild; verdere buildfasen zijn hiermee niet bewezen.
