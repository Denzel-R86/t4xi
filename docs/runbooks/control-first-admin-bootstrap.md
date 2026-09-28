# Runbook — productie: migraties, eerste Control-admin, MFA

Drie **gescheiden** autorisatiegrenzen. Een GO op één ervan is geen GO op de volgende.

| | Fase | Vereist aparte toestemming |
|---|---|---|
| **A** | 12 databasemigraties toepassen | ja |
| **B** | eerste Auth-account + Control-admin bootstrap | ja |
| **C** | MFA, eerste login, Control-acceptatie | ja |

Geen enkele stap in dit runbook is uitgevoerd. Er staan geen credentials in.

---

## Fase A — 12 migraties

**A1. Canonical main verifiëren.**
Precondition: niets ongecommit. Actie: `git fetch && git rev-parse origin/main`. Verwacht: de vrijgegeven main-SHA, 62 migratiebestanden, ongewijzigde migratie-SHA's. **STOP** bij afwijkende byte.

**A2. Bestemming verifiëren.**
Actie: projectref en -naam opvragen. Verwacht: `ajdsiklxfmmgisdvarhv` / `t4xi-address-system`. **STOP** als de staging-ref `ztlhydagjqfzkyfiqgio` in beeld komt.

**A3. Preconditie migratiehistorie.**
Verwacht: 50 toegepaste migraties, remote-only **0**, pending **12**, laatste remote `20260925122616`. **STOP** bij een onverwachte remote-only migratie.

**A4. Migraties toepassen.**

```
supabase db push --include-all
```

`--include-all` is hier **noodzakelijk**, niet een workaround. Productie sprong van 31 augustus naar 25 september; de elf non-pricing migraties (8–12 september) liggen daardoor chronologisch vóór de laatste remote migratie en een gewone `db push` weigert met `DbPushMissingRemoteError`. Alle twaalf geplande migraties bestaan lokaal, zijn gecommit en zijn CI-groen; er wordt niets opnieuw uitgevoerd wat al in de historietabel staat. Dit is bewezen met een read-only dry-run.

**STOP** bij de eerste databasefout. Niet repareren, niet skippen, geen tweede route.

**A5. Historie verifiëren.** Verwacht: 62 toegepast, 0 pending, 0 remote-only, de drie `20260925*`-versies onaangeroerd.

**A6. Schema verifiëren.** Verwacht: 8 `control_*`-tabellen, `public.identities`, `actor_kind` op de audit, Gate C-invariant `VALID`, 0 NOT VALID in `public`, 9 `whatsapp_*`-tabellen met RLS, scheduler aanwezig.

**A7. Prijsstate verifiëren.** Verwacht: 89 rijen, business-fingerprint `33f15a3daf68e071ad363791ea529c68` — **ongewijzigd**. De baseline is hier een no-op. **STOP** als de fingerprint verschuift.

---

## Fase B — eerste administrator

**B1. Nul administrators bevestigen.**
Actie: `select public.control_effective_admin_count();`. Verwacht: **0**. **STOP** bij iets anders — gebruik dan `control_grant_role`, niet dit script.

**B2. Auth-account aanmaken.**
Via de Supabase **Auth Admin**-flow, niet via SQL. Maak het account zonder wachtwoord aan en laat de persoon zelf een wachtwoord zetten via een invite- of recovery-link. Geen wachtwoord, token of link in Git, SQL, logs, shell history of dit runbook. **STOP** als een credential ergens zou moeten worden opgeslagen.

**B3. Stabiele UUID vastleggen.**
De `auth.users.id` uit de vorige stap. Dit is de enige autoritatieve identifier; e-mail is muteerbaar en wordt nooit als zoeksleutel gebruikt.

**B4. Platform identity verifiëren.**
Verwacht: precies één `public.identities`-rij voor die UUID met `erased_at is null`, automatisch aangemaakt door de trigger `on_auth_user_created`. **STOP** bij nul rijen — dan is Gate A niet correct toegepast.

**B5. Bootstrap uitvoeren.**

```
psql "$OPERATOR_DB_URL" \
  -v auth_user_id=<uuid-uit-B3> \
  -v expect_email=<e-mail-van-dat-account> \
  -v display_name='<Voornaam Achternaam>' \
  -f scripts/control/bootstrap-first-admin.sql
```

Het script controleert eerst tien preconditie's en print de bestemming. Alles gebeurt in één transactie met een postconditie van exact één effectieve administrator; faalt die, dan rolt alles terug. **STOP** bij elke `bootstrap_*`-fout.

**B6. Resultaat verifiëren.** Verwacht: exact 1 effectieve administrator, 1 Control-identiteit voor die platform identity, 1 actieve `control_admin`-grant met `granted_by` leeg.

**B7. Auditbewijs verifiëren.**
Verwacht: één rij `control.first_admin.bootstrapped` met `actor_kind='system'`, alle drie actorvelden NULL, `classification='restricted'`, en metadata zonder enig geheim. **STOP** als de rij ontbreekt — dan is de bootstrap buiten het auditmodel gebeurd.

---

## Fase C — MFA en acceptatie

**C0. Configuratie-invariant.**
`CONTROL_REQUIRE_AAL2` mag in productie **niet** `"false"` zijn.

Dit is de scherpste regel in dit runbook. De database kent geen AAL: `control_authorize` geeft een AAL1-sessie gewoon toegang. De volledige MFA-gate zit in `authorizeControl()` achter die ene variabele. Staat hij op `"false"`, dan bereikt een wachtwoord-only sessie Control. **STOP** en corrigeer de omgeving voordat iemand inlogt.

**C1. Eerste login.** Precondition: wachtwoord gezet via B2. Verwacht zonder MFA: `mfa_required`, geen toegang tot `/admin`, en een geauditeerde `denied`-gebeurtenis met reden `mfa_required`.

**C2. TOTP-enrollment.** Via de Supabase MFA-flow. Verwacht: een geverifieerde factor.

**C3. AAL2 verifiëren.** Verwacht: `currentLevel = "aal2"`.

**C4. `/admin` verifiëren.** Verwacht: toegang, en een geauditeerde `success` met `aal='aal2'`.

**C5. Eén read-only acceptatiecheck.** Bijvoorbeeld de identiteitenlijst openen. Verwacht: zichtbaar voor deze administrator, en een auditrij per beslissing.

**C6. Bootstrapfase sluiten.** Vanaf hier verloopt alle identity management via `control_create_identity`, `control_grant_role`, `control_revoke_role` en `control_set_identity_status`. Het bootstrapscript weigert zichzelf zodra er een administrator bestaat; het hoeft niet verwijderd te worden en laat niets in de database achter.
