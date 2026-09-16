import assert from 'node:assert/strict';
import { fork, execFileSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { Session } from './whatsapp-test/session';
import { container,lit,val,installTransport } from './gate3/transport';
import { calculateBookingPrice } from '../lib/pricing/engine';
import { resolveQuoteWith } from '../lib/pricing/service';
import { persistPriceSnapshot } from '../lib/pricing/snapshot-store';
import { newConversation,applyCustomerAction,acceptDomainQuote,newConfirmationToken,type CustomerAction } from '../lib/whatsapp/conversation';
import { processInbound,type ProcessingInput } from '../lib/whatsapp/processor';
import { rpcWorkerStore } from '../lib/whatsapp/worker-store';
import { runCommandWorker } from '../lib/whatsapp/worker';
import { pricingAdapter } from '../lib/whatsapp/pricing-adapter';
const database=`gate3_${process.pid}`;
async function main() {
 assert.equal(JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0].HostConfig.NetworkMode,'none');
 const boot=new Session('postgres',container);await boot.query(`create database ${database};`);boot.close();
 const admin=new Session(database,container),server=new Session(database,container);const children:ChildProcess[]=[];
 try {
  await admin.query("do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; create role authenticated; create role service_role bypassrls; end if; end $$;");
  const migrations=[
   '20260705230000_pricing_engine_integrated.sql','20260707120000_bookings_schema_baseline.sql','20260720020000_add_flight_number_to_bookings.sql','20260720090000_add_flight_direction_to_bookings.sql',
   '20260725110000_grant_service_role_access.sql','20260730120000_price_snapshots.sql','20260730130000_create_price_snapshot_rpc.sql','20260802120000_flight_monitoring.sql',
   '20260808103643_harden_search_path_booking_fns.sql','20260808111336_booking_quote_lock.sql','20260809090000_add_return_trip_details.sql','20260820100000_fix_quote_lock_luggage_capacity.sql',
   '20260830120000_booking_lifecycle_and_communication.sql','20260909114512_whatsapp_ingress.sql','20260910080812_whatsapp_transactional_processing.sql','20260910125036_whatsapp_worker_execution.sql',
  ];
  for(const file of migrations) await admin.query(readFileSync('supabase/migrations/'+file,'utf8'));
  await admin.query(`create schema test;create table test.transport_log(id bigint generated always as identity,label text,url text,method text);create table test.domain_calls(id bigint generated always as identity,label text,name text,args jsonb);`);
  await server.query("set role service_role;set application_name='gate3-main';");
  installTransport(database,'main');
  const processor={async load(id:string){return JSON.parse(await server.query(`select public.load_whatsapp_processing(${lit(id)});`)) as ProcessingInput;},async commit(id:string,v:number,d:unknown){return await server.query(`select public.commit_whatsapp_processing(${lit(id)},${v},${val(d)});`) as 'committed'|'duplicate'|'conflict';}};
  const store=rpcWorkerStore(async(name,args)=>JSON.parse(await server.query(`select coalesce(to_jsonb(public.${name}(${Object.values(args).map(val).join(',')})),'null'::jsonb);`)));
  const fields={pickup:'Amsterdam Centrum',dropoff:'Utrecht Centrum',date:'2099-09-12',time:'12:00',persons:2,luggage:'handbagage',rideType:'enkel' as const,customerName:'Domain Test',customerEmail:'domain@example.invalid'};
  const calculate=(input:Parameters<typeof calculateBookingPrice>[0])=>calculateBookingPrice(input,{
   getQuote:input=>resolveQuoteWith(input,{
    findLocation:async raw=>({id:raw,slug:raw.toLowerCase().replaceAll(' ','-'),name:raw,active:true,location_type:'district',city_id:null}),
    findVehicleClass:async()=>({id:'fixture-vehicle',code:'executive-ev',max_passengers:3,max_luggage:3,active:true}),
    findFixedRoute:async()=>({price:69,return_price:120,currency:'EUR',distance_km:14,estimated_duration_min:24,vat_rate:9,source_label:'test fixed route',valid_from:'2026-01-01',active:true}),
    getRoute:async()=>{throw new Error('fixed route must not call external routing');},
   }),loadEventPricing:async()=>null,
  });
  let sender=31630000000,serial=0;
  async function inbound(id:string,owner:{wabaId:string;phoneNumberId:string;waId:string},action:CustomerAction) {
   const message=randomUUID();await admin.query(`insert into public.whatsapp_messages(id,conversation_id,waba_id,phone_number_id,provider_message_id,direction,message_type,text_body,processing_status,provider_timestamp) values(${lit(message)},${lit(id)},'100','200',${lit('wamid.'+message)},'inbound','text',${lit(JSON.stringify(action))},'stored',now());`);
   await processInbound(processor,message,m=>JSON.parse(m.text_body!) as CustomerAction);
   return message;
  }
  async function fixture(patch:Partial<typeof fields>={},fullPricingWorker=false) {
   const id=randomUUID(),owner={wabaId:'100',phoneNumberId:'200',waId:String(++sender)},draft={...fields,...patch};let c=newConversation(id,owner);
   let quoteId:string;
   if(fullPricingWorker){
    await admin.query(`insert into public.whatsapp_conversations(id,waba_id,phone_number_id,wa_id,version,flow,booking_draft) values(${lit(id)},'100','200',${lit(owner.waId)},0,${val(c)},'{}');`);
    const message=await inbound(id,owner,{type:'propose_fields',fields:draft});
    const command=await admin.query(`select id from public.whatsapp_commands where message_id=${lit(message)} and kind='request_quote';`);
    assert.equal(await runCommandWorker(store,command,pricingAdapter({calculate})), 'succeeded');
    c=JSON.parse(await admin.query(`select flow from public.whatsapp_conversations where id=${lit(id)};`));
    quoteId=c.quote!.quoteId;
    const token=await admin.query(`select payload->>'confirmationToken' from public.whatsapp_commands where conversation_id=${lit(id)} and kind='show_quote';`);
    const confirmation=await inbound(id,owner,{type:'confirm',token});
    return {id,owner,quoteId,message:confirmation,command:await admin.query(`select id from public.whatsapp_commands where message_id=${lit(confirmation)} and kind='request_booking';`),draft};
   }
   c=applyCustomerAction(c,{eventId:'fixture',expectedVersion:0,now:new Date()},owner,{type:'propose_fields',fields:draft}).conversation;
   // Actual pricing engine + actual snapshot persistence; fixture DB data only.
   const {snapshot}=await calculate({pickup:draft.pickup,dropoff:draft.dropoff,vehicleClass:'executive-ev',departureAt:'2099-09-12T10:00:00.000Z',passengers:2,luggage:0});
   assert.ok(snapshot);assert.equal(await persistPriceSnapshot(snapshot!),true);quoteId=snapshot!.quoteId;
   const token=newConfirmationToken();c=acceptDomainQuote(c,{eventId:'fixture-quote',expectedVersion:c.version,now:new Date()},{quoteId,totalCents:snapshot!.totalCents,currency:'EUR',expiresAt:snapshot!.expiresAt,draftRevision:1,outboundFlightRequired:false,returnFlightRequired:false},token).conversation;
   assert.equal(c.state,'awaiting_confirmation');
   await admin.query(`insert into public.whatsapp_conversations(id,waba_id,phone_number_id,wa_id,version,flow,booking_draft) values(${lit(id)},'100','200',${lit(owner.waId)},${c.version},${val(c)},${val(c.draft)});`);
   const message=await inbound(id,owner,{type:'confirm',token});
   return {id,owner,quoteId,message,command:await admin.query(`select id from public.whatsapp_commands where message_id=${lit(message)} and kind='request_booking';`),draft};
  }
  const childLogs: {label:string;mode:string;output:string}[]=[];
  function start(id:string,mode='success') {
   const label='gate3-child-'+(++serial);const child=fork('scripts/gate3/worker-child.ts',[database,id,mode,label],{execArgv:['--import','tsx'],stdio:['ignore','pipe','pipe','ipc']});children.push(child);
   const messages:Record<string,unknown>[]=[];let output='';child.stderr?.on('data',c=>output+=c);child.stdout?.on('data',c=>output+=c);child.on('message',m=>messages.push(m as Record<string,unknown>));
   const exited=new Promise<{code:number|null;signal:string|null}>(resolve=>child.once('exit',(code,signal)=>{childLogs.push({label,mode,output});resolve({code,signal});}));
   return {child,label,messages,exited,async wait(key:string,target?:unknown){for(let i=0;i<1500;i++){const m=messages.find(m=>key in m&&(target===undefined||m[key]===target));if(m)return m[key];const err=messages.find(m=>'error'in m);if(err)throw new Error(String(err.error)+' '+output);if(child.exitCode!==null||child.signalCode)throw new Error('child exited '+output);await new Promise(r=>setTimeout(r,20));}throw new Error('worker timeout '+output);}};
  }
  async function run(id:string,mode='success'){const w=start(id,mode);const result=await w.wait(mode==='api'||mode==='direct'?'api':'done');assert.equal((await w.exited).code,0);return result;}
  async function kill(w:ReturnType<typeof start>){w.child.kill('SIGKILL');assert.equal((await w.exited).signal,'SIGKILL');await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where application_name=${lit(w.label)};`);}
  async function snapshot(f:Awaited<ReturnType<typeof fixture>>) {
   return JSON.parse(await admin.query(`select jsonb_build_object(
    'conversation',(select to_jsonb(c) from public.whatsapp_conversations c where id=${lit(f.id)}),
    'processing',(select jsonb_agg(to_jsonb(p)) from public.whatsapp_processing p where conversation_id=${lit(f.id)}),
    'transition_audit',(select jsonb_agg(to_jsonb(a) order by version_after,id) from public.whatsapp_transition_audit a where conversation_id=${lit(f.id)}),
    'commands',(select jsonb_agg(to_jsonb(o) order by ordinal,id) from public.whatsapp_commands o where conversation_id=${lit(f.id)}),
    'execution',(select jsonb_agg(to_jsonb(e)) from public.whatsapp_execution e join public.whatsapp_commands o on o.id=e.command_id where o.conversation_id=${lit(f.id)}),
    'attempts',(select jsonb_agg(to_jsonb(e) order by e.attempt) from public.whatsapp_execution_attempts e join public.whatsapp_commands o on o.id=e.command_id where o.conversation_id=${lit(f.id)}),
    'worker_audit',(select jsonb_agg(to_jsonb(e) order by e.created_at,e.id) from public.whatsapp_execution_audit e join public.whatsapp_commands o on o.id=e.command_id where o.conversation_id=${lit(f.id)}),
    'bookings',coalesce((select jsonb_agg(to_jsonb(b)) from public.bookings b where quote_id=${lit(f.quoteId)}),'[]'),
    'quote',(select to_jsonb(s) from public.price_snapshots s where quote_id=${lit(f.quoteId)}),
    'domain_calls',coalesce((select jsonb_agg(to_jsonb(t) order by id) from test.domain_calls t where args->>'p_quote_id'=${lit(f.quoteId)}),'[]'),
    'communications',(select count(*) from public.communication_deliveries));`));
  }
  const evidence:unknown[]=[];
  async function record(name:string,f:Awaited<ReturnType<typeof fixture>>,before:unknown,phase:string,count:number,actions:unknown) {
   const actual=await snapshot(f);const x=actual.execution.find((x:{command_id:string})=>x.command_id===f.command);
   assert.equal(x.phase,phase);assert.equal(actual.bookings.length,count);assert.equal(actual.commands.filter((o:{kind:string})=>o.kind==='request_booking').length,1);
   assert.equal(actual.conversation.flow.state,phase==='succeeded'?'completed':'handoff');
   assert.equal(actual.communications,0);assert.ok(actual.worker_audit.length);assert.ok(actual.transition_audit.length);
   assert.equal(actual.conversation.version,4);assert.equal(actual.conversation.flow.version,4);
   const fullFlow=actual.commands.some((o:{kind:string})=>o.kind==='request_quote');
   assert.equal(actual.processing.length,fullFlow?2:1);
   assert.equal(actual.transition_audit.length,fullFlow?4:2);
   assert.equal(actual.commands.length,(fullFlow?2:0)+(phase==='succeeded'?2:1));
   const ownAttempts=actual.attempts.filter((a:{command_id:string})=>a.command_id===f.command);
   assert.equal(ownAttempts.length,name.includes('bounded safe recovery')?2:1);
   assert.equal(x.attempt_count,ownAttempts.length);
   assert.ok(ownAttempts.every((a:{finished_at:string})=>a.finished_at));
   const ownAudit=actual.worker_audit.filter((a:{command_id:string})=>a.command_id===f.command).map((a:{event:string})=>a.event);
   const finalAudit=phase==='succeeded'?'succeeded':phase==='reconciliation'?'reconciliation:unknown':'permanently_failed:permanent_pre_effect';
   assert.deepEqual(ownAudit,name.includes('bounded safe recovery')?['claimed','retryable_failed:transient_pre_effect','claimed','effect_may_start',finalAudit]:['claimed','effect_may_start',finalAudit]);
   if(count){assert.equal(actual.bookings[0].status,'inquiry');assert.equal(actual.quote.booking_id,actual.bookings[0].id);assert.ok(actual.quote.consumed_at);assert.equal(actual.bookings[0].price_euros,actual.quote.total_cents/100);}
   if(phase==='succeeded'){assert.equal(actual.conversation.flow.booking.status,actual.bookings[0].status);assert.equal(actual.conversation.flow.booking.id,actual.bookings[0].id);}
   evidence.push({name,before,actions,expected:{version:4,processingCount:fullFlow?2:1,transitionAuditCount:fullFlow?4:2,commandCount:(fullFlow?2:0)+(phase==='succeeded'?2:1),attemptCount:ownAttempts.length,workerAudit:ownAudit,phase,bookingCount:count,state:phase==='succeeded'?'completed':'handoff',communicationRows:0},actual,result:'PASS'});console.log('PASS '+name);
  }
  const full=await fixture({},true),beforeFull=await snapshot(full);assert.equal(await run(full.command),'succeeded');
  await record('pricing worker -> confirmation -> real booking',full,beforeFull,'succeeded',1,'actual pricing/snapshot and booking service, shared worker protocol');
  const beforeReplay=await snapshot(full);assert.equal(await run(full.command),'not_claimed');assert.equal(await run(full.command),'not_claimed');
  await processInbound(processor,full.message,m=>JSON.parse(m.text_body!) as CustomerAction);
  await record('duplicate command and inbound replay',full,beforeReplay,'succeeded',1,'two worker replays plus persisted inbound replay');
  const body={...full.draft,customerPhone:'+'+full.owner.waId,quoteId:full.quoteId};
  const beforeApi=await snapshot(full);
  const api=await run(JSON.stringify(body),'api') as {status:number;payload:Record<string,unknown>};assert.equal(api.status,201);assert.equal(api.payload.bookingId,(await snapshot(full)).bookings[0].id);assert.equal(api.payload.status,'inquiry');
  await record('API parity and same-quote service idempotency',full,beforeApi,'succeeded',1,{api});
  const apiSnapshot=(await calculate({pickup:fields.pickup,dropoff:fields.dropoff,vehicleClass:'executive-ev',departureAt:'2099-09-12T10:00:00.000Z',passengers:2,luggage:0})).snapshot!;
  assert.equal(await persistPriceSnapshot(apiSnapshot),true);
  const freshApi=await run(JSON.stringify({...body,quoteId:apiSnapshot.quoteId}),'api') as {status:number;payload:Record<string,unknown>};
  assert.equal(freshApi.status,201);
  const freshRow=JSON.parse(await admin.query(`select to_jsonb(b) from public.bookings b where id=${lit(String(freshApi.payload.bookingId))};`));
  const workerRow=(await snapshot(full)).bookings[0];
  const business=(row:Record<string,unknown>)=>Object.fromEntries(Object.entries(row).filter(([key])=>!['id','booking_ref','created_at','quote_id'].includes(key)));
  assert.deepEqual(business(freshRow),business(workerRow));assert.equal(freshApi.payload.status,freshRow.status);
  const apiCount=Number(await admin.query(`select count(*) from public.bookings where quote_id=${lit(apiSnapshot.quoteId)};`));assert.equal(apiCount,1);
  evidence.push({name:'fresh API versus fresh worker booking parity',expected:{sameBusinessFields:true,status:'inquiry',bookingsPerQuote:1},actual:{workerRow,apiRow:freshRow,apiResponse:freshApi,apiCount},result:'PASS'});
  console.log('PASS fresh API versus fresh worker booking parity');
  const failId=randomUUID(),failOwner={wabaId:'100',phoneNumberId:'200',waId:String(++sender)},failFlow=newConversation(failId,failOwner);
  await admin.query(`insert into public.whatsapp_conversations(id,waba_id,phone_number_id,wa_id,version,flow,booking_draft) values(${lit(failId)},'100','200',${lit(failOwner.waId)},0,${val(failFlow)},'{}');`);
  const failMessage=await inbound(failId,failOwner,{type:'propose_fields',fields});
  const failCommand=await admin.query(`select id from public.whatsapp_commands where message_id=${lit(failMessage)};`);
  const failureFixture={id:failId,owner:failOwner,quoteId:randomUUID(),message:failMessage,command:failCommand,draft:fields};
  const beforePricingFailure=await snapshot(failureFixture);
  const failedPricing=pricingAdapter({calculate:input=>calculateBookingPrice(input,{getQuote:input=>resolveQuoteWith(input,{
    findLocation:async()=>{throw new Error('database lookup unavailable');},findVehicleClass:async()=>null,findFixedRoute:async()=>null,getRoute:async()=>null,
  }),loadEventPricing:async()=>null})});
  assert.equal(await runCommandWorker(store,failCommand,failedPricing),'reconciliation');
  const pricingFailure=await snapshot(failureFixture);
  assert.equal(pricingFailure.conversation.version,2);assert.equal(pricingFailure.conversation.flow.state,'handoff');assert.equal(pricingFailure.processing.length,1);assert.equal(pricingFailure.transition_audit.length,2);assert.equal(pricingFailure.commands.length,1);assert.equal(pricingFailure.execution[0].phase,'reconciliation');assert.equal(pricingFailure.attempts.length,1);assert.equal(pricingFailure.bookings.length,0);assert.equal(pricingFailure.communications,0);
  assert.deepEqual(pricingFailure.worker_audit.map((a:{event:string})=>a.event),['claimed','effect_may_start','reconciliation:unknown']);
  evidence.push({name:'real pricing engine data failure -> conservative worker outcome',before:beforePricingFailure,expected:{state:'handoff',version:2,processing:1,audit:2,commands:1,attempts:1,bookingCount:0},actual:pricingFailure,result:'PASS'});
  console.log('PASS real pricing engine data failure -> conservative worker outcome');
  const concurrent=await fixture();const beforeConcurrent=await snapshot(concurrent);
  const lock=new Session(database,container);await lock.query(`begin;select id from public.whatsapp_commands where id=${lit(concurrent.command)} for update;`);
  const a=start(concurrent.command),b=start(concurrent.command);await a.wait('calling','claim_whatsapp_execution');await b.wait('calling','claim_whatsapp_execution');
  let waits:unknown[]=[];
  for(let i=0;i<300;i++){waits=JSON.parse(await admin.query(`select coalesce(jsonb_agg(jsonb_build_object('pid',pid,'application',application_name,'wait',wait_event_type,'blocking',pg_blocking_pids(pid))),'[]') from pg_stat_activity where application_name in (${lit(a.label)},${lit(b.label)}) and wait_event_type='Lock';`));if(waits.length===2)break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(waits.length,2);await lock.query('commit;');lock.close();
  const results=[await a.wait('done'),await b.wait('done')].sort();assert.deepEqual(results,['not_claimed','succeeded']);await a.exited;await b.exited;
  await record('concurrent workers with observed PostgreSQL lock waits',concurrent,beforeConcurrent,'succeeded',1,{waits,results});
  const invalid=await fixture({customerEmail:'bad'});const beforeInvalid=await snapshot(invalid);assert.equal(await run(invalid.command),'permanently_failed');
  await record('validation/permanent pre-effect failure',invalid,beforeInvalid,'permanently_failed',0,'existing booking validator rejects invalid email');
  const pre=await fixture(),beforePre=await snapshot(pre),wpre=start(pre.command,'pre_effect_crash');await wpre.wait('point','claimed');await kill(wpre);
  await admin.query(`update public.whatsapp_execution set lease_until=clock_timestamp()-interval '1 second' where command_id=${lit(pre.command)};`);
  assert.equal(await store.recover(pre.command),'retryable_failed');const recoveredPre=await snapshot(pre);assert.equal(recoveredPre.bookings.length,0);
  await admin.query(`update public.whatsapp_execution set next_attempt_at=clock_timestamp()-interval '1 second' where command_id=${lit(pre.command)};`);
  assert.equal(await run(pre.command),'succeeded');await record('crash before effect and bounded safe recovery',pre,beforePre,'succeeded',1,{signal:'SIGKILL',recoveredPre});
  for(const mode of ['after_booking_crash','timeout','status_failure']) {
   const f=await fixture(),before=await snapshot(f);let afterEffect:unknown;
   if(mode==='status_failure')assert.equal(await run(f.command,mode),'reconciliation');
   else {
    const w=start(f.command,mode);await w.wait('point','booking_committed');afterEffect=await snapshot(f);assert.equal((afterEffect as {bookings:unknown[]}).bookings.length,1);
    if(mode==='after_booking_crash')await kill(w);
    await admin.query(`update public.whatsapp_execution set lease_until=clock_timestamp()-interval '1 second' where command_id=${lit(f.command)};`);
    assert.equal(await store.recover(f.command),'reconciliation');
    if(mode==='timeout'){w.child.send('resume');await w.wait('done');await w.exited;}
   }
   assert.equal(await run(f.command),'not_claimed');assert.equal(await store.recover(f.command),'stale');
   await record(mode+' -> UNKNOWN and replay',f,before,'reconciliation',1,{afterEffect,automaticSecondCall:false});
   const after=await snapshot(f);assert.equal(after.domain_calls.filter((x:{name:string})=>x.name==='create_booking_from_snapshot').length,1);
  }
  const final=JSON.parse(await admin.query("select jsonb_build_object('bookings',(select jsonb_agg(to_jsonb(b)) from public.bookings b),'communication_count',(select count(*) from public.communication_deliveries),'transport',(select jsonb_agg(to_jsonb(t) order by id) from test.transport_log t));"));
  assert.equal(final.bookings.length,7,'no additional booking in pricing/validation or unkeyed fallback paths');
  assert.ok(final.bookings.every((b:{quote_id:string})=>b.quote_id));
  assert.equal(new Set(final.bookings.map((b:{quote_id:string})=>b.quote_id)).size,7);
  assert.equal(Number(await admin.query("select count(*) from test.domain_calls where name='create_booking';")),0,'no unkeyed service RPC');
  assert.ok(childLogs.reduce((n,log)=>n+(log.output.match(/recipient_blocked/g)?.length??0),0)>=14,'real recipient policy must block both audiences');
  assert.ok(final.transport.every((t:{url:string})=>t.url.startsWith('http://127.0.0.1:65530/rest/v1/')));assert.equal(final.communication_count,0);
  mkdirSync('work/gate3',{recursive:true});writeFileSync('work/gate3/postgres-evidence.json',JSON.stringify({database,server:await admin.query('select version();'),migrations,mocks:['Supabase HTTP transport -> real canonical PostgreSQL SQL (not PostgREST)','pricing DB lookup fixture data and absent event config; real resolveQuoteWith + calculateBookingPrice','lease/backoff clock advanced in tests'],evidence,final,childLogs},null,2));
 } finally {for(const child of children)if(child.exitCode===null&&!child.signalCode)child.kill('SIGKILL');admin.close();server.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
