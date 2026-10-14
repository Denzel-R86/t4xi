# Beoordeling: de 14 unieke regels uit het oude masterplan

**Opgesteld:** 2026-10-12 · herijkt 2026-10-14 · **Uitkomst: NIETS INTEGREREN**

> Verwijzingen gaan naar paragrafen en rij-aanduidingen in
> `docs/experience-2.0/masterplan.md`, niet naar regelnummers. Regelnummers
> verschuiven bij elke masterplanwijziging — tussen 12 en 14 oktober gebeurde dat
> twee keer (#76, #86/#87) — en waren daardoor binnen twee dagen onjuist.

Bij het opschonen van `~/Downloads/t4xi-next` (217 commits achter) bleek een
untracked `masterplan.md` van 486 regels te staan, tegen 492 op `main`. Een
regelvergelijking gaf **14 regels die alleen in de oude versie voorkwamen**. Dit
document legt per thema vast wat `main` er al over zegt.

## Uitkomst

Alle veertien zijn **eerdere, minder volledige formuleringen** van inhoud die
`main` al draagt. Drie ervan bevatten zelfs een richting die `main` daarna
**bewust heeft herroepen**. Integreren zou het document verslechteren en drie
vastgelegde besluiten ongedaan maken.

## Drie regels die een herroepen besluit bevatten

| Oude regel | Wat `main` besloot |
|---|---|
| Hero-choreografie op `html.js` | **Besloten 09-10:** `@media (scripting: enabled)` i.p.v. `html.js`, omdat `html.js` in de App Router pas ná de eerste paint wordt gezet — de hero zou flitsen en LCP herstarten (§5 Motion-spec) |
| AddressAutocomplete met type-label `Recent`/`Airport`/`Station` | **Besloten 09-10:** `Recent` **niet bouwen** — botst met §7, geen adressen bewaren (§3 Inventaris, rij `components/shared/AddressAutocomplete.tsx`) |
| B1 display-font: "blijft Outfit, of editorial serif" (open vraag) | **Besloten 08-10:** Playfair Display, rechtop, alleen Brand Mode ≥ 48px, nooit in transactionele onderdelen, volledige specificatie in §13f (§2, rij B1) |

## De overige elf

| Thema | Op `main` | Verhouding |
|---|---|---|
| 2.7 RouteFinder → "UW RIT" + handoff | §11 PR-volgorde, punt 2.7 | `main` voegt F-28 t/m F-34 en de prijsopbouwregels toe |
| `/dashboard/invoices` op gedeeld wachtwoord | §9b, legacy-tabel, rij `/dashboard/invoices` | `main` voegt `/api/admin/*`, HMAC-sessie, `BRAIN_DASHBOARD_*`-terugval en wachtwoordrotatie toe |
| `/dashboard/brain` achter Basic Auth | §9b, legacy-tabel, rij `/dashboard/brain` | `main` voegt "geen sessietimeout/uitlog" toe |
| `booking_status_transitions.actor` vrije tekst | §9b, legacy-tabel, rij `booking_status_transitions.actor` | `main` voegt `"ops-dashboard"` en de actorinvariant `20260912120000` toe; einddatum concreter |
| ADR-015 / beveiligingsstand, `proxy.ts` | §9b, "Huidige stand" | `main` benoemt #45/#47, staging-vs-productie en de S8-trigger |
| "voor staging; productie apart eigenaarsbesluit" | §9b, slotzin van "Huidige stand" | identiek van inhoud |
| design-specs §13c / §13d | §13 Design-specificaties | `main` voegt §13f toe |
| Arrival (hero) tabelrij | §5-choreografie | valt onder het herroepen `html.js`-besluit |

`main` draagt bovendien een herzieningsnotitie van 06-10-2026 na #45/#47 die de
oude versie niet heeft.

## Conclusie

De oude `masterplan.md` is een momentopname van vóór 08-10. Er is **geen enkele
ontbrekende, nog geldige architectuureis** in de 14 regels. Het bestand is
bewaard in de back-up; er is niets uit overgenomen.
