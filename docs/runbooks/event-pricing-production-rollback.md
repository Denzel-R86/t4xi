# Runbook — Event Pricing productie-rollback

**Project:** `ajdsiklxfmmgisdvarhv` (t4xi-address-system, **productie**)
**Betreft:** de zes Event Pricing-migraties `20260827120000` t/m `20260831140000`
**Laatst geverifieerd:** 2026-09-02

> Dit document staat bewust **niet** onder `supabase/migrations/`. Een rollback hoort
> nooit een migratie te zijn — `supabase db push --include-all` zou hem anders kunnen
> meenemen.

---

## ⚠️ Kritieke context — lees dit eerst

**Productie heeft geen herstelpunt.** Read-only vastgesteld op 2026-09-02:

    supabase backups list --project-ref ajdsiklxfmmgisdvarhv
    {"walg_enabled":true,"pitr_enabled":false,"backups":[],...}

De organisatie staat op plan `free`: **geen PITR, geen managed backups, niets om naar
terug te keren.** Er is dus geen "gewoon terugdraaien". Dit runbook ís het
herstelmechanisme. Behandel elke destructieve stap alsof hij onomkeerbaar is, want
dat is hij.

---

## Uitvoeringsvoorwaarden bij de productiepush

**1. Uitsluitend in een rustig verkeersvenster.**
Migratie `20260827130000` voegt een CHECK-constraint toe aan **`price_snapshot_adjustments`**,
een bestaande tabel in de boekings-/quoteflow:

```sql
add constraint price_snapshot_adjustments_metadata_object_check
  check (metadata is null or jsonb_typeof(metadata) = 'object')
```

Dat neemt een **ACCESS EXCLUSIVE lock** en valideert de bestaande rijen. De validatie
is triviaal (`metadata` is op dat moment overal NULL), maar de lock blokkeert kort al
het verkeer op die tabel. Dit is het enige moment waarop de migratie live verkeer raakt.

**2. STOP na de push.**
De migratie landt met `pricing_event_config.mode = 'off'` (`seed_mode text := 'off'`).
**Laat dat zo.** Shadow mode aanzetten is een aparte gate met een eigen besluit en een
eigen verificatie. Zet `mode` niet op `shadow` of `live` in dezelfde sessie als de push.

---

## Beslisboom bij een incident

```
Probleem na de push
      ↓
Event Pricing blijft OFF          ← stap 1.1
      ↓
oude create_price_snapshot RPC herstellen   ← stap 1.2 (alleen indien nodig)
      ↓
booking-/quoteflow smoke-testen   ← stap 1.4
      ↓
nieuwe Event Pricing-tabellen LATEN STAAN
      ↓
later gecontroleerd opruimen      ← DEEL 2, aparte sessie
```

Herstel eerst **functionaliteit**. Breng de database niet cosmetisch terug tijdens een
incident.

---

# DEEL 1 — Emergency Functional Rollback

## 1.1 Kill switch — Event Pricing uit

```sql
-- VEILIG · IDEMPOTENT · geen lock van betekenis
update public.pricing_event_config
   set mode = 'off',
       updated_at = now()
 where active;
```

*Afhankelijkheid:* `pricing_event_config` bestaat (na de push altijd).
*Effect:* `lib/pricing/event-store.ts` leest deze rij. `off` = niets berekenen, niets
laden, niets loggen.
*Let op:* na de push staat dit al op `off`. Deze stap is de **garantie**, en het middel
als iemand hem intussen op `shadow` of `live` heeft gezet.

Verificatie:

```sql
-- READ-ONLY
select mode, active, updated_at from public.pricing_event_config where active;
```

In veruit de meeste scenario's is stap 1.1 genoeg. Ga alleen verder naar 1.2 als het
probleem aantoonbaar in de snapshot-/quoteflow zit.

## 1.2 Oude `create_price_snapshot` herstellen

De body hieronder is **verbatim uit productie gelezen** op 2026-09-02 via `pg_proc.prosrc`
— niet overgenomen uit een migratiebestand. Dat is bewust: de migratiebestanden in deze
repo kunnen achteraf commentaar hebben gekregen en zijn daardoor niet byte-identiek aan
wat draait.

> **Nooit `DROP FUNCTION` + `CREATE`.** De `GRANT EXECUTE` staat in
> `20260730130000_create_price_snapshot_rpc.sql` en wordt door de nieuwe migratie niet
> opnieuw uitgedeeld. `CREATE OR REPLACE` behoudt bestaande privileges; drop-en-hermaak
> gooit ze weg en breekt de aanroep vanuit de applicatie.

```sql
-- GEPIND op de bewezen live productiedefinitie van 2026-09-02.
-- VEILIG · IDEMPOTENT · uitsluitend CREATE OR REPLACE.
create or replace function public.create_price_snapshot(
  p_quote_id        uuid,
  p_pricing_version text,
  p_pricing_source  text,
  p_currency        text,
  p_subtotal_cents  integer,
  p_total_cents     integer,
  p_route_snapshot  jsonb,
  p_calculated_at   timestamptz,
  p_expires_at      timestamptz,
  p_created_at      timestamptz,
  p_adjustments     jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_adj jsonb;
begin
  insert into public.price_snapshots (
    quote_id, pricing_version, pricing_source, currency,
    subtotal_cents, total_cents, route_snapshot,
    calculated_at, expires_at, created_at
  )
  values (
    p_quote_id, p_pricing_version, p_pricing_source, p_currency,
    p_subtotal_cents, p_total_cents, p_route_snapshot,
    p_calculated_at, p_expires_at, p_created_at
  );

  for v_adj in
    select value from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb)) as t(value)
  loop
    insert into public.price_snapshot_adjustments (
      quote_id, code, label, amount_cents, taxable, vat_rate, sort_order
    )
    values (
      p_quote_id,
      v_adj ->> 'code',
      v_adj ->> 'label',
      (v_adj ->> 'amountCents')::integer,
      coalesce((v_adj ->> 'taxable')::boolean, true),
      nullif(v_adj ->> 'vatRate', '')::numeric,
      coalesce((v_adj ->> 'sortOrder')::integer, 0)
    );
  end loop;

  return p_quote_id;
end;
$$;
```

*Afhankelijkheid:* `public.price_snapshots` en `public.price_snapshot_adjustments` bestaan.
*Compatibel met de nieuwe kolom:* deze body schrijft **niet** naar `metadata`. Hij
functioneert ongewijzigd terwijl de nieuwe nullable kolom blijft staan (zie 1.5).

## 1.3 Verificatie na herstel

Vertrouw **niet** op de hash alleen. PostgreSQL slaat een PL/pgSQL-body verbatim op in
`prosrc`, dus `md5(prosrc)` is stabiel bij dezelfde extractiemethode — maar de *header*
wordt door `pg_get_functiondef()` genormaliseerd (`timestamptz` wordt
`timestamp with time zone`). Controleer daarom signature, security, `search_path` en ACL
apart.

```sql
-- READ-ONLY
select
  p.oid::regprocedure::text        as signature,
  pg_get_function_result(p.oid)    as returns_type,
  l.lanname                        as language,
  p.prosecdef                      as security_definer,
  p.proconfig                      as config,
  array_to_string(p.proacl, ' | ') as acl,
  length(p.prosrc)                 as body_len,
  md5(p.prosrc)                    as body_md5
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language  l on l.oid = p.prolang
where n.nspname = 'public' and p.proname = 'create_price_snapshot';
```

Verwachte waarden (gemeten op productie, 2026-09-02):

| veld | verwacht |
|---|---|
| aantal rijen | **1** (geen overloads) |
| `signature` | `create_price_snapshot(uuid,text,text,text,integer,integer,jsonb,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb)` |
| `returns_type` | `uuid` |
| `language` | `plpgsql` |
| `security_definer` | `true` |
| `config` | `{search_path=""}` |
| `acl` | `postgres=X/postgres \| service_role=X/postgres` |
| `body_len` | `974` |
| `body_md5` | `9f5585841cc245741f90f84d7fdcbcb4` |

Meer dan één rij betekent dat er een overload is ontstaan — dan is er drop-en-hermaak
gebruikt in plaats van `CREATE OR REPLACE`. Los dat op vóór je verdergaat.

## 1.4 Functionele smoke-test

Geen SQL. Loop de bestaande flow end-to-end door: quote aanmaken → snapshot vastleggen →
boeking afronden. Pas als dit slaagt is de rollback klaar.

## 1.5 Wat je tijdens een incident BEWUST laat staan

| Object | Waarom laten staan |
|---|---|
| `price_snapshot_adjustments.metadata` | Nullable en additief. De herstelde body schrijft er niet in en leest hem niet. Verwijderen kost een tweede ACCESS EXCLUSIVE lock op een tabel in de boekingsflow — dat maakt een incident erger. |
| `..._metadata_object_check` | Staat NULL toe en blokkeert dus niets. Zelfde lock-argument. |
| Alle 7 `pricing_event*`-tabellen | Geïsoleerd door `mode='off'` en RLS deny-by-default (RLS aan, geen policies → alleen `service_role`). Ze doen niets. Laat ze staan **tenzij aantoonbaar is dat zij het probleem veroorzaken**. |

---

# DEEL 2 — Deferred Cleanup

**Niet tijdens een incident.** Alleen na een expliciet besluit dat Event Pricing
definitief niet doorgaat. Dit is een aparte, geplande sessie met een eigen gate.

## 2.1 Tabellen verwijderen — FK-volgorde, zonder CASCADE

```sql
-- DESTRUCTIEF · idempotent door "if exists" · vereist expliciet besluit
-- Kinderen eerst (FK naar pricing_events), daarna de rest.
drop table if exists public.pricing_event_windows;
drop table if exists public.pricing_event_zones;
drop table if exists public.pricing_events;

-- Geen onderlinge FK's:
drop table if exists public.pricing_event_shadow_logs;
drop table if exists public.pricing_event_fee_rules;
drop table if exists public.pricing_event_config;
drop table if exists public.pricing_event_sync_log;
```

*Gebruik bewust GEEN `CASCADE`.* Geen enkele bestaande productietabel verwijst naar deze
zeven — geverifieerd. Zonder `CASCADE` geeft een onverwachte afhankelijkheid een
foutmelding in plaats van stil te worden meegesleept.
*Indexen en CHECK-constraints* verdwijnen met hun tabel; aparte drops zijn niet nodig.

## 2.2 Allerlaatst: de kolom op de bestaande tabel

```sql
-- DESTRUCTIEF · ACCESS EXCLUSIVE LOCK · alleen in een rustig venster
-- alter table public.price_snapshot_adjustments
--   drop constraint if exists price_snapshot_adjustments_metadata_object_check;
-- alter table public.price_snapshot_adjustments
--   drop column if exists metadata;
```

Bewust uitgecommentarieerd. Twee redenen om dit te laten staan tenzij er een bewezen
noodzaak is: het kost opnieuw een lock op een tabel in de boekingsflow, en alles wat
tijdens een eventuele live-periode in `metadata` is geschreven gaat onherroepelijk
verloren — er is geen backup om het uit terug te halen.

---

## Valkuilen

**A. Het commentaar in `20260828120000_pricing_events_seed_v2.sql` is fout.**
Dat verwijst naar een kolom `pricing_event_config.enabled` en geeft
`update public.pricing_event_config set enabled = false` als voorbeeld. **Die kolom
bestaat niet.** Het schema heeft `mode` (`off|shadow|live`) plus een losse `active`
boolean. Wie tijdens een incident dat commentaar volgt, krijgt een foutmelding op het
slechtst mogelijke moment. De juiste knop staat in stap 1.1.

**B. Herstel de RPC nooit met drop-en-hermaak.** Zie de waarschuwing bij 1.2.

**C. De hash alleen is geen bewijs.** Zie 1.3.

---

## Herkomst van de gepinde waarden

Alle waarden in 1.2 en 1.3 zijn op 2026-09-02 read-only gelezen uit `pg_proc` op
productie `ajdsiklxfmmgisdvarhv`. De live body bleek functioneel identiek aan
`20260730130000_create_price_snapshot_rpc.sql` — het enige verschil waren twee
commentaarregels die wel in het bestand staan en niet in productie (974 vs 1133 tekens).
Met commentaar en witruimte genormaliseerd is de uitvoerbare code regel voor regel gelijk.
Daarom is de **live** versie gepind, niet die van het migratiebestand.
