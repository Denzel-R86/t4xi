# WhatsApp als frontend van T4XI

Datum: 9 september 2026. Status: architectuurinspectie en eerste veilige bouwstap; overige stappen hieronder zijn gepland, niet geïmplementeerd.

## Onderzoeksbasis

Geïnspecteerd: lokale repository `/Users/Dalgliesh/Downloads/t4xi-next`, commit `1ebf31c` (8 september 2026), remote `https://github.com/Denzel-R86/t4xi.git`. Geen remote-fetch of vergelijking met actuele GitHub HEAD uitgevoerd. Geen live Supabase-schema of migratiehistorie gecontroleerd: dit zijn bevindingen uit broncode en migraties, geen verklaring over productie.

Werk vindt plaats in een geïsoleerde clone op branch `feat/whatsapp-foundation`. De oorspronkelijke checkout heeft ongetrackte `.claude/` en `docs/architecture/ADR-015-identity-and-access.md`; die zijn niet gewijzigd of meegekopieerd. ADR-015 is als aanvullende lokale ontwerpinformatie gelezen, niet als bewijs van geïmplementeerde identiteit. Er is geen AGENTS.md gevonden in de onderzochte repo of relevante bovenliggende mappen.

## Werkelijke aansluitpunten

| Onderdeel | Bestaand aansluitpunt | Consequentie voor WhatsApp |
| --- | --- | --- |
| Bookingcreatie | `app/api/bookings/route.ts`: invoervalidatie, `resolveBookingPrice`, RPC, retourgegevens, `booking.created`, vluchtregistratie | Nog geen zelfstandige create-booking-service. Eerst deze flow verplaatsen naar een gedeelde applicatieservice; geen routecode kopiëren naar WhatsApp en geen interne HTTP-loop naar de publieke route. |
| Pricing | `lib/pricing/engine.ts`: `calculateBookingPrice`, `resolveBookingPrice`; `lib/pricing/service.ts`; `lib/pricing/snapshot-store.ts` | Alleen deze keten levert prijzen. Preview moet succesvolle `persistPriceSnapshot` hebben. Server gebruikt snapshot-totaal, quote-ID en geldigheid. |
| Quotevalidatie | `app/api/pricing/quote/route.ts` | Datum, tijd, bagage en handmatige beoordeling zitten deels in de HTTP-route. Ook deze validatie eerst delen; rechtstreeks de engine aanroepen zou huidige vangrails missen. |
| Bookingstatus | `lib/bookings/lifecycle.ts`, `app/api/admin/bookings/route.ts`, RPC `transition_booking_status` | DB bepaalt toegestane overgang en schrijft audit. De creatieroute retourneert nog letterlijk `pending`, terwijl de lifecycle `inquiry` gebruikt. WhatsApp moet de opgeslagen status lezen; het response-label niet als domeinwaarheid overnemen. |
| Customer | `bookings.customer_name/customer_phone/customer_email`, `lib/types/database.ts` | Geen inzetbare customer-service gevonden. Geen automatische koppeling via telefoon/e-mail. ADR-015 beschrijft toekomstige identities/customers en claimregels. |
| Communicatie | `lib/communication/orchestrator.ts::dispatch`, events, policies, templates, delivery-log en channel registry | Uitgaande domeincommunicatie via deze laag. WhatsApp is gemodelleerd maar inactief en heeft geen transport. Het huidige outbound-contract en template-renderer zijn op e-mail ingericht en moeten kanaalbewust worden. |
| Dispatch | Lifecycle `assigned`, event `booking.driver_assigned`, admin-statusroute | Geen operationele driver/assignment/beschikbaarheidsservice gevonden. `executing_carriers` is een facturatiekoppeling, geen chauffeurtoewijzing. Geen chauffeurinformatie of beschikbaarheidsbelofte totdat een echte bron bestaat. |
| Webhooks | Stripe-route: raw body, providerverificatie, transactionele payment-RPC. Resend-route: eigen Svix-signaturemodule, delivery-status-RPC | Volg pure, injecteerbare helpers en node:test. Meta heeft een ander signatureformaat; hergebruik niet het Svix-tijdvenster. |
| Conversation | Geen backend-conversation/state-machine gevonden in `app/api` en `lib` | Nieuwe kanaalspecifieke conversation state nodig, los van bookings. |
| Scheduling | `lib/communication/scheduler.ts` | Alleen contract en expliciet onbeschikbare implementatie. Geen werkende reminder-worker veronderstellen. |

De oudere booking-price- en snapshotdocumenten bevatten inmiddels achterhaalde passages (onder meer geen quote-lock of prijs tonen wanneer snapshotopslag faalt). De huidige quote-route weigert bij ontbrekende snapshotopslag. Code en recente migraties zijn hier bepalend.

## Relevante database-objecten en migraties

Alle paden hieronder beginnen met `supabase/migrations/`.

| Bestand | Objecten / belang |
| --- | --- |
| `20260707120000_bookings_schema_baseline.sql` | bookings, klantcontact als snapshot, create_booking-baseline |
| `20260807220341_secure_create_booking_rpc.sql` | beveiligde create_booking-definitie |
| `20260730120000_price_snapshots.sql` | price_snapshots, price_snapshot_adjustments |
| `20260730130000_create_price_snapshot_rpc.sql` | atomaire snapshotopslag |
| `20260730140000_bookings_quote_id.sql` | booking ↔ quote |
| `20260808111336_booking_quote_lock.sql` | oorspronkelijke booking-uit-snapshot-migratie; geïdentificeerd in bestandsinventaris |
| `20260820100000_fix_quote_lock_luggage_capacity.sql` | actuele onderzochte create_booking_from_snapshot: row lock, hergebruik, capaciteit en bagage |
| `20260809090000_add_return_trip_details.sql` | gestructureerde retourgegevens |
| `20260802120000_flight_monitoring.sql` | flight_monitoring, registratie en claims |
| `20260808170000_executing_carriers.sql` | executing_carriers en factuurdetails; geen dispatch |
| `20260830120000_booking_lifecycle_and_communication.sql` | lifecycle, booking_status_transitions, communication_deliveries en claim/settle/provider-RPC's |

`supabase/README.md` bevat historische opmerkingen over onvolledige baselinemigraties. Controleer de echte migratiehistorie en een lokale schema-rebuild vóór de databasefase. Volg het migratiebeleid in README: bestaande uitgerolde migraties niet wijzigen; canonieke repo-migraties via db push/CI, geen selectieve apply_migration.

## Doelarchitectuur

```text
Meta → begrensde raw-body webhook → verificatie → duurzame inbox + audit
                                                    ↓
                                      worker met lease en conversation-lock
                                                    ↓
                              gevalideerde intent/entities → vaste flow
                                 ├─ gedeelde quote-applicatieservice
                                 ├─ gedeelde booking-applicatieservice
                                 ├─ geautoriseerde booking-read
                                 └─ menselijke werkvoorraad
                                                    ↓
                              communication policies → WhatsApp transport
```

AI krijgt alleen een strikt schema voor intent en kandidaatvelden: pickup, dropoff, lokale datum/tijd, ritsoort, passagiers, bagagecategorie, vluchtnummer, naam en e-mail. Onbekende velden worden geweigerd. Geen prijs, quote-ID, beschikbaarheid, bookingstatus, bevoegdheid, SQL, toolnaam of bevestigingsbesluit uit AI-output accepteren. AI krijgt geen databasecredentials of mutatietools. De vaste flow valideert kandidaten via gedeelde domeinvalidatie. Ambiguïteit leidt tot een gerichte vraag of handoff. Geen vrije AI-antwoorden in deze MVP; antwoorden komen uit gecontroleerde teksten en domeinresultaten.

## Conversation, draft en autoriteit

Voorgestelde tabellen (nog geen migratie):

- `whatsapp_conversations`: ID, business phone-number-ID, WABA-ID, wa_id, locale, state, version, last_customer_message_at, handoff_owner en timestamps. Eén actieve conversatie per businessnummer + wa_id via een partial unique index. Geen echte booking creëren bij start.
- `whatsapp_booking_drafts`: conversation-ID, version, alleen invoervelden, quote-ID nullable, quote-draft-version, expires_at, confirmation_nonce_hash en consumed_at. Afzonderlijk van bookings; server koppelt quote aan conversatie en draftversie. Een nieuwe rit krijgt een nieuw draft-ID.
- `whatsapp_inbox_events`: ID, account/nummer, unieke event-key, type, received_at, provider timestamp, payload-hash, verwerkingsstatus, lease_token, lease_until, attempts, next_attempt_at en veilige foutcode. Providerstatussen krijgen hun eigen event-key, niet dezelfde sleutel als het klantbericht.
- `whatsapp_messages`: conversation-ID, provider-message-ID, direction, type, private inhoud en timestamps. Inbound uniek op businessnummer + provider-message-ID. Ruwe payload alleen indien nodig voor verwerking, beperkt bewaard.
- `whatsapp_conversation_events`: append-only audit met conversation-ID, inbox-ID, actor, from/to-state, reason-code, draftversie, quote-ID, booking-ID, command-ID, extractor/schema-versie en geaccepteerde veldnamen. Geen verborgen modelredenering, secrets of volledige berichttekst in operationele logs.
- `whatsapp_handoffs`: conversation-ID, status, reason-code, eigenaar, opened_at, claimed_at en closed_at. Eén open handoff per conversatie; claim/update geautoriseerd en geaudit.
- Gedeelde booking-command/outbox-opslag: unieke command-key en resultaat voor betrouwbare herhaling plus domeinevents. Dit hoort bij de gedeelde applicatielaag, niet bij een WhatsApp-booking-engine.

Nieuwe tabellen: RLS aan, expliciete revokes voor public/anon/authenticated en minimale serverrechten. Ops gebruikt een geautoriseerde serverroute; alleen ingelogd zijn is geen bevoegdheid. Bij toekomstige identity-integratie verwijzen naar de domeinidentiteit uit ADR-015. Retentie als expliciet releasebeleid configureren: concepten en inhoud korter dan boekingsadministratie; pseudonieme dedup-tombstones bewaren zolang replay nog mogelijk is. Geen definitieve juridische bewaartermijn in dit technisch voorstel vastleggen.

Flow: `new → collecting_trip → quoted → awaiting_confirmation → booking_submitted`, met `handoff` en `closed`. `booking_submitted` betekent dat een echte booking bestaat; het betekent niet dat de rit confirmed of assigned is. De UI toont de actuele DB-status afzonderlijk. Bij draftwijziging quote en bevestigingsnonce ongeldig maken. Gesloten of aan een mens overgedragen conversaties reageren niet autonoom op oude bevestigingen.

Boeken vereist expliciete klantbevestiging van de getoonde, niet-verlopen quote en exacte draftversie via een eenmalige, servergegenereerde actie. Vrije tekst “ja” mag hoogstens een bevestigingsknop opleveren; AI mag geen boeking autoriseren. De verwerking controleert conversation, wa_id, nonce, draftversie en handoff onder lock. Een out-of-order bericht mag geen nieuwere draft overschrijven; bij onduidelijke volgorde opnieuw bevestigen.

Voor bestaande boekingen: geen opzoekresultaat of mutatie enkel op basis van telefoonnummer of bookingreferentie. Gebruik later de geverifieerde claim/identity-flow; tot die beschikbaar is handoff zonder gegevenslek. Annuleren/wijzigen eerst menselijke afhandeling, daarna alleen via geautoriseerde gedeelde domeinacties. Luggage-capaciteit en `quote.available` zijn geen live driver-beschikbaarheid.

## Webhook, retries en handoff

GET `/api/webhooks/whatsapp`: controleer `hub.mode=subscribe` en server-side verify-token, retourneer alleen de challenge bij een exacte match. Verify-token is een ander geheim dan de Meta app-secret. POST gebruikt nodejs runtime, force-dynamic en no-store; begrens de stream in bytes voordat alles in geheugen staat. Verifieer X-Hub-Signature-256 over ongewijzigde bytes vóór JSON-parsing. Daarna schema-, WABA- en phone-number-allowlistcontrole; loop over alle entries/changes/messages/statuses in een batch.

Inbox + enqueue + ontvangst-audit moeten atomair zijn vóór 200. Duurzaam reeds ontvangen is veilig te bevestigen; een lopende worker hoeft niet op Meta te wachten. Store-uitval geeft 503, nooit 200 met weggevallen berichten. Onbekende geldig ondertekende events gecontroleerd als ignored vastleggen. Ongeldige handtekening geeft 401; ontbrekende configuratie 503; te groot 413; malformed payload 400.

Dedup is op provider-ID/accountscope, niet op berichttekst of alleen de HTTP-bodyhash. Twee identieke klantteksten met verschillende IDs blijven twee berichten. Een bodyhash helpt detectie, maar een batch kan opnieuw gegroepeerd worden. Meta-handtekening alleen bewijst geen versheid: geen vijfminutenfilter uit Resend kopiëren dat geldige retries weggooit. Oude/ambiguë instructies nooit een mutatie laten doen zonder actuele confirmation binding.

Workers claimen met lease + fencing token, serialiseren per conversatie, gebruiken bounded backoff en zetten onherstelbare fouten in handoff. State-transitie, commandregistratie en audit atomair. Een crash na bookingcreatie wordt hersteld via de command-key en bestaand resultaat, ook als de quote inmiddels verlopen is. De bestaande snapshot-RPC voorkomt een tweede boeking maar garandeert niet zelfstandig alle vervolgeffecten: de route heeft retourupdates en best-effort communicatie na de RPC. Daarom shared command/result + outbox invoeren voordat automatische WhatsApp-creatie aan gaat. Geen claim dat netwerkverzending exactly-once is: bij onzekere provideracceptatie eerst reconciliëren/handoff, niet blind opnieuw verzenden.

Handoff zet automation onder dezelfde conversation-lock uit; een reeds lopende worker controleert versie/fencing opnieuw vlak vóór een effect. Ops krijgt een werkvoorraad met reden, gevalideerd draft en relevante context. De klant krijgt alleen een overdrachtsmelding nadat de handoff duurzaam is opgeslagen. Geen responstijd beloven zonder operationele dekking. Hervatten vereist een expliciete geautoriseerde actie en opnieuw valideren van quote en draft.

Uitgaand: uitbreiden van bestaande communication events, channel-aware templates en recipientpolicy; geen tweede mail/bericht-orchestrator. Nieuwe conversation-subjecttype vereist ook aanpassing van de DB-check. Voeg voor dialoogberichten een unieke message/action-ID toe aan dedup; alleen eventtype + conversation-ID zou alle vervolgvragen onterecht dedupliceren. Providerreceipts koppelen op provider + account + message-ID met monotone statusverwerking. Voor WhatsApp eigen getypeerde tekst/interactive/template-payload, telefoonnormalisatie, opt-in/policy, template-ID/taal en customer-service-windowcheck. Buiten toegestane sessie alleen goedgekeurde templates. Verifieer actuele Meta-regels vóór transportimplementatie. Bestaande e-mailallowlist en simulatorexcepties zijn geen telefoonpolicy; non-productie blijft default-deny.

## Implementatievolgorde en acceptatie

| Stap | Concrete bestanden/werk | Gate |
| --- | --- | --- |
| 1 — nu | `lib/whatsapp/webhook-signature.ts`, `.test.ts`, dit ontwerp | Pure verificatie met onafhankelijke HMAC-testvector, tampering/UTF-8/malformed-config-tests. Geen endpoint of effects. |
| 2 — gedeelde seams | nieuw `lib/bookings/create.ts`, `lib/pricing/quote-application.ts`; dunner maken van beide bestaande API-routes | Bestaande validatie en side effects verplaatsen, niet kopiëren. Karakterisatietests voor heen/retour, DST, luchthavenvlucht, bagage, lock, no-lock, errors, response en communicatie. Websitegedrag blijft gelijk; statuscontract expliciet corrigeren met regressietest. |
| 3 — inbox en ontvangst | nieuwe CLI-gegenereerde migratie, `lib/whatsapp/inbox.ts`, `app/api/webhooks/whatsapp/route.ts` | Lokale DB-tests voor grants/RLS, dubbele en gelijktijdige events, batch, crash/retry, leases, auditrollback en DB-uitval. Alleen durable ontvangst, geen boekingen. |
| 4 — draft en handoff | `lib/whatsapp/conversation.ts`, `extraction.ts`, `handoff.ts`, worker en ops-werkvoorraad | Alleen verzamelen, quote tonen via gedeelde service en handoff. Test prompt injection, onbekende velden, stale edits, duplicate messages, menselijke overname tijdens worker. |
| 5 — veilige boekingscommand | gedeelde command/result/outbox plus koppeling naar create-service | Expliciete bevestiging, sender/draft/quote binding, dubbele bevestiging, timeout ná DB-commit, herstel na quote-expiry. Eén booking, geen dubbele vervolgeffecten. Onbekende routes eerst handoff. |
| 6 — transport | `lib/communication/channels/whatsapp.ts`, typed channel-contract, policies/templates/events/delivery-log en DB-aanpassingen | Alleen allowlisted stagingnummer; templates en session-window, receipts/out-of-order, onzekere send, consent, logging. Nog geen driverclaims zonder dispatchbron. |
| 7 — beperkte uitrol | featureflags en runbook: inbound, automation, outbound afzonderlijk | Database/schema en worker eerst; dan allowlisted proefgesprekken en expliciete productie-uitrol. Uitschakelen automation stopt mutaties, inbox/handoff blijft verliesvrij functioneren. |

Vóór stap 5 moeten identity/claim en authorisatiegrenzen concreet getoetst zijn. Vóór chauffeursinformatie is echte dispatch een aparte afhankelijkheid. Geen van die ontbrekende diensten wordt in de WhatsApp-laag geïmiteerd.

## Eerste stap en beperkingen

Geïmplementeerd: side-effectvrije `verifyWhatsAppSignature` met raw bytes, strikte headercontrole, HMAC-SHA256, timingSafeEqual, vaste foutcodes en fail-closed configuratie. Tests bevatten een onafhankelijke RFC 4231-vector, gewijzigde payload, normalisatie, verkeerde sleutel, malformed headers en expliciet bewijs dat signatureverificatie géén deduplicatie is.

Geen route gepubliceerd, geen database gemuteerd, geen WhatsApp- of e-mailberichten verstuurd. De module is de eerste beveiligingsbouwsteen, geen werkende chatbot. Volledige implementatie en database-integratietests volgen volgens de gates hierboven.

Bronnen: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). De officiële [Meta webhookdocumentatie](https://developers.facebook.com/docs/graph-api/webhooks/getting-started) gaf tijdens deze sessie HTTP 429; ook de Supabase changelog was via de webtool niet op te halen. Herverifieer providercontracten vóór endpoint/transportactivatie. Er zijn in deze stap geen Supabase-API's of schema's geïmplementeerd.

## Verificatie van deze stap

- Gerichte WhatsApp- en Resend-signaturetests: 15/15 geslaagd (7 nieuw).
- Volledige suite `npm test`: 1.080 geslaagd, 0 gefaald, 0 overgeslagen.
- `npm run lint`, `npm exec -- next typegen`, `npm run typecheck`: geslaagd.
- `npm run build`: eerste poging geweigerd vanwege een node_modules-symlink; tweede poging met gekopieerde dependencies bleef in compile hangen en is afgebroken.
- Aanvullend `npm run build -- --webpack`: exit 1, Google Fonts-fetch faalt met `getaddrinfo ENOTFOUND fonts.googleapis.com` voor de bestaande layoutfonts. Geen geslaagde productiebuild geclaimd; herhalen in een omgeving met netwerktoegang.
- Patch gecontroleerd en toegepast in een lege tijdelijke controlecheckout. Geen wijzigingen aan oorspronkelijke checkout; geen commit, push of deploy.
