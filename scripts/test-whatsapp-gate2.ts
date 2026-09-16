import assert from 'node:assert/strict';
import { fork, execFileSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Session } from './whatsapp-test/session';
import { newConversation, applyCustomerAction, acceptDomainQuote, newConfirmationToken, type CustomerAction } from '../lib/whatsapp/conversation';
import { processInbound, type ProcessingInput } from '../lib/whatsapp/processor';
import { rpcWorkerStore } from '../lib/whatsapp/worker-store';
import { recoverMockCommand, recoverDueMockCommands } from '../lib/whatsapp/worker';
const container='t4xi-whatsapp-gate2', db=`gate2_${process.pid}`;
const lit=(s:string)=>"'"+s.replace(/'/g,"''")+"'";
const json=(v:unknown)=>lit(JSON.stringify(v))+'::jsonb';
async function main() {
 assert.equal(JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0].HostConfig.NetworkMode,'none');
 const boot=new Session('postgres'); await boot.query(`create database ${db};`);boot.close();
 const sessions:Session[]=[]; const children:ChildProcess[]=[];
 async function connect(name:string,role=false){const s=new Session(db);sessions.push(s);await s.query(`set application_name=${lit(name)};set statement_timeout='30s';${role?'set role service_role;':''}`);return s;}
 const admin=await connect('gate2-observer');
 await admin.query("do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; end if; end $$;");
 const server=await connect('gate2-server',true);
 // Role setup must precede SET ROLE on a fresh cluster (server is created below after setup).
 async function snapshot(id:string) {return JSON.parse(await admin.query(`select jsonb_build_object(
 'conversation',(select to_jsonb(c) from public.whatsapp_conversations c where id=${lit(id)}),
 'processing',coalesce((select jsonb_agg(to_jsonb(p) order by message_id) from public.whatsapp_processing p where conversation_id=${lit(id)}),'[]'),
 'transition_audit',coalesce((select jsonb_agg(to_jsonb(a) order by version_after,id) from public.whatsapp_transition_audit a where conversation_id=${lit(id)}),'[]'),
 'commands',coalesce((select jsonb_agg(to_jsonb(o) order by ordinal) from public.whatsapp_commands o where conversation_id=${lit(id)}),'[]'),
 'execution',coalesce((select jsonb_agg(to_jsonb(x) order by command_id) from public.whatsapp_execution x join public.whatsapp_commands o on o.id=x.command_id where o.conversation_id=${lit(id)}),'[]'),
 'attempts',coalesce((select jsonb_agg(to_jsonb(x) order by command_id,attempt) from public.whatsapp_execution_attempts x join public.whatsapp_commands o on o.id=x.command_id where o.conversation_id=${lit(id)}),'[]'),
 'worker_audit',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from public.whatsapp_execution_audit x join public.whatsapp_commands o on o.id=x.command_id where o.conversation_id=${lit(id)}),'[]'),
 'external_effects',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.fake_effects x join public.whatsapp_commands o on o.id=x.command_id where o.conversation_id=${lit(id)}),'[]'));`));}
 const evidence:unknown[]=[];
 try {
 await admin.query(`create table public.bookings(id uuid primary key); alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
 for(const f of ['20260909114512_whatsapp_ingress.sql','20260910080812_whatsapp_transactional_processing.sql']) await admin.query(readFileSync('supabase/migrations/'+f,'utf8'));
 await admin.query(`create table public.fake_effects(id bigint generated always as identity primary key,command_id uuid not null,kind text not null,attempt integer not null);`);
 let sender=31620000000;
 const processorStore={async load(id:string){return JSON.parse(await server.query(`select public.load_whatsapp_processing(${lit(id)});`)) as ProcessingInput;},async commit(id:string,v:number,d:unknown){return await server.query(`select public.commit_whatsapp_processing(${lit(id)},${v},${json(d)});`) as 'committed'|'conflict'|'duplicate';}};
 async function fixture(kind='booking') {
  const id=randomUUID(),message=randomUUID();const owner={wabaId:'100',phoneNumberId:'200',waId:String(++sender)};const now=new Date();let c=newConversation(id,owner);
  const fields={pickup:'Amsterdam',dropoff:'Utrecht',date:'2099-09-12',time:'12:00',persons:2,luggage:'handbagage',rideType:'enkel',customerName:'Fake Test',customerEmail:'fake@example.com'};
  let action:CustomerAction={type:'propose_fields',fields};
  if(kind==='booking') {c=applyCustomerAction(c,{eventId:'setup',expectedVersion:0,now},owner,action).conversation;const token=newConfirmationToken();c=acceptDomainQuote(c,{eventId:'setup-quote',expectedVersion:1,now},{quoteId:'fixture-'+id,totalCents:12345,currency:'EUR',expiresAt:new Date(Date.now()+3600000).toISOString(),draftRevision:1,outboundFlightRequired:false,returnFlightRequired:false},token).conversation;action={type:'confirm',token};}
  await admin.query(`insert into public.whatsapp_conversations(id,waba_id,phone_number_id,wa_id,version,flow,booking_draft) values(${lit(id)},'100','200',${lit(owner.waId)},${c.version},${json(c)},${json(c.draft)});
  insert into public.whatsapp_messages(id,conversation_id,waba_id,phone_number_id,provider_message_id,direction,message_type,text_body,processing_status,provider_timestamp) values(${lit(message)},${lit(id)},'100','200',${lit('wamid.'+message)},'inbound','text',${lit(JSON.stringify(action))},'stored',now());`);
  await processInbound(processorStore,message,m=>JSON.parse(m.text_body!) as CustomerAction);
  const command=await admin.query(`select id from public.whatsapp_commands where message_id=${lit(message)};`);return {id,command,message};
 }
 const legacyPending=await fixture();const legacyClaimed=await fixture();const legacyRecon=await fixture();
 for(const f of [legacyClaimed,legacyRecon]) await server.query(`select public.claim_whatsapp_command(${lit(f.command)},${lit(randomUUID())});`);
 const oldToken=await admin.query(`select claim_token from public.whatsapp_commands where id=${lit(legacyRecon.command)};`);
 await server.query(`select public.reconcile_whatsapp_command(${lit(legacyRecon.command)},${lit(oldToken)});`);
 const beforeMigration=JSON.parse(await admin.query(`select jsonb_build_object('commands',(select jsonb_agg(to_jsonb(o) order by id) from public.whatsapp_commands o),'processing',(select jsonb_agg(to_jsonb(p) order by message_id) from public.whatsapp_processing p),'audit',(select jsonb_agg(to_jsonb(a) order by id) from public.whatsapp_transition_audit a));`));
 await admin.query(readFileSync('supabase/migrations/20260910125036_whatsapp_worker_execution.sql','utf8'));
 const pendingAfter=await snapshot(legacyPending.id),claimedAfter=await snapshot(legacyClaimed.id),reconAfter=await snapshot(legacyRecon.id);
 assert.equal(pendingAfter.commands[0].status,'pending');assert.equal(claimedAfter.commands[0].status,'reconciliation');assert.equal(claimedAfter.conversation.flow.state,'handoff');assert.equal(claimedAfter.execution[0].attempt_count,0);
 for(const old of beforeMigration.commands){const current=JSON.parse(await admin.query(`select to_jsonb(o) from public.whatsapp_commands o where id=${lit(old.id)};`));for(const key of ['id','payload','message_id','conversation_id','claim_token','claimed_at']) assert.deepEqual(current[key],old[key]);}
 for(const old of beforeMigration.processing) assert.deepEqual(JSON.parse(await admin.query(`select to_jsonb(p) from public.whatsapp_processing p where message_id=${lit(old.message_id)};`)),old);
 for(const old of beforeMigration.audit) assert.deepEqual(JSON.parse(await admin.query(`select to_jsonb(a) from public.whatsapp_transition_audit a where id=${lit(old.id)};`)),old);
 evidence.push({name:'migration compatibility',before:beforeMigration,expected:'pending preserved; legacy claimed quarantined; prior IDs/payloads/processing/audits retained',actual:{pendingAfter,claimedAfter,reconAfter},result:'PASS'});
 const store=rpcWorkerStore(async(name,args)=>{const values=Object.values(args).map(v=>typeof v==='object'?json(v):lit(String(v))).join(',');return JSON.parse(await server.query(`select coalesce(to_jsonb(public.${name}(${values})),'null'::jsonb);`));});
 let serial=0;
 function start(command:string,mode='success',label='gate2-child-'+(++serial)) {
  const child=fork('scripts/whatsapp-test/worker-child.ts',[db,command,mode,label],{execArgv:['--import','tsx'],stdio:['ignore','pipe','pipe','ipc']});children.push(child);
  const messages:Record<string,string>[]=[];let stderr='';child.stderr?.on('data',c=>stderr+=c.toString());child.on('message',m=>messages.push(m as Record<string,string>));
  const exited=new Promise<{code:number|null;signal:string|null}>(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  return {child,label,exited,messages,async wait(key:string){for(let i=0;i<500;i++){const m=messages.find(m=>key in m);if(m)return m[key];const error=messages.find(m=>'error'in m);if(error)throw new Error(error.error);if(child.exitCode!==null||child.signalCode)throw new Error('worker exited '+stderr);await new Promise(r=>setTimeout(r,20));}throw new Error('worker timeout '+label+' '+stderr);}};
 }
 async function run(command:string,mode='success'){const w=start(command,mode);const result=await w.wait('done');assert.equal((await w.exited).code,0);return result;}
 async function kill(w:ReturnType<typeof start>){w.child.kill('SIGKILL');const exit=await w.exited;assert.equal(exit.signal,'SIGKILL');await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where application_name in (${lit(w.label)},${lit(w.label+'-fake-provider')});`);return exit;}
 async function expire(command:string){await admin.query(`update public.whatsapp_execution set lease_until=clock_timestamp()-interval '1 second' where command_id=${lit(command)};`);}
 async function due(command:string){await admin.query(`update public.whatsapp_execution set next_attempt_at=clock_timestamp()-interval '1 second' where command_id=${lit(command)};`);}
 async function record(name:string,f:{id:string;command:string},before:unknown,expected:{phase:string;attempts:number;effects:number;state:string;version:number;processing?:number},actions:unknown) {
  const actual=await snapshot(f.id);const x=actual.execution.find((x:{command_id:string})=>x.command_id===f.command);
  assert.equal(x.phase,expected.phase);assert.equal(x.attempt_count,expected.attempts);assert.equal(actual.external_effects.length,expected.effects);assert.equal(actual.conversation.flow.state,expected.state);assert.equal(actual.conversation.version,expected.version);
  assert.equal(actual.processing.length,expected.processing??1);assert.equal(actual.commands.filter((o:{kind:string})=>o.kind==='request_booking').length,actual.commands[0].kind==='request_booking'?1:0);
  assert.equal(actual.attempts.filter((a:{phase:string})=>a.phase==='claimed'||a.phase==='executing').length,0);
  assert.equal(actual.attempts.length,expected.attempts);assert.ok(actual.worker_audit.length>0);
  const main=actual.commands.find((o:{id:string})=>o.id===f.command);
  assert.equal(main.status,expected.phase==='reconciliation'?'reconciliation':'claimed');
  assert.equal(main.claim_token,x.token);
  assert.equal(actual.transition_audit.length,(expected.processing??1)+1);
  const followups=actual.commands.filter((o:{kind:string})=>o.kind==='show_quote'||o.kind==='show_booking');
  assert.equal(followups.length,expected.phase==='succeeded'&&expected.state!=='handoff'?1:0);
  if(expected.phase==='succeeded')assert.ok(x.result);else assert.equal(x.result,null);
  const expectedAudit:string[]=[];
  if(expected.attempts===0)expectedAudit.push('legacy_execution_unknown');
  for(const a of actual.attempts){
   assert.equal(a.phase,a.attempt===expected.attempts?expected.phase:'retryable_failed');
   assert.ok(a.finished_at);assert.ok(Date.parse(a.finished_at)>=Date.parse(a.claimed_at));
   expectedAudit.push('claimed');
   if(a.effect_started_at)expectedAudit.push('effect_may_start');
   if(a.phase==='succeeded'){assert.ok(a.effect_started_at);expectedAudit.push('succeeded');}
   else if(a.phase==='reconciliation')expectedAudit.push('reconciliation:unknown');
   else if(a.phase==='retryable_failed')expectedAudit.push('retryable_failed:transient_pre_effect');
   else expectedAudit.push(expected.attempts===3?'retry_budget_exhausted':'permanently_failed:permanent_pre_effect');
   const own=actual.worker_audit.filter((e:{attempt:number})=>e.attempt===a.attempt);
   assert.ok(own.every((e:{token:string})=>e.token===a.token));
  }
  assert.deepEqual(actual.worker_audit.map((e:{event:string})=>e.event),expectedAudit);
  evidence.push({name,before,actions,expected,actual,result:'PASS'});console.log('PASS '+name);
 }
 async function blocked(label:string){for(let i=0;i<200;i++){const rows=JSON.parse(await admin.query(`select coalesce(jsonb_agg(jsonb_build_object('pid',pid,'wait',wait_event,'blockers',pg_blocking_pids(pid))),'[]') from pg_stat_activity where application_name=${lit(label)} and wait_event_type='Lock';`));if(rows.length&&rows[0].blockers.length)return rows;await new Promise(r=>setTimeout(r,20));}throw new Error('No measured lock wait '+label);}
 assert.equal(await run(legacyClaimed.command),'not_claimed');
 assert.equal(await run(legacyRecon.command),'not_claimed');
 assert.equal(await run(legacyPending.command),'succeeded');
 await record('pre-migration pending command executes once',legacyPending,pendingAfter,{phase:'succeeded',attempts:1,effects:1,state:'completed',version:4},'original pending row retained and executed');
 // 1 actual overlapping claim transactions, with a test-only AFTER trigger barrier.
 {
 const f=await fixture();const before=await snapshot(f.id);
 await admin.query(`create function public.gate2_pause() returns trigger language plpgsql as $$ begin if current_setting('application_name')='gate2-race-a' then perform pg_advisory_xact_lock(778899); end if; return new; end $$;
 create trigger gate2_pause after insert on public.whatsapp_execution for each row execute function public.gate2_pause();select pg_advisory_lock(778899);`);
 const a=start(f.command,'success','gate2-race-a');const waitA=await blocked(a.label);const b=start(f.command,'success','gate2-race-b');const waitB=await blocked(b.label);await admin.query('select pg_advisory_unlock(778899);');assert.equal(await a.wait('done'),'succeeded');assert.equal(await b.wait('done'),'not_claimed');await Promise.all([a.exited,b.exited]);await admin.query('drop trigger gate2_pause on public.whatsapp_execution;');
 await record('1 concurrent workers',f,before,{phase:'succeeded',attempts:1,effects:1,state:'completed',version:4},{waitA,waitB});
 }
 for(const [name,mode,expectedEffects,phase] of [['2 crash after claim','pre_crash',1,'succeeded'],['3 crash after booking effect','after_effect_crash',1,'reconciliation'],['10a termination after effect marker before invocation','before_effect_crash',0,'reconciliation']] as const) {
 const f=await fixture();const before=await snapshot(f.id);const w=start(f.command,mode);const point=await w.wait('point');const atCrash=await snapshot(f.id);assert.equal(atCrash.external_effects.length,mode==='after_effect_crash'?1:0);const exit=await kill(w);await expire(f.command);const discovered=await recoverDueMockCommands(store); const recovery=discovered.find(x=>x.id===f.command)?.result;
 if(mode==='pre_crash'){assert.equal(recovery,'retryable_failed');await due(f.command);assert.equal(await run(f.command),'succeeded');}else{assert.equal(recovery,'reconciliation');assert.equal(await run(f.command),'not_claimed');assert.equal(await recoverMockCommand(store,f.command),'stale');}
 await record(name,f,before,{phase,attempts:mode==='pre_crash'?2:1,effects:expectedEffects,state:phase==='succeeded'?'completed':'handoff',version:4},{point,atCrash,exit,recovery,discovered});
 }
 {
 const f=await fixture();const before=await snapshot(f.id);assert.equal(await run(f.command,'timeout'),'reconciliation');const atTimeout=await snapshot(f.id);assert.equal(atTimeout.external_effects.length,1);assert.equal(await run(f.command),'not_claimed');
 await record('4 timeout unknown',f,before,{phase:'reconciliation',attempts:1,effects:1,state:'handoff',version:4},{atTimeout});
 }
 for(const kind of ['booking','pricing']) {
 const f=await fixture(kind);const before=await snapshot(f.id);assert.equal(await run(f.command,'transient_once'),'retryable_failed');const retry=await snapshot(f.id);assert.equal(retry.external_effects.length,0);assert.ok(Date.parse(retry.execution[0].next_attempt_at)>Date.parse(retry.attempts[0].finished_at));assert.equal(await run(f.command),'not_claimed');await due(f.command);assert.equal(await run(f.command,'transient_once'),'succeeded');
 await record('5 transient pre-effect '+kind,f,before,{phase:'succeeded',attempts:2,effects:1,state:kind==='booking'?'completed':'awaiting_confirmation',version:kind==='booking'?4:2},{retry,clockAdjustment:'next_attempt_at aged after verifying backoff'});
 }
 for(const kind of ['booking','pricing']) {
 const f=await fixture(kind);const before=await snapshot(f.id);assert.equal(await run(f.command,'permanent'),'permanently_failed');assert.equal(await run(f.command),'not_claimed');
 await record('6 permanent '+kind,f,before,{phase:'permanently_failed',attempts:1,effects:0,state:'handoff',version:kind==='booking'?4:2},'permanent pre-effect rejection; repeat offered');
 }
 {
 const f=await fixture();const before=await snapshot(f.id);assert.equal(await run(f.command),'succeeded');const committed=await snapshot(f.id);assert.equal(await run(f.command),'not_claimed');assert.equal(await recoverMockCommand(store,f.command),'stale');assert.deepEqual(await snapshot(f.id),committed);
 await record('7 completed command replay',f,before,{phase:'succeeded',attempts:1,effects:1,state:'completed',version:4},'success persisted; replay and recovery unchanged');
 }
 for(const afterEffect of [false,true]) {
 const f=await fixture();const before=await snapshot(f.id);const w=start(f.command,afterEffect?'after_effect_crash':'pre_crash');await w.wait('point');const suspended=await snapshot(f.id);await expire(f.command);const recovery=await recoverMockCommand(store,f.command);
 if(!afterEffect){await due(f.command);assert.equal(await run(f.command),'succeeded');}
 w.child.send('resume');const oldOutcome=await w.wait('done');await w.exited;assert.equal(oldOutcome,afterEffect?'stale':'stale_claim');
 await record(afterEffect?'9 expired executing claim':'8 expired pre-effect claim',f,before,{phase:afterEffect?'reconciliation':'succeeded',attempts:afterEffect?1:2,effects:1,state:afterEffect?'handoff':'completed',version:4},{suspended,recovery,oldOutcome,oldWorkerResumed:true});
 }
 {
 const f=await fixture();const before=await snapshot(f.id);const w=start(f.command,'after_success_crash');await w.wait('point');const durable=await snapshot(f.id);const exit=await kill(w);assert.equal(await recoverMockCommand(store,f.command),'stale');assert.equal(await run(f.command),'not_claimed');assert.deepEqual(await snapshot(f.id),durable);
 await record('10b termination after durable success',f,before,{phase:'succeeded',attempts:1,effects:1,state:'completed',version:4},{exit,durable});
 }
 {
 const f=await fixture();const before=await snapshot(f.id);const steps=[];
 for(let i=1;i<=3;i++){const result=await run(f.command,'transient');steps.push(await snapshot(f.id));assert.equal(result,i===3?'permanently_failed':'retryable_failed');if(i<3)await due(f.command);}
 assert.equal(await run(f.command),'not_claimed');const end=await snapshot(f.id);assert.equal(end.execution[0].reason,'retry_budget_exhausted');
 await record('11 retry budget exhaustion',f,before,{phase:'permanently_failed',attempts:3,effects:0,state:'handoff',version:4},{steps});
 }
 {
 const a=await fixture(),b=await fixture();const beforeA=await snapshot(a.id),beforeB=await snapshot(b.id);const wa=start(a.command,'parallel'),wb=start(b.command,'parallel');await wa.wait('point');await wb.wait('point');const simultaneousA=await snapshot(a.id),simultaneousB=await snapshot(b.id);assert.equal(simultaneousA.execution[0].phase,'executing');assert.equal(simultaneousB.execution[0].phase,'executing');assert.equal(simultaneousA.external_effects.length,1);assert.equal(simultaneousB.external_effects.length,1);
 wa.child.send('resume');wb.child.send('resume');assert.equal(await wa.wait('done'),'succeeded');assert.equal(await wb.wait('done'),'succeeded');await Promise.all([wa.exited,wb.exited]);
 await record('12 parallel commands A',a,beforeA,{phase:'succeeded',attempts:1,effects:1,state:'completed',version:4},{simultaneousA,simultaneousB});
 await record('12 parallel commands B',b,beforeB,{phase:'succeeded',attempts:1,effects:1,state:'completed',version:4},{simultaneousA,simultaneousB});
 }
 // Crash during result transaction: fake effect committed independently, all local result writes roll back.
 {
 const f=await fixture();const before=await snapshot(f.id);
 await admin.query(`create function public.gate2_result_pause() returns trigger language plpgsql as $$ begin if new.phase='succeeded' and current_setting('application_name')='gate2-result-crash' then perform pg_advisory_xact_lock(889911); end if; return new; end $$;
 create trigger gate2_result_pause after update on public.whatsapp_execution for each row execute function public.gate2_result_pause();select pg_advisory_lock(889911);`);
 const w=start(f.command,'success','gate2-result-crash');const wait=await blocked(w.label);const uncommitted=await snapshot(f.id);
 assert.equal(uncommitted.external_effects.length,1);assert.equal(uncommitted.execution[0].phase,'executing');assert.equal(uncommitted.conversation.version,3);assert.equal(uncommitted.commands.length,1);
 const exit=await kill(w);await admin.query('select pg_advisory_unlock(889911);drop trigger gate2_result_pause on public.whatsapp_execution;');
 assert.deepEqual(await snapshot(f.id),uncommitted);await expire(f.command);assert.equal(await recoverMockCommand(store,f.command),'reconciliation');assert.equal(await run(f.command),'not_claimed');
 await record('10c crash inside success transaction',f,before,{phase:'reconciliation',attempts:1,effects:1,state:'handoff',version:4},{wait,uncommitted,exit});
 }
 // Old Gate 1 claim callers after the migration still get conservative quarantine, never a retry.
 {
 const f=await fixture();const before=await snapshot(f.id);await server.query(`select public.claim_whatsapp_command(${lit(f.command)},${lit(randomUUID())});`);
 const discovered=await recoverDueMockCommands(store);assert.equal(discovered.find(x=>x.id===f.command)?.result,'reconciliation');assert.equal(await run(f.command),'not_claimed');
 await record('legacy caller after migration',f,before,{phase:'reconciliation',attempts:0,effects:0,state:'handoff',version:4},{discovered});
 }
 // A concurrent customer handoff forces result CAS reload without re-executing the booking.
 {
 const f=await fixture();const before=await snapshot(f.id);const w=start(f.command,'result_conflict');await w.wait('point');
 const mid=randomUUID();await admin.query(`insert into public.whatsapp_messages(id,conversation_id,waba_id,phone_number_id,provider_message_id,direction,message_type,text_body,processing_status,provider_timestamp) values(${lit(mid)},${lit(f.id)},'100','200',${lit('wamid.'+mid)},'inbound','text','{"type":"handoff"}','stored',now());`);
 await processInbound(processorStore,mid,m=>JSON.parse(m.text_body!) as CustomerAction);w.child.send('resume');assert.equal(await w.wait('done'),'succeeded');await w.exited;
 const writes=w.messages.filter(m=>m.rpc==='finish_whatsapp_execution').map(m=>m.result);assert.deepEqual(writes,['conflict','succeeded']);
 await record('result CAS reload after customer handoff',f,before,{phase:'succeeded',attempts:1,effects:1,state:'handoff',version:5,processing:2},{writes});
 }
 // A committed quote that expires while waiting is rejected BEFORE effect invocation.
 {
 const f=await fixture();const before=await snapshot(f.id);await admin.query(`update public.whatsapp_conversations set flow=jsonb_set(flow,'{quote,expiresAt}',to_jsonb((clock_timestamp()-interval '1 second')::text)) where id=${lit(f.id)};`);
 assert.equal(await run(f.command),'stale_claim');await record('expired quote before execution',f,before,{phase:'permanently_failed',attempts:1,effects:0,state:'handoff',version:4},'stored expiry aged before execution');
 }
 const security=JSON.parse(await admin.query(`select jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'anon_select',has_table_privilege('anon',c.oid,'select'),'authenticated_update',has_table_privilege('authenticated',c.oid,'update'))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('whatsapp_execution','whatsapp_execution_attempts','whatsapp_execution_audit')),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'definer',p.prosecdef,'anon_execute',has_function_privilege('anon',p.oid,'execute'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('claim_whatsapp_execution','begin_whatsapp_effect','fail_whatsapp_execution','load_whatsapp_execution','finish_whatsapp_execution','recover_whatsapp_execution','due_whatsapp_recovery')));`));
 for(const t of security.tables){assert.equal(t.rls,true);assert.equal(t.anon_select,false);assert.equal(t.authenticated_update,false);}
 for(const f of security.functions){assert.equal(f.definer,false);assert.equal(f.anon_execute,false);assert.equal(f.authenticated_execute,false);}
 assert.equal(await admin.query('select count(*) from public.bookings;'),'0');
 mkdirSync('work/gate2',{recursive:true});writeFileSync('work/gate2/postgres-evidence.json',JSON.stringify({postgres:await admin.query('select version();'),network:'none',security,cases:evidence},null,2));
 console.log('Gate 2 proof complete: '+evidence.length+' measured scenarios');
 } finally {for(const c of children)if(c.exitCode===null&&!c.signalCode)c.kill('SIGKILL');for(const s of sessions)s.close();const cleanup=new Session('postgres');await cleanup.query(`drop database ${db} with(force);`);cleanup.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
