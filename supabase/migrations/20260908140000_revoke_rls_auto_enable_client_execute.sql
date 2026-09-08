-- Withdraw direct EXECUTE on public.rls_auto_enable() from client roles.
--
-- What this function is: it backs the enabled event trigger `ensure_rls`
-- (ddl_command_end), which auto-enables row level security on every new table
-- in `public`. That safety net stays intact — event triggers run as their
-- owner and never consult EXECUTE grants, so revoking direct execution does
-- not disable it.
--
-- Why revoke: Supabase's security advisor flags it because EXECUTE is granted
-- to PUBLIC, which makes a SECURITY DEFINER function owned by `postgres`
-- callable by `anon` and `authenticated` over the REST API. Measured impact
-- today is nil: the body iterates pg_event_trigger_ddl_commands(), which
-- returns nothing outside a DDL event, and the function takes no arguments,
-- so a direct call has no effect and no injection surface. This is hygiene
-- next to a new privileged Control layer, not an exploit fix.
--
-- Scope: grants only. The function is NOT created, replaced or dropped here.
-- It was created out of band and is not repo-managed; this migration
-- deliberately takes ownership of its grants and nothing else. If the
-- platform recreates the object or restores the grant, that is a platform
-- governance matter and this migration should be reconsidered rather than
-- re-applied in a loop.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is null then
    raise notice 'rls_auto_enable() is not present; nothing to revoke';
  else
    revoke execute on function public.rls_auto_enable() from public;
    revoke execute on function public.rls_auto_enable() from anon;
    revoke execute on function public.rls_auto_enable() from authenticated;
  end if;
end
$$;
