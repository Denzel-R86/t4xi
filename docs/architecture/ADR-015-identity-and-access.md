# ADR-015 — Identiteit en autorisatie: de auth-gebruiker is geen domeinobject

**Status:** aanvaard — implementatie vrijgegeven voor staging; productie is een afzonderlijk besluit
**Datum:** 2 september 2026
**Context:** Sprint 15 — Identiteitsfundering
**Voorafgaand onderzoek:** architectuur-check identiteit/dispatch, 2 september 2026

> **Nummering.** Het nummer volgt de sprintnummering, net als ADR-011 en ADR-012.
> ADR-013 en ADR-014 bestaan niet; zoek er niet naar.

> **Beslisvoorwaarde.** Deze ADR is aanvaard als richting en geeft groen licht voor
> implementatie **op staging**. Toepassing op productie blijft een afzonderlijk
> besluit van de eigenaar, te nemen ná G1 tot en met G5 en ná de pre-push-controle
> uit *Migratievolgorde*. Zolang dat besluit niet expliciet is genomen, is een
> productie-push in strijd met deze ADR — ook wanneer alle gates groen zijn.

---

## Context

Het platform heeft geen identiteitslaag. Dat is geen tekortkoming die in de loop
van de tijd is ontstaan, maar een direct gevolg van de volgorde waarin is
gebouwd: eerst prijs, toen boeking, toen betaling, toen communicatie. Elk van die
lagen kon zonder ingelogde gebruiker.

De architectuur-check van 2 september 2026 stelde het volgende vast op `52e6ca8`:

- **Geen enkele `auth.uid()`** in 47 migraties. Supabase Auth wordt nergens
  gebruikt; `lib/supabase.ts` levert alleen een anon browser-client.
- **Een klant is drie tekstvelden** op `bookings` — `customer_name`,
  `customer_email`, `customer_phone` — per rit opnieuw ingevuld. Er is geen
  entiteit die twee ritten van dezelfde persoon aan elkaar verbindt.
- **`'assigned'` is een statuslabel zonder subject.** Er is geen `driver_id`,
  geen toewijzingsentiteit, geen chauffeurstabel.
- **Ops is één gedeeld wachtwoord** (`OPS_DASHBOARD_PASSWORD`). Er zijn geen
  rollen en geen persoonsidentiteit; `booking_status_transitions.actor` is vrije
  tekst die niemand kan verifiëren.
- **De anon-insertpolicy op `bookings` is al gesloten.** `bookings_insert_anon`
  stond in de baseline op `with check (true)` (audit H5), maar is op 20 augustus
  2026 ingetrokken door `20260820090000_remove_unused_anon_insert_policies`, en die
  migratie staat op productie. De waarschuwende opmerking in de baselinemigratie is
  daarmee verouderd; er zijn geen `grant`s richting `anon` op `bookings`. Deze ADR
  voegt daar niets aan toe behalve een regressietest.
- `/klant` en `/dashboard` bestaan als demo-UI met verzonnen data en worden door
  `proxy.ts` op 404 gezet.

### Waarom dit nu speelt

De strategische richting is een *managed premium network*: vaste chauffeurs,
zakelijke accounts met centrale facturatie, voorkeurschauffeur, terugkerende
klanten. Elk van die functies veronderstelt dat het systeem weet **wie** iemand
is. Voorkeurschauffeur zonder klantidentiteit is niet te bouwen; een maandfactuur
per organisatie evenmin.

De verleiding is om met dispatch te beginnen, omdat dat het zichtbare gat is.
Dat zou een tweede fundering op zand zijn: een `driver_id` op `bookings` zonder
identiteitslaag levert precies hetzelfde probleem op als `customer_name` als
tekstveld, alleen dan aan de aanbodkant.

---

## Beslissingsopties

| Optie | Waarom niet gekozen |
|---|---|
| **A — `auth.users.id` rechtstreeks als domeinsleutel** | Bakt de aanname in dat één persoon één rol heeft. Bij T4XI is dat aantoonbaar onwaar: een chauffeur die zelf een rit boekt is klant én chauffeur. Bovendien breekt elke uitoefening van het recht op vergetelheid dan referentieel de rithistorie en de audittrail. |
| **B — Eén `profiles`-record dat alle rollen draagt** | Verplaatst het probleem naar één brede tabel met nullable rolvelden. Rolgrenzen worden dan kolomconventies in plaats van entiteiten, en RLS per rol wordt onschrijfbaar. |
| **C — `identities` als indirectielaag, rollen als eigen entiteiten** *(gekozen)* | Scheidt autorisatie-identiteit van commerciële en operationele entiteiten. Kost één extra join en één extra tabel. |
| **D — Uitstellen tot de dispatch-sprint** | Betekent dat dispatch bovenop een niet-bestaande identiteit wordt gebouwd, met een tweede migratie achteraf die dan wél bestaande productiedata raakt. Duurder en risicovoller, precies op het moment dat er meer data is. |

---

## Besluit

**Tussen `auth.users` en het domein komt één indirectielaag: `public.identities`.
Domeintabellen verwijzen naar `identity_id`, nooit naar `auth.users.id`.**

```text
                    auth.users
                 (Supabase-beheerd)
                          │
                          │ auth_user_id — nullable
                          ▼
                  public.identities
                  de persoon · geen PII
                          │
        ┌─────────────────┼─────────────────┬──────────────────┐
        ▼                 ▼                 ▼                  ▼
    customer        organization_       ops / admin       driver
                       member                             (later)

     één persoon kan tegelijk in meerdere kolommen bestaan
```

De koppeling is bewust asymmetrisch: `identities` weet van auth, het domein weet
dat niet. Daardoor kan een auth-account verdwijnen zonder dat rithistorie of
audittrail referentieel breekt.

### Invarianten

Deze drie regels zijn de kern van dit besluit. Ze worden bewaakt met
bron-invariante tests over `supabase/migrations/`, niet met een afspraak.

**I1 — `identities` is de enige applicatietabel die rechtstreeks naar
`auth.users` mag verwijzen.** Geen enkele andere tabel in `public` krijgt een
foreign key naar het `auth`-schema. Wie die regel overtreedt, herintroduceert
optie A op één plek, en dat is precies waar het later stukloopt.

**I2 — Domeinidentiteiten vallen niet samen tot één profielrecord.** Eén
auth-subject kan tegelijk een customer-, een driver- en een ops-identiteit
bezitten. Die entiteiten mogen niet worden samengevoegd tot één rij met
rolvelden, en code mag nergens aannemen dat het bestaan van de ene de andere
uitsluit.

**I3 — Organisatiegebonden bevoegdheid wordt nooit afgeleid uit een globale
identity-role.** Wat iemand binnen een organisatie mag, volgt uitsluitend uit een
actieve rij in `organization_members` van diezelfde organisatie. Een globale rol
kan nooit toegang tot organisatiedata verlenen.

### Rolmodel

| Rol | Vastgelegd in | Betekenis |
|---|---|---|
| `admin` | `identity_roles` | Kent rollen toe en trekt ze in; maakt organisaties aan. |
| `ops` | `identity_roles` | Ziet boekingen, wijzigt statussen, beheert facturen. Geen rolbeheer. |
| `customer` | `identity_roles` + `customers` | Ziet uitsluitend eigen boekingen. |
| `business_user` | `organization_members` | **Afgeleid**, niet globaal — zie hieronder. `owner` beheert leden, `booker` boekt voor de organisatie, `traveller` reist alleen. |
| `driver` | `identity_roles` | Alleen in de check-constraint opgenomen zodat die later niet hoeft te wijzigen. Geen tabellen, geen policies, geen betekenis in deze sprint. |

`business_user` staat bewust **niet** in de globale rollen-enum. De rol is per
definitie organisatiegebonden; hem óók globaal vastleggen levert twee bronnen van
waarheid op die uit elkaar lopen zodra iemand bij een tweede organisatie hoort of
bij de eerste vertrekt. Dit is de directe toepassing van I3.

Rollen worden ingetrokken met `revoked_at`, niet met `delete`: wie wanneer welke
rechten had is zelf auditinformatie.

### Boekingen: koppeling zonder herschrijving

`bookings` krijgt drie **nullable** kolommen — `customer_id`, `organization_id`,
`booked_by_identity_id` — zonder default en zonder backfill.

De velden `customer_name`, `customer_email` en `customer_phone` blijven bestaan en
blijven gevuld, ook voor ingelogde klanten. Zij zijn **snapshot**, geen
verwijzing: wijzigt iemand over twee jaar zijn telefoonnummer, dan mag de boeking
van vandaag niet met terugwerkende kracht van betekenis veranderen. Dat is
dezelfde discipline die `price_snapshots` al toepast op de prijs. De bedoeling
wordt vastgelegd met `comment on column`, in de database zelf, waar de volgende
ontwikkelaar hem tegenkomt.

`customer_id NOT NULL` is geen doel voor later. Boeken zonder account is een
commerciële keuze, geen tekortkoming.

### Actor-identiteit

`booking_status_transitions.actor` blijft ongewijzigd en bestaande rijen worden
niet aangeraakt — herschreven audit is geen audit. Ernaast komt een nullable
`actor_identity_id`.

De bestaande functie `transition_booking_status(uuid, text, text, text)` mag
tijdens een deploy niet wegvallen, en een vijfde parameter mét default zou de
aanroep met vier argumenten dubbelzinnig maken. Daarom: een nieuwe functie met
vijf parameters zonder default, en de vier-parameterversie wordt een dunne
wrapper die met `null` delegeert. De statusmachine zelf — toegestane overgangen,
`for update`-lock, idempotente no-op — wordt niet aangeraakt.

**Ops gaat in dezelfde sprint van gedeelde naar persoonsgebonden login.** Dit is
geen los te knippen onderdeel: een `actor_identity_id` zonder betrouwbaar subject
erachter is een kolom die eerlijkheid suggereert zonder die te leveren, en maakt
gate G4 betekenisloos.

### Een anonieme boeking claimen

Automatisch koppelen op e-mailadres is verboden. Een e-mailadres in een
boekingsformulier bewijst geen eigenaarschap — een collega, een hotel of een
familielid kan de boeking hebben gemaakt.

Claimen vereist **boekingsreferentie én een geverifieerd e-mailadres** dat
overeenkomt met de snapshot, en schrijft altijd een rij in `booking_claims`.

De koppeling is bovendien **idempotent en exclusief**:

1. `claim_booking` matcht uitsluitend waar `customer_id is null`. Een tweede
   claim door dezelfde identiteit is een geslaagde no-op (`changed: false`),
   in dezelfde vorm als `transition_booking_status`.
2. Een boeking is uiteindelijk aan **ten hoogste één** geldige customer-identiteit
   gekoppeld. Wijzigen van een reeds gevulde `customer_id` is op databaseniveau
   geblokkeerd.
3. De enige uitzondering is een expliciet ops-correctiepad: een aparte
   `security definer`-functie die alleen door een `ops`- of `admin`-identiteit
   mag worden aangeroepen, een reden vereist, en de correctie vastlegt in
   `booking_claims` met methode `ops_correction`. Een stille herkoppeling bestaat
   niet.

Bij elke mislukking geeft `claim_booking` dezelfde generieke uitkomst terug — een
endpoint dat onderscheid maakt tussen "bestaat niet" en "al geclaimd" is een
enumeratielek.

### Bewaren en verwijderen

Het auth-profiel blijft in het door Supabase beheerde `auth`-schema; business-data
staat in `public`. Er wordt geen e-mailadres naar `public` gekopieerd, met twee
bewuste uitzonderingen: de boekingssnapshot (nodig voor uitvoering en factuur) en
`organization_invitations.email` (nodig om te bezorgen, en tijdelijk).

Het systeembeleid bij verwijdering splitst op **fiscale status**:

- **Niet-gefactureerde boekingen** — de snapshot wordt geanonimiseerd volgens het
  privacybeleid.
- **Gefactureerde boekingen** — de noodzakelijke gegevens blijven bewaard zolang
  de wettelijke bewaartermijn dat vereist, en worden daarna geanonimiseerd of
  verwijderd door een periodieke opruiming.

`erase_identity` verwijdert het auth-account (waardoor `auth_user_id` vanzelf
`null` wordt), maakt `display_name` leeg, zet `status` op `erased`, wist het
telefoonnummer op de `customers`-rij en trekt rollen en memberships in. De
`identities`-rij blijft bestaan, zodat de audittrail intact blijft.

> **Afbakening.** Deze ADR legt het *systeembeleid* vast, niet de juridische
> formulering. De exacte bewaartermijn, de grondslag en de tekst in de
> privacyverklaring en het retentiebeleid worden apart geverifieerd. Wijkt die
> verificatie af van het beleid hierboven, dan wint de juridische tekst en volgt
> een forward-only aanpassing van de opruimfunctie.

---

## Migratievolgorde

Zes additieve migraties. Geen `not null` zonder default op bestaande kolommen,
geen typewijziging, geen hernoeming, geen signatuurwijziging van bestaande RPC's.

| # | Migratie | Inhoud |
|---|---|---|
| 1 | `identity_core` | `identities`, `identity_roles`, helperfuncties, auth-trigger |
| 2 | `customers_organizations` | `customers`, `organizations`, `organization_members`, `organization_invitations`, `accept_invitation` |
| 3 | `bookings_identity_link` | drie kolommen, indexen, column comments, `booking_claims`, `claim_booking`, ops-correctiepad |
| 4 | `actor_identity` | `actor_identity_id` + vijf-parameterfunctie + wrapper |
| 5 | `identity_rls_policies` | alle policies in één reviewbaar bestand |
| 6 | `privacy_erasure` | `erase_identity` + retentie-opruiming |

Alle nieuwe tabellen volgen het bestaande patroon: `enable row level security`,
dan `revoke all from public, anon, authenticated`, dan gericht `grant`.
`identity_roles` krijgt geen enkele policy — wie zijn eigen rollen kan lezen of
schrijven, kan zichzelf promoveren.

### G6 — pre-push-controle

Deze gate is ontstaan als blokker: er stonden zes Event Pricing-migraties pending
op productie zonder GO, en `supabase db push` past alles toe wat pending is. Die
situatie bestaat niet meer — de Event Pricing-set is op 7 september 2026 met
expliciet mandaat per gate toegepast, en de productiehistorie telt 47 migraties
met local-only 0 en remote-only 0.

De onderliggende regel blijft wél gelden en wordt daarom als gate behouden, in
gewijzigde vorm: **direct vóór elke productie-push wordt `supabase migration list`
op beide projecten uitgevoerd, en de push gaat alleen door wanneer de pending set
exact de identiteitsmigraties bevat en niets anders.** Vindt de controle iets
onverwachts, dan stopt de push en volgt eerst een besluit over dat werk.

**Er wordt nooit selectief handmatig naar productie gemigreerd om zo'n bevinding te
omzeilen.** `apply_migration` is volgens het migratiebeleid in `README.md` geen
route voor repo-migraties, en een selectieve push laat de migratiehistorie
divergeren van de repository — precies de drift waarvoor de historie op 1 september
2026 is gerepareerd. Zo'n bevinding is governance, geen techniek, en wordt met een
besluit opgelost, niet met een truc.

### Bestaande boekingsdata

De productiedataset is klein — laatste telling ongeveer negen boekingen. **Er
wordt niets gebackfilled.** Historische boekingen houden hun snapshot; er worden
geen `customers`-rijen voor aangemaakt, want daarvoor bestaat geen account en geen
grondslag. Wie zijn oude boeking wil terugzien, claimt hem.

---

## Acceptance gates

| Gate | Eis |
|---|---|
| **G1** | Alle zes migraties toegepast op een branch-DB zonder fouten; elke nieuwe tabel heeft RLS aan en de drie revokes. |
| **G2** | Volledige RLS-matrix groen met echte JWT's, inclusief elke negatieve case. Eén rode negatieve case blokkeert de sprint. |
| **G3** | Bestaande pricing-, booking-, payments- en communicatietests groen; een end-to-end testboeking levert nog steeds een correcte quote-lock. |
| **G4** | Elke ops-transitie schrijft een niet-lege `actor_identity_id`. Rijen van vóór de migratie aantoonbaar ongewijzigd (rowcount + checksum vooraf/achteraf). |
| **G5** | `erase_identity` uitgevoerd op een testidentiteit: auth-account weg, identity-rij bestaat, audittrail intact, fiscaal noodzakelijke snapshots behouden. |
| **G6** | Direct vóór de productie-push toont `supabase migration list` op beide projecten exact de identiteitsmigraties als pending en niets anders. Elke afwijking stopt de push. |

Rollback is vooraf geschreven in `supabase/rollback_<datum>_identity.sql`, in de
vorm die er al ligt voor de addresses-RLS-fix. Omdat alles additief is, is
terugdraaien volledig: policies droppen, functies droppen, kolommen op `bookings`
droppen, tabellen in omgekeerde volgorde droppen. De anon-insertpolicy wordt
uitdrukkelijk **niet** hersteld — die is sinds 20 augustus 2026 terecht weg.

---

## Gevolgen

**Positief.** Voorkeurschauffeur, zakelijke accounts, rithistorie en een
klantportaal worden hierna schemawijzigingen van niets — de entiteiten bestaan
dan al. De audittrail krijgt een verifieerbaar subject in plaats van een
tekstveld. En de dispatchsprint kan zich beperken tot dispatch, in plaats van
halverwege alsnog een identiteitslaag te moeten uitvinden op een dan grotere
dataset.

**Negatief.** Deze sprint levert geen zichtbare functionaliteit op. Er komt geen
scherm bij; `/klant` en `/dashboard` blijven demo op 404. Dat is de prijs van een
fundering, en die prijs wordt hier bewust betaald in plaats van doorgeschoven. De
ops-omzetting naar persoonsgebonden login is bovendien de grootste brok van de
sprint terwijl niemand buiten het team het merkt.

**Neutraal.** Alle bestaande server-side flows blijven ongewijzigd werken, omdat
`service_role` RLS omzeilt. Het omzetten van routes naar de gebruikers-JWT is
daarmee een latere, afzonderlijke beweging — en dat is precies waar de volgende
grens ligt: service-role mag nooit een verzoek van een ingelogde gebruiker
uitvoeren zonder eigen autorisatiecheck, want dan is RLS voor de sier gebouwd.

---

## Wat er tot een productie-GO niet gebeurt

Niets hiervan is vergeten; het hoort na deze fundering, en het naar voren halen
maakt van deze sprint alsnog de portalsprint die hij niet moet zijn.

- Klantportaal en zakelijk dashboard — `KlantPortal.tsx` blijft demo op 404
- `drivers`-tabel, documenten, beschikbaarheid, werkgebieden
- `driver_id` op boekingen, toewijzing, dispatch, back-to-back planning
- Voorkeurschauffeur
- Payouts en marge-splitsing in `price_snapshots`
- Ratings en prestatiecijfers
- Realtime locatie
- Opgeslagen adressen koppelen aan `customers`
- Marketingtoestemming — hoort bij de consent-branch
- Boeken mét account in de publieke flow
- Omzetten van server-routes naar de gebruikers-JWT
- `/dashboard/brain` van basic auth halen

---

## Wanneer dit besluit herzien mag worden

De invarianten I1, I2 en I3 zijn de kern; die vervallen niet zonder een nieuwe
ADR die expliciet uitlegt welk scenario ze onhoudbaar maakt. Een implementatie
die ertegenaan loopt is geen aanleiding tot herziening maar tot correctie van de
implementatie.

Wel voor herziening vatbaar, zonder nieuwe ADR:

- De samenstelling van de globale rollen-enum, zolang I3 blijft gelden.
- De vraag of een `traveller` het organisatieoverzicht mag zien — nu bewust
  beperkt tot `owner` en `booker`.
- De precieze bewaartermijnen, zodra de juridische verificatie is afgerond.

Wat in elk geval **niet** volstaat om een bevinding uit de G6-controle te
omzeilen: tijdsdruk, een kleine dataset, of de vaststelling dat het gevonden werk
er "toch al bij hoort".
