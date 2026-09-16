begin;
-- Gate 1 only: durable decisions and fenced claims, no command execution.
alter table public.whatsapp_conversations add column version bigint not null default 0 check(version >= 0),
  add column flow jsonb check(flow is null or jsonb_typeof(flow)='object');
create table public.whatsapp_processing (
  message_id uuid primary key references public.whatsapp_messages(id),
  conversation_id uuid not null references public.whatsapp_conversations(id),
  version_before bigint not null, version_after bigint not null,
  accepted boolean not null, reason text not null,
  check(version_after = version_before + case when accepted then 1 else 0 end)
);
create index whatsapp_processing_conversation on public.whatsapp_processing(conversation_id);
create table public.whatsapp_transition_audit (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id),
  message_id uuid unique references public.whatsapp_processing(message_id),
  command_id uuid,
  version_before bigint not null, version_after bigint not null,
  state_before text not null, state_after text not null, reason text not null,
  created_at timestamptz not null default now()
);
create index whatsapp_transition_audit_conversation on public.whatsapp_transition_audit(conversation_id);
create table public.whatsapp_commands (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.whatsapp_processing(message_id),
  conversation_id uuid not null references public.whatsapp_conversations(id),
  ordinal integer not null check(ordinal >= 0),
  kind text not null check(kind in ('request_quote','show_quote','request_booking','show_booking','handoff')),
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  status text not null default 'pending' check(status in ('pending','claimed','reconciliation')),
  claim_token uuid, claimed_at timestamptz,
  unique(message_id,ordinal),
  check((status='pending' and claim_token is null and claimed_at is null) or
        (status in ('claimed','reconciliation') and claim_token is not null and claimed_at is not null))
);
create unique index whatsapp_booking_command_key on public.whatsapp_commands((payload->>'commandId')) where kind='request_booking';
create index whatsapp_commands_conversation on public.whatsapp_commands(conversation_id);
create index whatsapp_commands_pending on public.whatsapp_commands(id) where status='pending';
alter table public.whatsapp_transition_audit add foreign key(command_id) references public.whatsapp_commands(id);
create unique index whatsapp_reconciliation_audit on public.whatsapp_transition_audit(command_id) where command_id is not null;
alter table public.whatsapp_processing enable row level security;
alter table public.whatsapp_transition_audit enable row level security;
alter table public.whatsapp_commands enable row level security;
revoke all on public.whatsapp_processing,public.whatsapp_transition_audit,public.whatsapp_commands from public,anon,authenticated,service_role;
grant select,insert on public.whatsapp_processing,public.whatsapp_transition_audit to service_role;
grant select,insert,update on public.whatsapp_commands to service_role;

create function public.load_whatsapp_processing(p_message uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('message',to_jsonb(m),'conversation',to_jsonb(c),'processed',exists(select from public.whatsapp_processing p where p.message_id=m.id))
 from public.whatsapp_messages m join public.whatsapp_conversations c on c.id=m.conversation_id
 where m.id=p_message and m.direction='inbound' and m.processing_status='stored';
$$;

create function public.commit_whatsapp_processing(p_message uuid,p_version bigint,p_decision jsonb) returns text
language plpgsql security invoker set search_path='' as $$
declare c public.whatsapp_conversations; m public.whatsapp_messages; n jsonb; e jsonb; a boolean; i integer:=0; v bigint;
begin
 select * into m from public.whatsapp_messages where id=p_message and direction='inbound' and processing_status='stored';
 if not found then raise exception 'INVALID_INBOUND'; end if;
 -- The row lock serializes the commit only. Computation was optimistic against p_version.
 select * into c from public.whatsapp_conversations where id=m.conversation_id for update;
 if exists(select from public.whatsapp_processing where message_id=p_message) then return 'duplicate'; end if;
 if c.version<>p_version then return 'conflict'; end if;
 n:=p_decision->'conversation'; a:=(p_decision->>'accepted')::boolean;
 if a is null or jsonb_typeof(p_decision->'effects') is distinct from 'array'
   or jsonb_array_length(p_decision->'effects')>8 or n->>'id' is distinct from c.id::text
   or n->'owner' is distinct from jsonb_build_object('wabaId',c.waba_id,'phoneNumberId',c.phone_number_id,'waId',c.wa_id)
   or jsonb_typeof(n->'draft') is distinct from 'object'
   or n->>'state' is null or n->>'state' not in ('collecting_booking','ready_for_quote','awaiting_confirmation','booking_requested','completed','handoff','cancelled','expired')
   or length(coalesce(p_decision->>'reason','')) not between 1 and 80 then raise exception 'INVALID_DECISION'; end if;
 v:=p_version+case when a then 1 else 0 end;
 if (n->>'version')::bigint is distinct from v then raise exception 'INVALID_VERSION'; end if;
 if not a and (jsonb_array_length(p_decision->'effects')<>0 or (c.flow is not null and c.flow<>n)) then raise exception 'INVALID_NOOP'; end if;
 if a then
   update public.whatsapp_conversations set version=v,flow=n,booking_draft=n->'draft',
    state=case when n->>'state'='handoff' then 'handoff' when n->>'state' in ('completed','cancelled','expired') then 'closed' else 'active' end
    where id=c.id and version=p_version;
   if not found then raise exception 'CAS_LOST'; end if;
 end if;
 insert into public.whatsapp_processing values(p_message,c.id,p_version,v,a,p_decision->>'reason');
 insert into public.whatsapp_transition_audit(conversation_id,message_id,version_before,version_after,state_before,state_after,reason)
 values(c.id,p_message,p_version,v,coalesce(c.flow->>'state','collecting_booking'),n->>'state',p_decision->>'reason');
 for e in select value from jsonb_array_elements(p_decision->'effects') loop
   if e->>'type'='request_booking' and (c.flow->>'state' is distinct from 'awaiting_confirmation' or c.flow->'quote' is distinct from n->'quote' or nullif(e->>'commandId','') is null or nullif(e->>'quoteId','') is null or nullif(n->'quote'->>'expiresAt','') is null or n->>'state'<>'booking_requested' or e->>'commandId' is distinct from n->>'commandId'
      or e->>'quoteId' is distinct from n->'quote'->>'quoteId' or (n->'quote'->>'draftRevision')::bigint is distinct from (n->>'draftRevision')::bigint
      or (n->'quote'->>'expiresAt')::timestamptz <= clock_timestamp()) then raise exception 'INVALID_BOOKING_COMMAND'; end if;
   insert into public.whatsapp_commands(message_id,conversation_id,ordinal,kind,payload) values(p_message,c.id,i,e->>'type',e);
   i:=i+1;
 end loop;
 return 'committed';
end $$;

-- Claim by ID is deliberately one-shot: no timeout requeue and no domain invocation.
create function public.claim_whatsapp_command(p_command uuid,p_token uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if p_token is null then raise exception 'INVALID_CLAIM'; end if;
 update public.whatsapp_commands set status='claimed',claim_token=p_token,claimed_at=clock_timestamp()
 where id=p_command and status='pending';
 return found;
end $$;

-- Explicit uncertainty signal; even the original claimant cannot requeue/rebook.
create function public.reconcile_whatsapp_command(p_command uuid,p_token uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare cmd public.whatsapp_commands; c public.whatsapp_conversations; n jsonb;
begin
 select * into cmd from public.whatsapp_commands where id=p_command;
 if not found then return false; end if;
 select * into c from public.whatsapp_conversations where id=cmd.conversation_id for update;
 select * into cmd from public.whatsapp_commands where id=p_command for update;
 if cmd.kind<>'request_booking' or cmd.claim_token is distinct from p_token or cmd.status<>'claimed' then return false; end if;
 if c.flow->>'commandId' is distinct from cmd.payload->>'commandId' then raise exception 'COMMAND_STATE_MISMATCH'; end if;
 n:=c.flow || jsonb_build_object('state','handoff','version',c.version+1,'confirmationHash',null);
 update public.whatsapp_conversations set version=c.version+1,flow=n,state='handoff' where id=c.id and version=c.version;
 update public.whatsapp_commands set status='reconciliation' where id=p_command;
 insert into public.whatsapp_transition_audit(conversation_id,command_id,version_before,version_after,state_before,state_after,reason)
 values(c.id,p_command,c.version,c.version+1,c.flow->>'state','handoff','booking_outcome_unknown');
 return true;
end $$;
revoke all on function public.load_whatsapp_processing(uuid), public.commit_whatsapp_processing(uuid,bigint,jsonb),public.claim_whatsapp_command(uuid,uuid),public.reconcile_whatsapp_command(uuid,uuid) from public,anon,authenticated;
grant execute on function public.load_whatsapp_processing(uuid), public.commit_whatsapp_processing(uuid,bigint,jsonb),public.claim_whatsapp_command(uuid,uuid),public.reconcile_whatsapp_command(uuid,uuid) to service_role;
commit;
