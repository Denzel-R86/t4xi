begin;
-- Additive Gate 2 state. Gate 1 command identity, status constraints and RPCs remain intact.
create table public.whatsapp_execution (
 command_id uuid primary key references public.whatsapp_commands(id),
 phase text not null check(phase in ('claimed','executing','succeeded','retryable_failed','permanently_failed','reconciliation')),
 attempt_count integer not null check(attempt_count between 0 and 3),
 token uuid, lease_until timestamptz, next_attempt_at timestamptz,
 result jsonb, reason text,
 check(phase not in ('claimed','executing') or (token is not null and lease_until is not null))
);
create table public.whatsapp_execution_attempts (
 command_id uuid not null references public.whatsapp_commands(id),
 attempt integer not null check(attempt between 1 and 3),
 token uuid not null unique,
 phase text not null,
 claimed_at timestamptz not null default clock_timestamp(),
 effect_started_at timestamptz, finished_at timestamptz,
 primary key(command_id,attempt)
);
create table public.whatsapp_execution_audit (
 id uuid primary key default gen_random_uuid(),
 command_id uuid not null references public.whatsapp_commands(id),
 attempt integer not null, token uuid,
 event text not null, created_at timestamptz not null default clock_timestamp()
);
create index whatsapp_execution_due on public.whatsapp_execution(lease_until) where phase in ('claimed','executing');
create index whatsapp_execution_audit_command on public.whatsapp_execution_audit(command_id);
alter table public.whatsapp_execution enable row level security;
alter table public.whatsapp_execution_attempts enable row level security;
alter table public.whatsapp_execution_audit enable row level security;
revoke all on public.whatsapp_execution,public.whatsapp_execution_attempts,public.whatsapp_execution_audit from public,anon,authenticated,service_role;
grant select,insert,update on public.whatsapp_execution,public.whatsapp_execution_attempts to service_role;
grant select,insert on public.whatsapp_execution_audit to service_role;

-- Previously claimed rows have no evidence that an effect did NOT happen.
-- Preserve their IDs, payloads, processing and prior audits; conservatively block all kinds.
do $$
declare o public.whatsapp_commands; c public.whatsapp_conversations;
begin
 for o in select * from public.whatsapp_commands where status in ('claimed','reconciliation') order by conversation_id,id loop
  insert into public.whatsapp_execution(command_id,phase,attempt_count,token,reason)
   values(o.id,'reconciliation',0,o.claim_token,'legacy_execution_unknown');
  insert into public.whatsapp_execution_audit(command_id,attempt,token,event) values(o.id,0,o.claim_token,'legacy_execution_unknown');
  if o.status='claimed' then
   select * into c from public.whatsapp_conversations where id=o.conversation_id for update;
   update public.whatsapp_commands set status='reconciliation' where id=o.id;
   update public.whatsapp_conversations set state='handoff',version=c.version+1,
    flow=case when flow is null then null else flow || jsonb_build_object('state','handoff','version',c.version+1,'confirmationHash',null) end where id=c.id;
   insert into public.whatsapp_transition_audit(conversation_id,command_id,version_before,version_after,state_before,state_after,reason)
    values(c.id,o.id,c.version,c.version+1,coalesce(c.flow->>'state',c.state),'handoff','legacy_execution_unknown');
  end if;
 end loop;
end $$;

create function public.claim_whatsapp_execution(p_command uuid,p_token uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare o public.whatsapp_commands; x public.whatsapp_execution; a integer;
begin
 if p_token is null then raise exception 'INVALID_TOKEN'; end if;
 select * into o from public.whatsapp_commands where id=p_command for update;
 if not found or o.status<>'pending' or o.kind not in ('request_quote','request_booking') then return null; end if;
 select * into x from public.whatsapp_execution where command_id=o.id for update;
 if found and (x.phase<>'retryable_failed' or x.next_attempt_at>clock_timestamp() or x.attempt_count>=3) then return null; end if;
 a:=coalesce(x.attempt_count,0)+1;
 update public.whatsapp_commands set status='claimed',claim_token=p_token,claimed_at=clock_timestamp() where id=o.id;
 insert into public.whatsapp_execution(command_id,phase,attempt_count,token,lease_until)
 values(o.id,'claimed',a,p_token,clock_timestamp()+interval '30 seconds')
 on conflict(command_id) do update set phase='claimed',attempt_count=a,token=p_token,lease_until=clock_timestamp()+interval '30 seconds',next_attempt_at=null,reason=null;
 insert into public.whatsapp_execution_attempts(command_id,attempt,token,phase) values(o.id,a,p_token,'claimed');
 insert into public.whatsapp_execution_audit(command_id,attempt,token,event) values(o.id,a,p_token,'claimed');
 return to_jsonb(o) || jsonb_build_object('claim_token',p_token,'attempt',a);
end $$;

-- Must commit successfully before the adapter is allowed to attempt any effect.
create function public.begin_whatsapp_effect(p_command uuid,p_token uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare x public.whatsapp_execution; o public.whatsapp_commands; c public.whatsapp_conversations;
begin
 select * into o from public.whatsapp_commands where id=p_command;
 if not found then return false; end if;
 select * into c from public.whatsapp_conversations where id=o.conversation_id for update;
 select * into o from public.whatsapp_commands where id=p_command for update;
 if o.status<>'claimed' or o.claim_token is distinct from p_token then return false; end if;
 if (o.kind='request_booking' and (c.flow->>'state' is distinct from 'booking_requested'
  or c.flow->>'commandId' is distinct from o.payload->>'commandId'
  or coalesce((c.flow->'quote'->>'expiresAt')::timestamptz,'-infinity')<=clock_timestamp()))
  or (o.kind='request_quote' and (c.flow->>'state' is distinct from 'ready_for_quote'
   or c.flow->>'draftRevision' is distinct from o.payload->>'draftRevision')) then
  perform public.fail_whatsapp_execution(p_command,p_token,'permanent_pre_effect');
  return false;
 end if;
 update public.whatsapp_execution set phase='executing' where command_id=p_command and token=p_token and phase='claimed' and lease_until>clock_timestamp() returning * into x;
 if not found then return false; end if;
 update public.whatsapp_execution_attempts set phase='executing',effect_started_at=clock_timestamp() where command_id=p_command and token=p_token;
 insert into public.whatsapp_execution_audit(command_id,attempt,token,event) values(p_command,x.attempt_count,p_token,'effect_may_start');
 return true;
end $$;

create function public.fail_whatsapp_execution(p_command uuid,p_token uuid,p_failure text) returns text
language plpgsql security invoker set search_path='' as $$
declare o public.whatsapp_commands; c public.whatsapp_conversations; x public.whatsapp_execution; v_phase text;
begin
 if p_failure is null or p_failure not in ('transient_pre_effect','permanent_pre_effect','unknown','recover') then raise exception 'INVALID_FAILURE'; end if;
 select * into o from public.whatsapp_commands where id=p_command;
 if not found then return 'stale'; end if;
 select * into c from public.whatsapp_conversations where id=o.conversation_id for update;
 select * into o from public.whatsapp_commands where id=p_command for update;
 select * into x from public.whatsapp_execution where command_id=p_command for update;
 if not found or x.token is distinct from p_token or o.claim_token is distinct from p_token or o.status<>'claimed' or x.phase not in ('claimed','executing') then return 'stale'; end if;
 if p_failure='recover' then
  if x.lease_until>clock_timestamp() then return 'active'; end if;
  p_failure:=case when x.phase='claimed' then 'transient_pre_effect' else 'unknown' end;
 end if;
 v_phase:=case when p_failure='unknown' then 'reconciliation' when p_failure='permanent_pre_effect' or x.attempt_count>=3 then 'permanently_failed' else 'retryable_failed' end;
 update public.whatsapp_execution set phase=v_phase,lease_until=null,
 next_attempt_at=case when v_phase='retryable_failed' then clock_timestamp()+make_interval(secs=>power(2,x.attempt_count-1)::integer) else null end,
 reason=case when p_failure='transient_pre_effect' and x.attempt_count>=3 then 'retry_budget_exhausted' else p_failure end where command_id=p_command;
 update public.whatsapp_execution_attempts set phase=v_phase,finished_at=clock_timestamp() where command_id=p_command and token=p_token;
 if v_phase='retryable_failed' then
  update public.whatsapp_commands set status='pending',claim_token=null,claimed_at=null where id=p_command;
 else
  if v_phase='reconciliation' then update public.whatsapp_commands set status='reconciliation' where id=p_command; end if;
  update public.whatsapp_conversations set version=c.version+1,state='handoff',
   flow=case when flow is null then null else flow || jsonb_build_object('state','handoff','version',c.version+1,'confirmationHash',null) end where id=c.id;
  insert into public.whatsapp_transition_audit(conversation_id,command_id,version_before,version_after,state_before,state_after,reason)
   values(c.id,p_command,c.version,c.version+1,coalesce(c.flow->>'state',c.state),'handoff',v_phase);
 end if;
 insert into public.whatsapp_execution_audit(command_id,attempt,token,event)
 values(p_command,x.attempt_count,p_token,case when p_failure='transient_pre_effect' and x.attempt_count>=3 then 'retry_budget_exhausted' else v_phase||':'||p_failure end);
 return v_phase;
end $$;

create function public.load_whatsapp_execution(p_command uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('command',to_jsonb(o),'execution',to_jsonb(x),'conversation',to_jsonb(c))
 from public.whatsapp_commands o join public.whatsapp_conversations c on c.id=o.conversation_id
 left join public.whatsapp_execution x on x.command_id=o.id where o.id=p_command;
$$;

create function public.finish_whatsapp_execution(p_command uuid,p_token uuid,p_result jsonb,p_version bigint,p_decision jsonb) returns text
language plpgsql security invoker set search_path='' as $$
declare o public.whatsapp_commands; c public.whatsapp_conversations; x public.whatsapp_execution; n jsonb; a boolean; e jsonb; i integer;
begin
 select * into o from public.whatsapp_commands where id=p_command;
 if not found then return 'stale'; end if;
 select * into c from public.whatsapp_conversations where id=o.conversation_id for update;
 select * into o from public.whatsapp_commands where id=p_command for update;
 select * into x from public.whatsapp_execution where command_id=p_command for update;
 if not found or o.status<>'claimed' or o.claim_token is distinct from p_token or x.token is distinct from p_token or x.phase<>'executing' then return 'stale'; end if;
 if x.lease_until<=clock_timestamp() then return 'expired'; end if;
 if c.version is distinct from p_version then return 'conflict'; end if;
 n:=p_decision->'conversation'; a:=(p_decision->>'accepted')::boolean;
 if a is null or n->>'id' is distinct from c.id::text or n->'owner' is distinct from c.flow->'owner'
  or (n->>'version')::bigint is distinct from (c.version+case when a then 1 else 0 end)
  or jsonb_typeof(p_decision->'effects') is distinct from 'array' or jsonb_typeof(p_result) is distinct from 'object'
  or (not a and (n<>c.flow or jsonb_array_length(p_decision->'effects')<>0)) then raise exception 'INVALID_RESULT_DECISION'; end if;
 -- Only presentation follow-ups. The result path can never create a booking request.
 for e in select value from jsonb_array_elements(p_decision->'effects') loop
  if e->>'type' is null or e->>'type' not in ('show_quote','show_booking') then raise exception 'INVALID_RESULT_EFFECT'; end if;
 end loop;
 if a then
  update public.whatsapp_conversations set version=c.version+1,flow=n,booking_draft=n->'draft',
   state=case when n->>'state'='handoff' then 'handoff' when n->>'state' in ('completed','cancelled','expired') then 'closed' else 'active' end where id=c.id and version=p_version;
 end if;
 update public.whatsapp_execution set phase='succeeded',lease_until=null,result=p_result,reason=p_decision->>'reason' where command_id=p_command;
 update public.whatsapp_execution_attempts set phase='succeeded',finished_at=clock_timestamp() where command_id=p_command and token=p_token;
 insert into public.whatsapp_transition_audit(conversation_id,command_id,version_before,version_after,state_before,state_after,reason)
 values(c.id,p_command,c.version,(n->>'version')::bigint,c.flow->>'state',n->>'state',p_decision->>'reason');
 select coalesce(max(ordinal),-1)+1 into i from public.whatsapp_commands where message_id=o.message_id;
 for e in select value from jsonb_array_elements(p_decision->'effects') loop
  insert into public.whatsapp_commands(message_id,conversation_id,ordinal,kind,payload) values(o.message_id,c.id,i,e->>'type',e); i:=i+1;
 end loop;
 insert into public.whatsapp_execution_audit(command_id,attempt,token,event) values(p_command,x.attempt_count,p_token,'succeeded');
 return 'succeeded';
end $$;

revoke all on function public.claim_whatsapp_execution(uuid,uuid),public.begin_whatsapp_effect(uuid,uuid),public.fail_whatsapp_execution(uuid,uuid,text),public.load_whatsapp_execution(uuid),public.finish_whatsapp_execution(uuid,uuid,jsonb,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.claim_whatsapp_execution(uuid,uuid),public.begin_whatsapp_effect(uuid,uuid),public.fail_whatsapp_execution(uuid,uuid,text),public.load_whatsapp_execution(uuid),public.finish_whatsapp_execution(uuid,uuid,jsonb,bigint,jsonb) to service_role;
-- Recovery discovers stale durable work itself; old Gate 1 callers cannot create a retry loophole.
create function public.recover_whatsapp_execution(p_command uuid) returns text
language plpgsql security invoker set search_path='' as $$
declare o public.whatsapp_commands; c public.whatsapp_conversations; x public.whatsapp_execution;
begin
 select * into o from public.whatsapp_commands where id=p_command;
 if not found then return 'stale'; end if;
 select * into c from public.whatsapp_conversations where id=o.conversation_id for update;
 select * into o from public.whatsapp_commands where id=p_command for update;
 select * into x from public.whatsapp_execution where command_id=p_command for update;
 if found and x.token is not distinct from o.claim_token then return public.fail_whatsapp_execution(p_command,x.token,'recover'); end if;
 if o.status<>'claimed' then return 'stale'; end if;
 insert into public.whatsapp_execution(command_id,phase,attempt_count,token,reason) values(o.id,'reconciliation',coalesce(x.attempt_count,0),o.claim_token,'legacy_execution_unknown')
 on conflict(command_id) do update set phase='reconciliation',token=o.claim_token,lease_until=null,next_attempt_at=null,reason='legacy_execution_unknown';
 update public.whatsapp_commands set status='reconciliation' where id=o.id;
 update public.whatsapp_conversations set state='handoff',version=c.version+1,
 flow=case when flow is null then null else flow || jsonb_build_object('state','handoff','version',c.version+1,'confirmationHash',null) end where id=c.id;
 insert into public.whatsapp_transition_audit(conversation_id,command_id,version_before,version_after,state_before,state_after,reason)
 values(c.id,o.id,c.version,c.version+1,coalesce(c.flow->>'state',c.state),'handoff','legacy_execution_unknown');
 insert into public.whatsapp_execution_audit(command_id,attempt,token,event) values(o.id,0,o.claim_token,'legacy_execution_unknown');
 return 'reconciliation';
end $$;
create function public.due_whatsapp_recovery() returns jsonb
language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(id),'[]'::jsonb) from (
 select o.id from public.whatsapp_commands o left join public.whatsapp_execution x on x.command_id=o.id
 where o.status='claimed' and (x.command_id is null or x.token is distinct from o.claim_token or (x.phase in ('claimed','executing') and x.lease_until<=clock_timestamp()))
 order by o.id limit 100) due;
$$;
revoke all on function public.recover_whatsapp_execution(uuid),public.due_whatsapp_recovery() from public,anon,authenticated;
grant execute on function public.recover_whatsapp_execution(uuid),public.due_whatsapp_recovery() to service_role;
commit;
