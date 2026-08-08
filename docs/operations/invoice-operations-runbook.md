# Facturatiebeheer

## Aanmelden en afmelden

Open `/dashboard/invoices` en meld aan met de server-side operationsgegevens uit
Vercel. Na een geldige aanmelding wordt een HttpOnly-sessie voor maximaal twaalf
uur geplaatst. Gebruik **Afmelden** om die sessie direct te verwijderen. De
operations-API accepteert geen door de browser bewaarde HTTP Basic Auth meer.

## Uitvoerend taxibedrijf onboarden

1. Open bovenaan **Uitvoerende taxibedrijven**.
2. Vul de officiële bedrijfsnaam in en kies **Bedrijf onboarden**.
3. De database maakt automatisch een vaste UUID aan. De verkorte ID in het
   scherm is alleen een herkenbare weergave; de volledige UUID wordt opgeslagen.
4. Het actieve bedrijf verschijnt direct in de dropdown van iedere boeking.

Voeg een bedrijf maar één keer toe. Bedrijfsnamen zijn hoofdletterongevoelig
uniek. Facturen bewaren zowel de vaste vervoerders-ID als een momentopname van de
bedrijfsnaam, zodat een reeds uitgegeven factuur niet verandert als stamgegevens
later worden aangepast.

## Livegang

Voer eerst `20260808170000_executing_carriers.sql` uit op dezelfde Supabase-
productiedatabase die `NEXT_PUBLIC_SUPABASE_URL` in Vercel aanwijst. Publiceer
daarna de applicatiecode. Controleer vervolgens:

- zonder sessie verschijnt het aanmeldscherm en geen boekingsdata;
- aanmelden met de operationsgegevens laadt boekingen en vervoerders;
- een nieuw bedrijf krijgt een ID en verschijnt in alle dropdowns;
- de gekozen vervoerder blijft na opslaan aan de boeking gekoppeld;
- **Afmelden** brengt het scherm terug naar de aanmelding;
- na afmelden geeft `/api/admin/invoices` HTTP 401.
