# T4XI Sanity CMS

## Afbakening

Sanity beheert in deze fase twee redactionele onderdelen:

- de volledige dienstenpagina in Nederlands en Engels;
- het wagenpark op de homepage in Nederlands en Engels.

Tarieven, prijsberekening, boekingen, betalingen en operationele data blijven
bewust buiten Sanity. Die gebruiken de bestaande server- en Supabase-laag.

## Beheeromgeving

De Studio draait in dezelfde applicatie op `/studio`. De navigatie bevat vier
vaste pagina's: Diensten NL/EN en Vloot NL/EN. Redacteuren kunnen daardoor geen
extra pagina's, willekeurige blokken of afwijkende vormgeving aanmaken.

De publieke site gebruikt een complete codefallback. Alleen wanneer een CMS-
document volledig aan het schema voldoet, vervangt het de bestaande inhoud.
Een lege dataset, netwerkstoring of onvolledig document maakt de website dus
niet leeg of kapot.

## Lokale configuratie

Kopieer `.env.example` naar `.env.local`. Het project-ID en de dataset zijn
publieke configuratie. `SANITY_API_READ_TOKEN` is server-only en mag uitsluitend
een Viewer-token zijn. Zet nooit een Sanity-token in een `NEXT_PUBLIC_*` variabele.

```bash
npm run dev
npm run studio
npm run typegen
npm run test:cms
```

`npm run dev` levert de ingebedde Studio op `http://localhost:3000/studio`.
`npm run studio` is de losse Sanity-ontwikkelserver.

## Eerste contentmigratie

`npm run cms:seed` maakt vier vaste documenten aan en uploadt de vier bestaande
voertuigbeelden. Het script is create-only: zodra één doeldocument bestaat,
stopt het zonder content te overschrijven. Controle zonder mutatie:

```bash
npm run cms:seed -- --dry-run
```

Het interieurbeeld bij Lynk & Co 01 blijft transparant als representatief
sfeerbeeld gemarkeerd. Vervang dit in de Studio zodra eigen of aantoonbaar
gelicentieerd modelbeeld beschikbaar is.

## Productie-activering

Voor conceptweergave zijn twee beveiligde beheerstappen nodig:

1. sta alleen `https://www.t4xi.nl` (en de gecontroleerde lokale origin) met
   credentials toe in de Sanity CORS-configuratie;
2. plaats een nieuw Viewer-token als `SANITY_API_READ_TOKEN` in de hosting-
   omgeving; nooit in Git en nooit in de browser.

Credentialed CORS vergroot bewust de rechten van die origin. Voer deze stap
alleen uit na expliciete goedkeuring van de eigenaar en behoud de bestaande CSP.

## Publiceren

Een redacteur opent de juiste taalversie, controleert de voorbeeldweergave en
kiest daarna Publiceren. Diensten en voordelen zijn inhoudelijk aan vaste
categorieën gekoppeld; beeldvelden vereisen een alt-tekst en ondersteunen een
hotspot. Logische labels en iconen blijven in de code, zodat contentwijzigingen
de premium vormgeving niet kunnen doorbreken.

## Technische controle

- `npm run typegen` extraheert het schema met verplichte velden en genereert de
  querytypen onder `sanity/generated/`.
- `npm run test:cms` controleert singleton-ID's, fallback, tokenisolatie,
  Studio-routing, CSP en create-only migratie.
- `npm run build` moet slagen voordat de CMS-branch wordt samengevoegd.
