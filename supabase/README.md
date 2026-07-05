# Migraties

De zes oorspronkelijke migraties van t4xi-address-system leven momenteel
alleen in het Supabase-project. HANDMATIGE ACTIE (owner): haal ze op met

    supabase link --project-ref ajdsiklxfmmgisdvarhv
    supabase db pull

zodat het volledige schema onder versiebeheer staat.

`20260705_fix_addresses_rls.sql` is de RLS-fix uit de security-audit en is
NOG NIET toegepast op productie — eerst reviewen, dan pushen.
