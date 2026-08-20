# Security Notes — T4XI.nl

## RLS-lek public.addresses (gevonden 2026-07-05, audit Fase 0)

### Wat was het lek

De policy `addresses_update_anon` gaf de rollen `anon` en `authenticated`
UPDATE-rechten op **alle rijen** van `public.addresses` (`USING true`,
geen `WITH CHECK`). Iedereen met de publieke anon key — die per definitie
in de browser zichtbaar is — kon dus elk adres in de database wijzigen:
weergavenamen, coördinaten, postcodes. Daarnaast stond
`addresses_write_anon` onbeperkt INSERT toe (`WITH CHECK true`), wat
datavervuiling mogelijk maakte.

### Hoe het is opgelost

Migratie `supabase/migrations/20260705_fix_addresses_rls.sql` (rev. 2):

1. `addresses_update_anon` verwijderd — anon kan geen bestaande adressen
   meer updaten. Alleen `service_role` mag dat nog (bestaande ALL-policy).
2. `addresses_write_anon` vervangen door `addresses_insert_validated_anon`:
   anon mag alleen adressen inserten met een legitieme herkomst —
   `source = 'bag_pdok'` mét `bag_id`, of `source` in
   (`google_places`, `reverse_geocode`). De bronnen `manual` en
   `pre_seeded` zijn voorbehouden aan `service_role`.
3. `increment_address_usage(uuid)` was in juli tijdelijk het gecontroleerde
   updatepad voor anon. Sinds de hardening van 2026-08-20 gebruikt de website
   deze legacy-RPC niet meer: de functie is `SECURITY INVOKER`, alleen
   uitvoerbaar door `service_role` en heeft een vaste `search_path`.
   Boekingen zelf lopen via de geharde server-side boekings-RPC.
4. Bonus: index op `popular_locations.address_id` (performance advisor).

Rollback: `supabase/rollback_20260705_addresses_rls.sql` — herstelt de
oude situatie inclusief het lek; alleen als noodmaatregel.

### Testqueries na deploy (met de anon key)

| # | Test | Verwacht resultaat |
|---|---|---|
| 1 | `SELECT policyname FROM pg_policies WHERE tablename='addresses'` (SQL Editor) | 3 policies; géén `addresses_update_anon` |
| 2 | `SELECT prosecdef FROM pg_proc WHERE proname='increment_address_usage'` | `false` |
| 2a | RPC `increment_address_usage` met anon/authenticated | ❌ permission denied; alleen `service_role` heeft EXECUTE |
| 3 | RPC `create_booking` met testdata | ✅ SLAAGT (booking_ref terug) |
| 4 | INSERT op `/rest/v1/addresses` met `source='bag_pdok'` + gevulde `bag_id` | ✅ SLAAGT (201) |
| 5 | INSERT met `source='manual'` | ❌ MOET FALEN (42501 / RLS violation — dit bewijst de fix) |
| 6 | PATCH op `/rest/v1/addresses` (bijv. `display_name='HACKTEST'`) | ❌ MOET FALEN of 0 rijen raken |

Testdata (TESTRIT-boeking, testadres) na afloop opruimen via het
dashboard (Table Editor, admin).

### ⚠️ Anon key hygiëne

De anon key is "publiek" in de zin dat hij in de browser zit, maar deel
hem NOOIT in chats, screenshots, logs, commits of documentatie:

- niet in chatgesprekken plakken (ook niet met AI-assistenten);
- niet in serverlogs of console.log laten belanden;
- niet hardcoden in bestanden — alleen via `.env.local` (in `.gitignore`);
- de service_role key is NIET publiek en mag de server nooit verlaten;
- bij een vermoeden van een lek: key roteren in het Supabase dashboard
  (Settings → API), net als bij het Google-key-incident van eerder.

### Historie

- 2026-07-05: lek gevonden (audit), migratie rev. 2 opgesteld en
  gereviewd, rollback voorbereid. Toepassing door owner via CLI.
- 2026-08-20: ongebruikte publieke usage-RPC teruggebracht naar
  `SECURITY INVOKER`; EXECUTE voor PUBLIC, anon en authenticated ingetrokken.
