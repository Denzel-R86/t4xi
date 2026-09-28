-- Eenmalige bootstrap van de eerste Control-administrator.
--
-- WAAROM DIT BESTAAT. `control_create_identity` kan de eerste administrator niet
-- maken: het eist zelf een actor met `identity.manage` en weigert self-onboarding
-- (`control_self_onboarding_denied`). Na de Control-migraties bestaan de rollen en
-- permissies wel, maar is er nul administrator. Dit script overbrugt dat gat één
-- keer, en weigert daarna zichzelf.
--
-- WAAROM EEN SCRIPT EN GEEN RPC. Een bootstrapfunctie in de database zou na
-- gebruik blijven bestaan als permanent doelwit dat een administrator kan
-- aanmaken. Dit script laat niets achter: het leeft in versiebeheer, draait onder
-- operator-privileges buiten de applicatie om, en is nooit vanuit een browser of
-- via PostgREST aanroepbaar.
--
-- GEBRUIK. Het script maakt GEEN auth-account aan; dat gebeurt via de Supabase
-- Auth Admin-flow. Hier komt uitsluitend een bestaande, stabiele UUID binnen:
--
--   psql "$OPERATOR_DB_URL" \
--     -v auth_user_id=00000000-0000-0000-0000-000000000000 \
--     -v expect_email=operator@example.test \
--     -v display_name='Naam Achternaam' \
--     -f scripts/control/bootstrap-first-admin.sql
--
-- Geen wachtwoord, token of invite-secret komt hier langs — niet als argument,
-- niet in de audit, niet in de uitvoer.
--
-- `expect_email` is GEEN zoeksleutel. De opzoeking gaat uitsluitend op UUID;
-- de e-mail is een bevestiging dat de operator de bedoelde omgeving en persoon
-- voor zich heeft. Een UUID uit de verkeerde omgeving faalt hierop.
\set ON_ERROR_STOP on
\timing off

\echo ''
\echo '=== BESTEMMING ==='
select current_database() as database,
       current_user       as uitvoerder,
       inet_server_addr()::text as server,
       pg_postmaster_start_time()::text as postmaster;
\echo 'Controleer bovenstaande regel voordat u verdergaat.'
\echo ''

begin;

-- ── Inputgrens ────────────────────────────────────────────────────────────
-- psql vervangt :'variabelen' niet binnen een dollar-quoted blok. De waarden
-- worden daarom hier opgevangen als transaction-local instellingen en binnen
-- het blok met current_setting() gelezen. Dat laat geen enkel databaseobject
-- achter: bij commit of rollback zijn ze weg. Er passeert hier nooit een
-- wachtwoord, token of invite-secret — alleen een UUID, een e-mail ter
-- bevestiging en een weergavenaam.
select set_config('bootstrap.auth_user_id', :'auth_user_id', true),
       set_config('bootstrap.expect_email', :'expect_email', true),
       set_config('bootstrap.display_name', :'display_name', true) \g /dev/null

do $bootstrap$
declare
  v_auth_user_id  uuid;
  v_raw_uuid      text := btrim(coalesce(current_setting('bootstrap.auth_user_id', true), ''));
  v_expect_email  text := btrim(coalesce(current_setting('bootstrap.expect_email', true), ''));
  v_display_name  text := btrim(coalesce(current_setting('bootstrap.display_name', true), ''));
  v_actual_email  text;
  v_identity_id   uuid;
  v_control_id    uuid;
  v_role_id       uuid;
  v_admins        int;
  v_missing_perms int;
begin
  -- ── GUARD 1 — argumenten aanwezig en bruikbaar ────────────────────────────
  if v_raw_uuid = '' then
    raise exception 'bootstrap_missing_auth_user_id: geef -v auth_user_id=<uuid> mee'
      using errcode = '22023';
  end if;
  begin
    v_auth_user_id := v_raw_uuid::uuid;
  exception when others then
    raise exception 'bootstrap_invalid_auth_user_id: auth_user_id is geen geldige UUID'
      using errcode = '22023';
  end;
  if v_expect_email = '' then
    raise exception 'bootstrap_missing_expect_email' using errcode = '22023';
  end if;
  if char_length(v_display_name) < 2 or char_length(v_display_name) > 120 then
    raise exception 'bootstrap_invalid_display_name: 2 tot 120 tekens vereist'
      using errcode = '22023';
  end if;

  -- ── GUARD 2 — schema is de verwachte Control-versie ───────────────────────
  -- Draaien tegen een half gemigreerde database zou een operator opleveren die
  -- na de volgende migratie niet meer resolvet.
  if not exists (select 1 from supabase_migrations.schema_migrations
                  where version = '20260912130000') then
    raise exception 'bootstrap_schema_too_old: Control identity management (20260912130000) is niet toegepast'
      using errcode = '55000';
  end if;

  -- ── GUARD 3 — de auth-user bestaat, opgezocht op UUID ─────────────────────
  select u.email into v_actual_email from auth.users u where u.id = v_auth_user_id;
  if not found then
    raise exception 'bootstrap_auth_user_not_found: geen auth.users rij voor de opgegeven UUID'
      using errcode = '42704';
  end if;

  -- ── GUARD 4 — omgevings- en persoonsbevestiging ───────────────────────────
  -- De e-mail bevestigt alleen; hij selecteert niet.
  if lower(btrim(coalesce(v_actual_email, ''))) is distinct from lower(v_expect_email) then
    raise exception 'bootstrap_email_mismatch: de UUID hoort bij een ander account dan verwacht — mogelijk de verkeerde omgeving'
      using errcode = '22023';
  end if;

  -- ── GUARD 5 — platform identity bestaat en is niet gewist ─────────────────
  select i.id into v_identity_id
    from public.identities i
   where i.auth_user_id = v_auth_user_id and i.erased_at is null;
  if not found then
    raise exception 'bootstrap_platform_identity_missing: geen actieve public.identities rij; controleer de on_auth_user_created trigger'
      using errcode = '42704';
  end if;

  -- ── GUARD 6 — er is nog geen administrator ────────────────────────────────
  -- Dit is de kern: na één geslaagde bootstrap is dit script niet meer geldig.
  select public.control_effective_admin_count() into v_admins;
  if v_admins <> 0 then
    raise exception 'bootstrap_admin_already_exists: % effectieve administrator(en) aanwezig; gebruik control_grant_role', v_admins
      using errcode = '42501';
  end if;

  -- ── GUARD 7/8 — geen conflicterende Control-identiteit ────────────────────
  if exists (select 1 from public.control_identities where identity_id = v_identity_id) then
    raise exception 'bootstrap_control_identity_exists: deze platform identity heeft al een Control-identiteit'
      using errcode = '23505';
  end if;
  if exists (select 1 from public.control_identities where auth_user_id = v_auth_user_id) then
    raise exception 'bootstrap_legacy_control_identity_exists: er bestaat al een Control-identiteit op dit auth-account'
      using errcode = '23505';
  end if;

  -- ── GUARD 9 — de rol bestaat, ondubbelzinnig ──────────────────────────────
  select r.id into v_role_id from public.control_roles r where r.role_key = 'control_admin';
  if not found then
    raise exception 'bootstrap_role_missing: rol control_admin bestaat niet' using errcode = '42704';
  end if;

  -- ── GUARD 10 — de permissies die een administrator moet krijgen ───────────
  select count(*) into v_missing_perms
    from (values ('control.access'), ('identity.read'), ('identity.manage'), ('identity.grant_admin')) as p(key)
   where not exists (
     select 1 from public.control_role_permissions rp
       join public.control_permissions perm on perm.id = rp.permission_id
      where rp.role_id = v_role_id and perm.permission_key = p.key);
  if v_missing_perms > 0 then
    raise exception 'bootstrap_permissions_incomplete: % verwachte permissie(s) niet aan control_admin gekoppeld', v_missing_perms
      using errcode = '55000';
  end if;

  -- ── MUTATIE ───────────────────────────────────────────────────────────────
  insert into public.control_identities (auth_user_id, identity_id, display_name, email, status)
  values (v_auth_user_id, v_identity_id, v_display_name, lower(btrim(v_actual_email)), 'active')
  returning id into v_control_id;

  -- granted_by blijft NULL: er was geen verlenende operator. Het schema staat
  -- dat toe (`references control_identities on delete set null`), en elke latere
  -- grant loopt via control_grant_role en vult dit veld wel.
  insert into public.control_identity_roles (identity_id, role_id, granted_by)
  values (v_control_id, v_role_id, null);

  -- ── AUDIT ─────────────────────────────────────────────────────────────────
  -- actor_kind = 'system': er is per definitie geen geauthenticeerde Control-actor
  -- op dit moment. 'user' zou een platform-actor vereisen en zou hier een onwaarheid
  -- zijn. Gate C staat een systeemgebeurtenis zonder actor expliciet toe.
  insert into public.control_audit_events
    (actor_kind, actor_identity_id, actor_control_identity_id, actor_auth_user_id,
     action, resource_type, resource_id, outcome, metadata,
     processing_purpose, classification, retention_until)
  values
    ('system', null, null, null,
     'control.first_admin.bootstrapped', 'control_identity', v_control_id::text, 'success',
     jsonb_build_object(
       'platform_identity_id', v_identity_id::text,
       'role_key', 'control_admin',
       'granted_by_present', false,
       'mechanism', 'operator_bootstrap_script'),
     'Access control and accountability', 'restricted', now() + interval '3650 days');

  -- ── POSTCONDITIE ──────────────────────────────────────────────────────────
  -- Exact één, niet "minstens één". Alles anders is een half resultaat en rolt terug.
  select public.control_effective_admin_count() into v_admins;
  if v_admins <> 1 then
    raise exception 'bootstrap_postcondition_failed: % effectieve administrator(en) na bootstrap, exact 1 verwacht', v_admins
      using errcode = '55000';
  end if;

  raise notice 'bootstrap ok: control identity % voor platform identity %', v_control_id, v_identity_id;
end
$bootstrap$;

commit;

\echo ''
\echo '=== RESULTAAT ==='
select public.control_effective_admin_count() as effectieve_admins,
       (select count(*) from public.control_identities) as control_identiteiten,
       (select count(*) from public.control_audit_events
         where action = 'control.first_admin.bootstrapped') as bootstrap_auditrijen;
\echo ''
\echo 'Volgende stap: eerste login, daarna MFA/TOTP-enrollment. Zonder AAL2 geeft'
\echo '/admin mfa_required, ook voor deze administrator.'
