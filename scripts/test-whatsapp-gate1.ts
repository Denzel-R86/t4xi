/** Gate 1 integration proof. Dedicated, network-isolated PostgreSQL only. */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { processInbound, type ProcessingStore, type ProcessingInput } from "../lib/whatsapp/processor";
import { newConversation, applyCustomerAction, acceptDomainQuote, newConfirmationToken, type CustomerAction } from "../lib/whatsapp/conversation";
const container = "t4xi-whatsapp-gate1";
const db = `gate1_${process.pid}`;
const lit = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const json = (v: unknown) => lit(JSON.stringify(v)) + "::jsonb";
class Session {
  child; buffer = ""; errors = ""; pending: { resolve: (s: string) => void; reject: (e: Error) => void; marker: string } | null = null;
  constructor(database: string) {
    this.child = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { stdio: "pipe" });
    this.child.stdout.on("data", chunk => { this.buffer += chunk.toString(); const p = this.pending; if (p && this.buffer.includes(p.marker+"\n")) { const s=this.buffer.slice(0,this.buffer.indexOf(p.marker)); this.buffer=""; this.pending=null; p.resolve(s.trim()); } });
    this.child.stderr.on("data", c => { this.errors += c.toString(); });
    this.child.on("close", () => { if(this.pending) { this.pending.reject(new Error(this.errors || "session closed")); this.pending=null; } });
  }
  query(sql: string): Promise<string> { assert.equal(this.pending,null); const marker="END_"+randomUUID(); return new Promise((resolve,reject)=> {this.pending={resolve,reject,marker}; this.child.stdin.write(sql+"\n\\echo "+marker+"\n");}); }
  close() { this.child.stdin.end(); }
}
async function main() {
 const inspect=JSON.parse(execFileSync("docker",["inspect",container],{encoding:"utf8"}))[0]; assert.equal(inspect.HostConfig.NetworkMode,"none");
 const boot=new Session("postgres"); await boot.query(`create database ${db};`); boot.close();
 const sessions: Session[]=[];
 async function session(name: string, role=false) {const s=new Session(db); sessions.push(s); await s.query(`set application_name=${lit(name)}; set statement_timeout='20s'; ${role?"set role service_role;":""}`); return s;}
 const admin=await session("gate1-observer");
 const evidence: unknown[]=[];
 try {
 await admin.query(`do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; end if; end $$;
 create table public.bookings(id uuid primary key);
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
 await admin.query(readFileSync("supabase/migrations/20260909114512_whatsapp_ingress.sql","utf8"));
 await admin.query(readFileSync("supabase/migrations/20260910080812_whatsapp_transactional_processing.sql","utf8"));
 if(process.argv.includes('--with-worker-schema')) await admin.query(readFileSync("supabase/migrations/20260910125036_whatsapp_worker_execution.sql","utf8"));
 const version=await admin.query("select version();");
 async function snapshot(id: string) { return JSON.parse(await admin.query(`select jsonb_build_object(
 'conversation',(select to_jsonb(c)-'created_at'-'last_received_at' from public.whatsapp_conversations c where id=${lit(id)}),
 'processing',coalesce((select jsonb_agg(to_jsonb(p) order by p.message_id) from public.whatsapp_processing p where conversation_id=${lit(id)}),'[]'),
 'audit',coalesce((select jsonb_agg(to_jsonb(a)-'created_at' order by a.version_after,a.id) from public.whatsapp_transition_audit a where conversation_id=${lit(id)}),'[]'),
 'commands',coalesce((select jsonb_agg(to_jsonb(o) order by o.ordinal,o.id) from public.whatsapp_commands o where conversation_id=${lit(id)}),'[]'));`)); }
 let sender=31610000000;
 async function fixture(actions: CustomerAction[], full=false) {
  const id=randomUUID(); const wa=String(++sender); const owner={wabaId:"100",phoneNumberId:"200",waId:wa};
  let c=newConversation(id,owner); const now=new Date();
  if(full) c=applyCustomerAction(c,{eventId:"fixture",expectedVersion:0,now},owner,{type:"propose_fields",fields:{pickup:"Amsterdam",dropoff:"Utrecht",date:"2099-09-12",time:"12:00",persons:2,luggage:"handbagage",rideType:"enkel",customerName:"Test",customerEmail:"test@example.com"}}).conversation;
  await admin.query(`insert into public.whatsapp_conversations(id,waba_id,phone_number_id,wa_id,version,flow,booking_draft) values(${lit(id)},'100','200',${lit(wa)},${c.version},${json(c)},${json(c.draft)});`);
  const ids:string[]=[];
  for(const action of actions) { const mid=randomUUID(); ids.push(mid); await admin.query(`insert into public.whatsapp_messages(id,conversation_id,waba_id,phone_number_id,provider_message_id,direction,message_type,text_body,processing_status,provider_timestamp) values(${lit(mid)},${lit(id)},'100','200',${lit('wamid.'+mid)},'inbound','text',${lit(JSON.stringify(action))},'stored',now());`); }
  return {id,ids,c};
 }
 function store(s: Session, trace: unknown[]=[]): ProcessingStore { return {
  async load(id) { const r=JSON.parse(await s.query(`select public.load_whatsapp_processing(${lit(id)});`)) as ProcessingInput; trace.push({read:r.conversation.version,draft:r.conversation.flow?.draft}); return r; },
  async commit(id,v,d) { const r=await s.query(`select public.commit_whatsapp_processing(${lit(id)},${v},${json(d)});`); trace.push({writeVersion:v,result:r,draft:d.conversation.draft}); assert.ok(['committed','duplicate','conflict'].includes(r)); return r as 'committed'|'duplicate'|'conflict'; }
 }; }
 const decode=(m: ProcessingInput['message'])=>JSON.parse(m.text_body!) as CustomerAction;
 const p=await session("gate1-main",true);
 async function record(name:string,f:{id:string},before:unknown,expected:{version:number;processing:number;audit:number;commands:number;state:string},action:unknown) {
  const after=await snapshot(f.id);
  assert.equal(after.conversation.version,expected.version); assert.equal(after.conversation.flow.state,expected.state);
  for(const key of ['processing','audit','commands'] as const) assert.equal(after[key].length,expected[key]);
  assert.deepEqual(after.conversation.booking_draft,after.conversation.flow.draft);
  for (const row of after.processing) {
    assert.equal(row.version_after,row.version_before+(row.accepted?1:0));
    const audits=after.audit.filter((a: {message_id:string})=>a.message_id===row.message_id);
    assert.equal(audits.length,1); assert.equal(audits[0].version_before,row.version_before);
    assert.equal(audits[0].version_after,row.version_after); assert.equal(audits[0].reason,row.reason);
    if (!row.accepted) assert.equal(after.commands.filter((o: {message_id:string})=>o.message_id===row.message_id).length,0);
  }
  for (const cmd of after.commands) {
    assert.ok(after.processing.some((r: {message_id:string;accepted:boolean})=>r.message_id===cmd.message_id && r.accepted));
    assert.equal(cmd.kind,cmd.payload.type); assert.equal(cmd.conversation_id,f.id);
  }
  assert.equal(new Set(after.processing.map((r: {message_id:string})=>r.message_id)).size,after.processing.length);
  assert.equal(new Set(after.commands.map((r: {message_id:string;ordinal:number})=>r.message_id+':'+r.ordinal)).size,after.commands.length);
  evidence.push({name,before,action,expected,actual:after,result:'PASS'}); console.log('PASS '+name);
 }
 // Same durable message / Meta ID delivered twice: one registration, transition and command.
 {
  const f=await fixture([{type:'handoff'}]); const before=await snapshot(f.id);
  await processInbound(store(p),f.ids[0],decode); await processInbound(store(p),f.ids[0],decode);
  await record('1 duplicate Meta message',f,before,{version:1,processing:1,audit:1,commands:1,state:'handoff'},'same persisted Meta ID processed twice');
 }
 // Force both processors to read v1, then hold A transaction after its commit RPC.
 {
  const f=await fixture([{type:'propose_fields',fields:{persons:3}},{type:'propose_fields',fields:{pickup:'Rotterdam'}}],true);
  const before=await snapshot(f.id); const a=await session('gate1-concurrent-a',true); const b=await session('gate1-concurrent-b',true);
  const ta:unknown[]=[],tb:unknown[]=[]; const sa=store(a,ta),sb=store(b,tb);
  const ra=await sa.load(f.ids[0]); const rb=await sb.load(f.ids[1]); assert.equal(ra!.conversation.version,rb!.conversation.version);
  await a.query('begin;');
  const da=applyCustomerAction(ra!.conversation.flow!,{eventId:f.ids[0],expectedVersion:1,now:new Date()},f.c.owner,decode(ra!.message));
  await sa.commit(f.ids[0],1,da);
  let first=true;
  const processing=processInbound({...sb,load:async id=>{if(first){first=false;return rb;}return sb.load(id);}},f.ids[1],decode);
  const wait=await blocked('gate1-concurrent-b');
  await a.query('commit;'); const result=await processing; assert.equal(result.attempts,2);
  const final=await snapshot(f.id); assert.equal(final.conversation.flow.draft.persons,3); assert.equal(final.conversation.flow.draft.pickup,'Rotterdam');
  assert.deepEqual(tb.filter((x)=>'writeVersion' in (x as object)).map(x=>(x as {result:string}).result),['conflict','committed']);
  await record('2 real concurrent delivery + OCC recomputation',f,before,{version:3,processing:2,audit:2,commands:2,state:'ready_for_quote'},{ta,tb,wait,result});
 }
 async function blocked(name:string) {
  for(let i=0;i<100;i++) { const rows=JSON.parse(await admin.query(`select coalesce(jsonb_agg(jsonb_build_object('pid',pid,'application_name',application_name,'wait_event_type',wait_event_type,'wait_event',wait_event,'blockers',pg_blocking_pids(pid))),'[]') from pg_stat_activity where application_name=${lit(name)} and wait_event_type='Lock';`)); if(rows.length && rows[0].blockers.length) return rows; await new Promise(r=>setTimeout(r,20)); }
  throw new Error('No actual lock wait observed '+name);
 }
 // Production code has no fault flags. Test-only triggers stop the backend at exact write boundaries.
 await admin.query(`create function public.gate1_pause() returns trigger language plpgsql as $$ begin
 if current_setting('application_name') in ('gate1-crash-state','gate1-crash-command') then perform pg_advisory_xact_lock(987123); end if; return new; end $$;`);
 for(const [name,table,event] of [['3 crash after state before outbox','whatsapp_conversations','update'],['4 crash after outbox before commit','whatsapp_commands','insert']] as const) {
  const f=await fixture([{type:'handoff'}]); const before=await snapshot(f.id);
  await admin.query(`create trigger gate1_pause after ${event} on public.${table} for each row execute function public.gate1_pause(); select pg_advisory_lock(987123);`);
  const label=event==='update'?'gate1-crash-state':'gate1-crash-command'; const crash=await session(label,true);
  const run=processInbound(store(crash),f.ids[0],decode).then(()=>false,()=>true);
  const wait=await blocked(label); assert.deepEqual(await snapshot(f.id),before,'uncommitted writes invisible');
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where application_name=${lit(label)}; select pg_advisory_unlock(987123);`);
  assert.equal(await run,true); await admin.query(`drop trigger gate1_pause on public.${table};`);
  assert.deepEqual(await snapshot(f.id),before,'crash rolled back every persisted row');
  await record(name,f,before,{version:0,processing:0,audit:0,commands:0,state:'collecting_booking'},{wait,terminated:true});
  if(event==='insert') {await processInbound(store(p),f.ids[0],decode); await record('5 retry after rollback',f,before,{version:1,processing:1,audit:1,commands:1,state:'handoff'},'same inbound ID retried after case 4 backend termination');}
 }
 {
  const f=await fixture([{type:'propose_fields',fields:{persons:4}},{type:'propose_fields',fields:{dropoff:'Delft'}}],true); const before=await snapshot(f.id);
  const trace:unknown[]=[]; const s=store(p,trace); const stale=await s.load(f.ids[1]);
  await processInbound(s,f.ids[0],decode); let first=true;
  const result=await processInbound({...s,load:async id=>{if(first){first=false;return stale;}return s.load(id);}},f.ids[1],decode);
  assert.equal(result.attempts,2); const final=await snapshot(f.id); assert.equal(final.conversation.flow.draft.persons,4); assert.equal(final.conversation.flow.draft.dropoff,'Delft');
  await record('6 stale version reload and recompute',f,before,{version:3,processing:2,audit:2,commands:2,state:'ready_for_quote'},{trace,result});
 }
 {
  const f=await fixture([{type:'handoff'}]); await processInbound(store(p),f.ids[0],decode); const before=await snapshot(f.id);
  const id=before.commands[0].id; const a=await session('gate1-claim-a',true),b=await session('gate1-claim-b',true); const token=randomUUID();
  await a.query('begin;'); assert.equal(await a.query(`select public.claim_whatsapp_command(${lit(id)},${lit(token)});`),'t');
  const claim=b.query(`select public.claim_whatsapp_command(${lit(id)},${lit(randomUUID())});`); const wait=await blocked('gate1-claim-b'); await a.query('commit;'); assert.equal(await claim,'f');
  const final=await snapshot(f.id); assert.equal(final.commands[0].claim_token,token); assert.equal(final.commands[0].status,'claimed');
  await record('7 concurrent claims',f,before,{version:1,processing:1,audit:1,commands:1,state:'handoff'},{wait,winner:token,loser:false});
 }
 {
  const token=newConfirmationToken(); const f=await fixture([{type:'confirm',token},{type:'confirm',token}],true);
  const quoted=acceptDomainQuote(f.c,{eventId:'fixture-quote',expectedVersion:1,now:new Date()},{quoteId:'stored-fixture-quote',totalCents:12345,currency:'EUR',draftRevision:1,expiresAt:new Date(Date.now()+3600000).toISOString(),outboundFlightRequired:false,returnFlightRequired:false},token).conversation;
  await admin.query(`update public.whatsapp_conversations set version=2,flow=${json(quoted)} where id=${lit(f.id)};`);
  await processInbound(store(p),f.ids[0],decode); const before=await snapshot(f.id); const id=before.commands[0].id; const claim=randomUUID();
  await p.query(`select public.claim_whatsapp_command(${lit(id)},${lit(claim)});`);
  assert.equal(await p.query(`select public.reconcile_whatsapp_command(${lit(id)},${lit(randomUUID())});`),'f');
  assert.equal(await p.query(`select public.reconcile_whatsapp_command(${lit(id)},${lit(claim)});`),'t');
  assert.equal(await p.query(`select public.reconcile_whatsapp_command(${lit(id)},${lit(claim)});`),'f');
  assert.equal(await p.query(`select public.claim_whatsapp_command(${lit(id)},${lit(randomUUID())});`),'f');
  await processInbound(store(p),f.ids[0],decode); await processInbound(store(p),f.ids[1],decode);
  const final=await snapshot(f.id); assert.equal(final.commands[0].status,'reconciliation'); assert.equal(final.commands[0].kind,'request_booking'); assert.equal(final.conversation.flow.commandId,quoted.commandId ?? before.conversation.flow.commandId);
  await record('8 unknown booking outcome',f,before,{version:4,processing:2,audit:3,commands:1,state:'handoff'},'explicit uncertainty only; no external call; wrong token denied; reconciliation once; reclaim and repeat confirmation denied');
 }
 assert.equal(await admin.query('select count(*) from public.bookings;'),'0');
 for(const role of ['anon','authenticated']) {
  const s=await session('gate1-denied-'+role); const denied=await s.query(`set role ${role}; select public.load_whatsapp_processing('${randomUUID()}');`).then(()=>false,()=>true); assert.equal(denied,true);
 }
 mkdirSync('work/gate1',{recursive:true}); writeFileSync(process.argv.includes('--with-worker-schema') ? 'work/gate1/postgres-evidence-with-worker.json' : 'work/gate1/postgres-evidence.json',JSON.stringify({postgres:version,isolation:'READ COMMITTED',network:'none',cases:evidence,domainBookings:0},null,2));
 console.log('All 8 cases verified; raw PostgreSQL snapshots written to work/gate1/postgres-evidence.json');
 } finally {for(const s of sessions) s.close(); const cleanup=new Session('postgres'); await cleanup.query(`drop database ${db} with (force);`); cleanup.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
