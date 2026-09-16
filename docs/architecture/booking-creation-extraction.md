# Bookingcreatie: gedeelde service en parity-gate

9 september 2026. Basiscommit `1ebf31c`. Uitgevoerd op lokale branch `feat/whatsapp-foundation`, zonder commit, push of merge.

## Resultaat

`app/api/bookings/route.ts` roept nu `createBooking(body)` uit `lib/bookings/create.ts` aan. De server-side applicatieservice valideert de bestaande bookinginput, bepaalt de prijs via `resolveBookingPrice`, roept dezelfde Supabase-RPC aan en verzorgt dezelfde retourupdates, communicatie en vluchtregistratie. De service accepteert geen HTTP Request en retourneert een gewoon object `{ status, payload }`, waarmee de route het bestaande HTTP-contract behoudt.

De route houdt rate limiting, ruwe-bodylimiet, JSON-parsing, honeypot, cacheheaders en HTTP-responseconstructie. De service is bedoeld voor vertrouwde serveraanroepers; toekomstige kanalen moeten zelf eerst hun actie autoriseren. WhatsApp roept deze service nog niet aan.

De volledige bestaande functie-inhoud vanaf veldvalidatie tot het eindresultaat is letterlijk verplaatst. Er zijn geen prijzen, validatieregels, SQL, RPC-signatures of transacties aangepast. Het bestaande `pending`-responselabel blijft behouden. Retourgegevens worden nog steeds na de RPC bijgewerkt met dezelfde fallback; communicatie blijft best-effort. Verbeteringen van deze eigenschappen horen in een afzonderlijke wijziging.

## Bewijs

`lib/bookings/fixtures/create-route-1ebf31c.ts.txt` is de ongewijzigde oude route, alleen als testfixture. Een vastgelegde SHA-256 bewaakt dat de referentie niet ongemerkt met de implementatie meeverandert. Deze tekst is geen productiecode en wordt nergens door een runtime-route geïmporteerd.

`lib/bookings/create-parity.test.ts` voert de oude en de nieuwe route uit met dezelfde vaste klok en gecontroleerde externe dependencies. Onbekende imports worden geweigerd; er gaan geen provider- of databaseaanroepen uit. De productiehelpers voor datum/tijd, fingerprint, bagage, locale en vluchtregistratie-input blijven echt in gebruik.

60 scenario's vergelijken:

- HTTP-status, body, headers en doorgegeven exceptions;
- prijsinput, snapshot/no-snapshot-pad en het autoritatieve RPC-bedrag;
- volledige RPC-naam en argumenten, inclusief klantgegevens, locaties, vluchtvelden en quote-fingerprint;
- volgorde, filters en payloads van retourupdates en email_sent-updates;
- het volledige booking.created-event en de vluchtregistratie-input;
- handmatige bagagebeoordeling, capaciteit, luchthaven heen/retour, DST, verlopen vertrek, ongeldige invoer;
- de negen quote-lock-foutcodes, onbekende RPC-fouten, ontbrekende config/resultaten en providerfouten;
- honeypot, oversized request, rate limiting en herhaalde bevestigingsaanroepen.

Drie aanvullende tests bewaken de fixturehash, de verwachte succesvolle effectvolgorde/prijs en het ontbreken van effecten bij ongeldige invoer. Totaal 63 nieuwe tests.

Vier bestaande testbestanden inspecteren nu route én service, zodat de bestaande broncontroles de verplaatste logica blijven vinden. Twee pricing-asserties controleren nu de echte `await resolveBookingPrice`-aanroep in plaats van een verwijzing naar calculateBookingPrice in een inmiddels verwijderde commentaartekst. Geen bestaande test verwijderd.

### Grenzen van dit bewijs

Deze tests bewijzen equivalentie op de applicatiegrens voor de genoemde scenario's. Zij bewijzen geen nieuwe database-atomiciteit of gelijktijdige verwerking in PostgreSQL: daarvoor is een echte database-integratietest nodig. De bestaande migraties en de plaats/volgorde van RPC's zijn niet gewijzigd. De herhalingstest vergelijkt dezelfde aanroepen; hij claimt niet dat de gemockte database deduplicatie implementeert.

Er is geen WhatsApp-webhook, state machine, AI, database-migratie, transport of nieuwe identity/dispatch-functionaliteit toegevoegd. Voor de MVP is een veilige server-side binding van de verzender aan een in die conversatie aangemaakte boeking voldoende. Dat geeft geen toegang tot historische boekingen via alleen een telefoonnummer. Een volledige identity-laag en dispatch blijven buiten deze sprint.

## Validatie

- `node --import tsx --test lib/bookings/create-parity.test.ts`: 63 geslaagd.
- `npm test`: definitief 1.143 geslaagd, 0 gefaald, 0 overgeslagen.
- `npm run lint`: geslaagd.
- `npm run typecheck`: geslaagd.
- `git diff --check`: geslaagd.
- De eerste volledige testrun vond drie bestaande bronlocatie-asserties die nog naar de oude route keken. Na bijwerken naar de werkelijke serviceketen is de suite geheel groen.
- Build wordt apart geregistreerd als infrastructuur/netwerkbeperking bij Google Fonts. Geen geslaagde build claimen op basis van lint/typecheck/tests.

## PR-omschrijving

Bookingcreatie zat volledig in de publieke API-route, waardoor een nieuw kanaal die logica zou moeten dupliceren. De route gebruikt nu één gedeelde server-side `createBooking`-service; de bestaande validatie, prijsbepaling, databaseaanroepen, communicatie en responses blijven behouden.

60 differentiële scenario's vergelijken de oude route met de nieuwe route en service, inclusief volledige effectaanroepen. Alle 1.143 tests, lint en typecheck slagen. De Google Fonts-buildfout wordt geclassificeerd als infrastructuur/network failure, niet als een geslaagde build. De tests gebruiken database/provider-doubles en claimen geen nieuwe live-transactieverificatie. Geen schemawijzigingen of actieve WhatsApp-functionaliteit in deze wijziging.

Definitieve buildcontrole voor deze refactor: `npm run build -- --webpack` eindigt met exit 1. De concrete fout is `getaddrinfo ENOTFOUND fonts.googleapis.com` bij de drie bestaande layoutfonts. Dit bevestigt opnieuw de netwerkfout uit de voorafgaande bouwstap; het bewijst niet dat alle verdere buildfasen zouden slagen zodra netwerktoegang beschikbaar is.
