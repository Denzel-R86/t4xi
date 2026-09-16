begin;

-- Private channel state. Ingress never changes the draft, booking link or state.
create table public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  waba_id text not null check (waba_id ~ '^[0-9]{1,32}$'),
  phone_number_id text not null check (phone_number_id ~ '^[0-9]{1,32}$'),
  wa_id text not null check (wa_id ~ '^[1-9][0-9]{6,14}$'),
  language text check (language in ('nl', 'en')),
  state text not null default 'active' check (state in ('active', 'handoff', 'closed')),
  booking_draft jsonb not null default '{}'::jsonb check (jsonb_typeof(booking_draft) = 'object'),
  linked_booking_id uuid references public.bookings(id),
  created_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  unique (waba_id, phone_number_id, wa_id)
);

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id),
  waba_id text not null,
  phone_number_id text not null,
  provider_message_id text not null check (length(provider_message_id) between 1 and 512),
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null check (message_type in ('text', 'unsupported')),
  text_body text check (length(text_body) <= 4096),
  processing_status text not null check (processing_status in ('stored', 'ignored')),
  provider_timestamp timestamptz not null,
  received_at timestamptz not null default now(),
  content_expires_at timestamptz not null default (now() + interval '7 days'),
  unique (waba_id, phone_number_id, provider_message_id)
);
create index whatsapp_messages_conversation_idx on public.whatsapp_messages (conversation_id, received_at);
create index whatsapp_messages_expiry_idx on public.whatsapp_messages (content_expires_at) where text_body is not null;

create table public.whatsapp_event_log (
  id uuid primary key default gen_random_uuid(),
  waba_id text not null,
  phone_number_id text not null,
  event_key text not null check (event_key ~ '^[a-f0-9]{64}$'),
  event_type text not null check (event_type in ('message', 'status', 'unsupported', 'invalid')),
  processing_result text not null check (processing_result in ('stored', 'ignored', 'rejected', 'duplicate')),
  reason text not null check (reason in ('text_received', 'unsupported_message', 'provider_status', 'unsupported_event', 'invalid_event', 'wrong_account')),
  message_id uuid references public.whatsapp_messages(id),
  received_at timestamptz not null default now(),
  processed_at timestamptz not null default now(),
  unique (waba_id, phone_number_id, event_key)
);

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_event_log enable row level security;
revoke all on public.whatsapp_conversations, public.whatsapp_messages, public.whatsapp_event_log from public, anon, authenticated, service_role;
grant select, insert, update on public.whatsapp_conversations, public.whatsapp_messages, public.whatsapp_event_log to service_role;

-- One transaction per signed, normalized batch. No HTTP acknowledgement before commit.
-- Invoker rights: only the server role has both EXECUTE and table access.
create function public.receive_whatsapp_events(p_waba_id text, p_phone_number_id text, p_events jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $function$
declare
  e jsonb;
  v_log uuid;
  v_conversation uuid;
  v_message uuid;
  v_stored integer := 0;
  v_ignored integer := 0;
  v_rejected integer := 0;
  v_duplicates integer := 0;
begin
  if p_waba_id is null or p_waba_id !~ '^[0-9]{1,32}$'
    or p_phone_number_id is null or p_phone_number_id !~ '^[0-9]{1,32}$'
    or p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'INVALID_WHATSAPP_BATCH';
  end if;
  if jsonb_array_length(p_events) not between 1 and 100 then raise exception 'INVALID_WHATSAPP_BATCH'; end if;

  -- Small MVP: serialize a business number's batches, not the whole application.
  -- This also prevents opposite-order batches from deadlocking on conversations.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_waba_id || ':' || p_phone_number_id, 0));
  for e in select value from pg_catalog.jsonb_array_elements(p_events) loop
    if jsonb_typeof(e) <> 'object' then raise exception 'INVALID_WHATSAPP_EVENT'; end if;
    v_log := null;
    insert into public.whatsapp_event_log (waba_id, phone_number_id, event_key, event_type, processing_result, reason)
    values (p_waba_id, p_phone_number_id, e->>'event_key', e->>'event_type', e->>'result', e->>'reason')
    on conflict (waba_id, phone_number_id, event_key) do nothing returning id into v_log;
    if v_log is null then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    -- Only supported text creates channel records. Statuses/unknown/invalid events are audit-only.
    if e->>'result' = 'stored' then
      if e->>'event_type' is distinct from 'message' or e->>'reason' is distinct from 'text_received'
        or e->>'message_type' is distinct from 'text'
        or coalesce(e->>'provider_message_id', '') !~ '^[A-Za-z0-9_:.=+/-]+$'
        or length(e->>'provider_message_id') not between 1 and 512
        or coalesce(e->>'wa_id', '') !~ '^[1-9][0-9]{6,14}$'
        or jsonb_typeof(e->'text_body') is distinct from 'string'
        or length(e->>'text_body') not between 1 and 4096
        or e->>'provider_timestamp' is null then
        raise exception 'INVALID_WHATSAPP_MESSAGE';
      end if;
      -- Provider-ID uniqueness remains authoritative even after fingerprint-key rotation.
      v_message := null;
      select id into v_message from public.whatsapp_messages
        where waba_id = p_waba_id and phone_number_id = p_phone_number_id
        and provider_message_id = e->>'provider_message_id';
      if v_message is not null then
        update public.whatsapp_event_log set processing_result = 'duplicate', message_id = v_message where id = v_log;
        v_duplicates := v_duplicates + 1;
        continue;
      end if;
      insert into public.whatsapp_conversations (waba_id, phone_number_id, wa_id)
        values (p_waba_id, p_phone_number_id, e->>'wa_id')
        on conflict (waba_id, phone_number_id, wa_id) do update set last_received_at = pg_catalog.now()
        returning id into v_conversation;
      insert into public.whatsapp_messages (
        conversation_id, waba_id, phone_number_id, provider_message_id, direction,
        message_type, text_body, processing_status, provider_timestamp
      ) values (
        v_conversation, p_waba_id, p_phone_number_id, e->>'provider_message_id', 'inbound',
        'text', e->>'text_body', 'stored', (e->>'provider_timestamp')::timestamptz
      ) returning id into v_message;
      update public.whatsapp_event_log set message_id = v_message where id = v_log;
      v_stored := v_stored + 1;
    elsif e->>'result' = 'ignored' then
      v_ignored := v_ignored + 1;
    elsif e->>'result' = 'rejected' then
      v_rejected := v_rejected + 1;
    else
      raise exception 'INVALID_WHATSAPP_RESULT';
    end if;
  end loop;
  return pg_catalog.jsonb_build_object('received', jsonb_array_length(p_events), 'stored', v_stored,
    'ignored', v_ignored, 'rejected', v_rejected, 'duplicates', v_duplicates);
end;
$function$;
revoke all on function public.receive_whatsapp_events(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.receive_whatsapp_events(text, text, jsonb) to service_role;

-- Explicit maintenance entrypoint. No scheduler or outbound worker is activated here.
-- Keep provider IDs/tombstones: purging content must not allow an old message to be processed again.
create function public.purge_whatsapp_expired_content()
returns integer language plpgsql security invoker set search_path = ''
as $function$
declare v_count integer;
begin
  update public.whatsapp_messages set text_body = null
    where content_expires_at <= pg_catalog.now() and text_body is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
revoke all on function public.purge_whatsapp_expired_content() from public, anon, authenticated;
grant execute on function public.purge_whatsapp_expired_content() to service_role;

commit;
