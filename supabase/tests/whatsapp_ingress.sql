-- Run inside the isolated test DB after the migration. Rolls back its own fixtures.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'ASSERTION: %', message; end if; end; $$;

-- No browser access, and no privileged definer bypass.
select pg_temp.assert_true(not has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE'), r || ' has access to ' || t)
from unnest(array['anon','authenticated']) r,
unnest(array['public.whatsapp_conversations','public.whatsapp_messages','public.whatsapp_event_log']) t;
select pg_temp.assert_true(not has_function_privilege(r, 'public.receive_whatsapp_events(text,text,jsonb)', 'EXECUTE'), r || ' has RPC execute')
from unnest(array['anon','authenticated']) r;
select pg_temp.assert_true(not has_function_privilege(r, 'public.purge_whatsapp_expired_content()', 'EXECUTE'), r || ' has purge execute')
from unnest(array['anon','authenticated']) r;
select pg_temp.assert_true(not has_table_privilege('service_role', t, 'DELETE'), 'unexpected server DELETE ' || t)
from unnest(array['public.whatsapp_conversations','public.whatsapp_messages','public.whatsapp_event_log']) t;
select pg_temp.assert_true(bool_and(relrowsecurity), 'RLS disabled') from pg_class where oid in
('public.whatsapp_conversations'::regclass,'public.whatsapp_messages'::regclass,'public.whatsapp_event_log'::regclass);
select pg_temp.assert_true(not prosecdef, 'ingress must use invoker rights') from pg_proc where oid = 'public.receive_whatsapp_events(text,text,jsonb)'::regprocedure;

-- Exercise permissions as real roles, not only inspecting catalog flags.
set local role anon;
do $$ begin
  begin perform * from public.whatsapp_messages; raise exception 'ANON_READ_ALLOWED'; exception when insufficient_privilege then null; end;
  begin perform public.receive_whatsapp_events('100','200','[]'); raise exception 'ANON_EXECUTE_ALLOWED'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin insert into public.whatsapp_conversations(waba_id,phone_number_id,wa_id) values ('100','200','31612345678'); raise exception 'AUTH_WRITE_ALLOWED'; exception when insufficient_privilege then null; end;
  begin perform public.receive_whatsapp_events('100','200','[]'); raise exception 'AUTH_EXECUTE_ALLOWED'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role service_role;
select public.receive_whatsapp_events('100','200', '[{"event_key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","event_type":"message","result":"stored","reason":"text_received","provider_message_id":"wamid.one","wa_id":"31612345678","message_type":"text","text_body":"hello","provider_timestamp":"2026-09-09T10:00:00Z"}]');
select public.receive_whatsapp_events('100','200', '[{"event_key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","event_type":"message","result":"stored","reason":"text_received","provider_message_id":"wamid.one","wa_id":"31699999999","message_type":"text","text_body":"changed replay","provider_timestamp":"2026-09-09T10:00:00Z"}]');
-- New fingerprint but same provider ID also must not create a second conversation/message.
select public.receive_whatsapp_events('100','200', '[{"event_key":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","event_type":"message","result":"stored","reason":"text_received","provider_message_id":"wamid.one","wa_id":"31699999999","message_type":"text","text_body":"changed replay","provider_timestamp":"2026-09-09T10:00:00Z"}]');
reset role;
select pg_temp.assert_true((select count(*) = 1 from public.whatsapp_messages), 'duplicate message');
select pg_temp.assert_true((select count(*) = 1 from public.whatsapp_conversations), 'duplicate created conversation');
select pg_temp.assert_true((select text_body = 'hello' from public.whatsapp_messages), 'replay overwrote text');
select pg_temp.assert_true((select count(*) = 2 from public.whatsapp_event_log), 'duplicate audit event');
select pg_temp.assert_true((select count(*) = 1 from public.whatsapp_event_log where processing_result='duplicate'), 'provider-ID replay not recognized');

-- Human/closed state and draft survive new message intake.
update public.whatsapp_conversations set state='handoff', booking_draft='{"pickup":"test"}';
set local role service_role;
select public.receive_whatsapp_events('100','200', '[{"event_key":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","event_type":"message","result":"stored","reason":"text_received","provider_message_id":"wamid.two","wa_id":"31612345678","message_type":"text","text_body":"next","provider_timestamp":"2026-09-09T10:00:01Z"}]');
select public.receive_whatsapp_events('100','200', '[{"event_key":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","event_type":"unsupported","result":"ignored","reason":"unsupported_event"},{"event_key":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","event_type":"invalid","result":"rejected","reason":"wrong_account"}]');
reset role;
select pg_temp.assert_true((select state='handoff' and booking_draft='{"pickup":"test"}' and linked_booking_id is null from public.whatsapp_conversations), 'handoff/draft/link mutated');
select pg_temp.assert_true((select count(*) = 2 from public.whatsapp_messages), 'ignored or rejected event created message');

-- A failure halfway through a batch rolls back the earlier message, conversation and audit.
do $$ declare before_messages integer; before_logs integer; before_conversations integer; begin
  select count(*) into before_messages from public.whatsapp_messages;
  select count(*) into before_logs from public.whatsapp_event_log;
  select count(*) into before_conversations from public.whatsapp_conversations;
  begin
    perform public.receive_whatsapp_events('100','200', '[{"event_key":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","event_type":"message","result":"stored","reason":"text_received","provider_message_id":"wamid.rollback","wa_id":"31622222222","message_type":"text","text_body":"rollback","provider_timestamp":"2026-09-09T10:00:00Z"},{"event_key":"BAD","event_type":"message","result":"stored","reason":"text_received"}]');
    raise exception 'BATCH_DID_NOT_FAIL';
  exception when check_violation then null;
  end;
  perform pg_temp.assert_true((select count(*)=before_messages from public.whatsapp_messages),'partial messages committed');
  perform pg_temp.assert_true((select count(*)=before_logs from public.whatsapp_event_log),'partial audit committed');
  perform pg_temp.assert_true((select count(*)=before_conversations from public.whatsapp_conversations),'partial conversation committed');
end $$;

-- A closed conversation stays closed when another new message arrives.
savepoint closed_case;
update public.whatsapp_conversations set state='closed';
set local role service_role;
select public.receive_whatsapp_events('100','200', '[{"event_key":"9999999999999999999999999999999999999999999999999999999999999999","event_type":"message","result":"stored","reason":"text_received","provider_message_id":"wamid.closed","wa_id":"31612345678","message_type":"text","text_body":"new after closed","provider_timestamp":"2026-09-09T10:00:02Z"}]');
reset role;
select pg_temp.assert_true((select state='closed' from public.whatsapp_conversations), 'closed state reopened');
rollback to closed_case;

-- Retention scrubs content, keeps dedup keys and does not touch recent content.
update public.whatsapp_messages set content_expires_at=now()-interval '1 second' where provider_message_id='wamid.one';
set local role service_role;
select public.purge_whatsapp_expired_content();
select public.purge_whatsapp_expired_content();
reset role;
select pg_temp.assert_true((select text_body is null from public.whatsapp_messages where provider_message_id='wamid.one'), 'expired content retained');
select pg_temp.assert_true((select text_body='next' from public.whatsapp_messages where provider_message_id='wamid.two'), 'recent content purged');
select pg_temp.assert_true((select count(*)=2 from public.whatsapp_messages), 'retention removed idempotency keys');
set local role service_role;
select public.receive_whatsapp_events('100','200', '[{"event_key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","event_type":"message","result":"stored","reason":"text_received","provider_message_id":"wamid.one","wa_id":"31612345678","message_type":"text","text_body":"replayed after purge","provider_timestamp":"2026-09-09T10:00:00Z"}]');
reset role;
select pg_temp.assert_true((select text_body is null from public.whatsapp_messages where provider_message_id='wamid.one'), 'replay rehydrated purged content');
rollback;
