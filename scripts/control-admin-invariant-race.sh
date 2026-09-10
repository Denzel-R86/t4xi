#!/usr/bin/env bash
# T4XI Control Sprint 2A — concurrency proof for the last-admin invariant.
#
# Two real backends race to remove the last two effective administrators. The
# advisory lock must make exactly one of them win, and the loser must roll back
# with its audit row, leaving at least one effective admin behind.
#
#   session 1: administrator A revokes B's control_admin, then holds the
#              transaction open briefly before committing
#   session 2: administrator B suspends A
#
# Neither is a self-mutation, so both are legitimate on their own. Together they
# would end at zero administrators, which is the state that must be impossible.
#
# Unlike the read-only probes this script COMMITS its setup, because two
# sessions cannot see each other's uncommitted rows. It cleans up afterwards and
# reports whatever it could not remove. Run it against staging only.
#
#   usage: STAGING_DB_URL='postgresql://...' scripts/control-admin-invariant-race.sh
set -uo pipefail

DB_URL="${STAGING_DB_URL:-${1:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "STOP: set STAGING_DB_URL (or pass the connection string as argument 1)." >&2
  exit 2
fi
if [[ "$DB_URL" == *ajdsiklxfmmgisdvarhv* ]]; then
  echo "STOP: that is the production project. This script is for staging only." >&2
  exit 2
fi

run() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=0 -t -A -c "$1" 2>&1; }

echo "── precondition ────────────────────────────────────────────────"
COUNT=$(run "select count(*) from auth.users;")
if [[ "${COUNT:-0}" -lt 2 ]]; then
  echo "STOP: two auth users are required, found ${COUNT}. Create a second test account in Supabase Auth first." >&2
  exit 2
fi

AUTH_A=$(run "select id from auth.users order by created_at limit 1;")
AUTH_B=$(run "select id from auth.users where id <> '$AUTH_A' order by created_at limit 1;")
echo "auth A: ${AUTH_A:0:8}…  auth B: ${AUTH_B:0:8}…"

echo "── setup: two effective administrators (committed) ─────────────"
run "
insert into public.control_identities (auth_user_id, display_name, email, status)
select id, 'Race A', lower(email), 'active' from auth.users where id = '$AUTH_A'
on conflict (auth_user_id) do update set status='active', disabled_at=null, updated_at=now();
insert into public.control_identities (auth_user_id, display_name, email, status)
select id, 'Race B', lower(email), 'active' from auth.users where id = '$AUTH_B'
on conflict (auth_user_id) do update set status='active', disabled_at=null, updated_at=now();
insert into public.control_identity_roles (identity_id, role_id, granted_by)
select i.id, r.id, i.id from public.control_identities i, public.control_roles r
 where i.auth_user_id in ('$AUTH_A','$AUTH_B') and r.role_key='control_admin'
on conflict (identity_id, role_id) do update set revoked_at=null, expires_at=null;
" >/dev/null

ID_A=$(run "select id from public.control_identities where auth_user_id='$AUTH_A';")
ID_B=$(run "select id from public.control_identities where auth_user_id='$AUTH_B';")
BEFORE=$(run "select public.control_effective_admin_count();")
echo "effective admins before: $BEFORE"
if [[ "${BEFORE:-0}" -lt 2 ]]; then
  echo "STOP: setup did not produce two effective admins." >&2
  exit 1
fi

echo "── race ────────────────────────────────────────────────────────"
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 > /tmp/t4xi-race-1.log 2>&1 <<SQL1 &
begin;
select set_config('request.jwt.claims', json_build_object('sub','$AUTH_A','role','authenticated')::text, true);
set local role authenticated;
select public.control_revoke_role('$ID_B', 'control_admin');
select pg_sleep(3);
commit;
SQL1
PID1=$!

sleep 1

START=$(date +%s%N)
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 > /tmp/t4xi-race-2.log 2>&1 <<SQL2
begin;
select set_config('request.jwt.claims', json_build_object('sub','$AUTH_B','role','authenticated')::text, true);
set local role authenticated;
select public.control_set_identity_status('$ID_A', 'suspended');
commit;
SQL2
RC2=$?
WAITED=$(( ($(date +%s%N) - START) / 1000000 ))

wait $PID1; RC1=$?

echo "session 1 (revoke B admin) exit=$RC1"
echo "session 2 (suspend A)      exit=$RC2, blocked ${WAITED}ms"
[[ $RC2 -ne 0 ]] && echo "session 2 refusal: $(grep -o 'control_[a-z_]*' /tmp/t4xi-race-2.log | head -1)"

echo "── verdict ─────────────────────────────────────────────────────"
AFTER=$(run "select public.control_effective_admin_count();")
AUDIT=$(run "select count(*) from public.control_audit_events where occurred_at > now() - interval '2 minutes' and action in ('identity.role_revoked','identity.status_changed');")
FAIL=0
if [[ $(( (RC1==0?1:0) + (RC2==0?1:0) )) -ne 1 ]]; then
  echo "FAIL: exactly one command had to commit"; FAIL=1
else
  echo "PASS: exactly one command committed"
fi
if [[ "$WAITED" -lt 1500 ]]; then
  echo "FAIL: session 2 did not visibly wait on the lock (${WAITED}ms)"; FAIL=1
else
  echo "PASS: session 2 waited ${WAITED}ms on the lock"
fi
if [[ "${AFTER:-0}" -lt 1 ]]; then
  echo "FAIL: no effective administrator left"; FAIL=1
else
  echo "PASS: $AFTER effective administrator(s) remain"
fi
echo "audit rows from this window: $AUDIT (expected 1, matching the committed mutation)"

echo "── teardown ────────────────────────────────────────────────────"
run "
delete from public.control_audit_events where actor_identity_id in ('$ID_A','$ID_B');
delete from public.control_identity_roles where identity_id in ('$ID_A','$ID_B');
delete from public.control_identities where id in ('$ID_A','$ID_B');
" >/dev/null
RESIDUE=$(run "select count(*) from public.control_identities where id in ('$ID_A','$ID_B');")
echo "residue: ${RESIDUE} identities"
[[ "${RESIDUE:-1}" -ne 0 ]] && { echo "FAIL: test residue left behind"; FAIL=1; }

BACKENDS=$(run "select count(*) from pg_stat_activity where state <> 'idle' and pid <> pg_backend_pid() and query like '%control_%';")
echo "test backends still active: $BACKENDS"

exit $FAIL
