import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {query,lit} from './transport';
const evidence=JSON.parse(readFileSync('work/gate3/postgres-evidence.json','utf8'));
const latest=new Map<string,Record<string,unknown>>();
for(const item of evidence.evidence)if(item.actual.conversation)latest.set(item.actual.conversation.id,item.actual);
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
const sort=(rows:unknown[])=>rows.map(row=>JSON.stringify(canonical(row))).sort();
const checks:unknown[]=[];
async function main(){
 for(const [id,expected] of latest){
  const actual=JSON.parse(await query(evidence.database,`begin read only;select jsonb_build_object(
   'conversation',(select to_jsonb(c) from public.whatsapp_conversations c where id=${lit(id)}),
   'processing',(select jsonb_agg(to_jsonb(p)) from public.whatsapp_processing p where conversation_id=${lit(id)}),
   'transition_audit',(select jsonb_agg(to_jsonb(a)) from public.whatsapp_transition_audit a where conversation_id=${lit(id)}),
   'commands',(select jsonb_agg(to_jsonb(o)) from public.whatsapp_commands o where conversation_id=${lit(id)}),
   'execution',(select jsonb_agg(to_jsonb(e)) from public.whatsapp_execution e join public.whatsapp_commands o on o.id=e.command_id where o.conversation_id=${lit(id)}),
   'attempts',(select jsonb_agg(to_jsonb(e)) from public.whatsapp_execution_attempts e join public.whatsapp_commands o on o.id=e.command_id where o.conversation_id=${lit(id)}),
   'worker_audit',(select jsonb_agg(to_jsonb(e)) from public.whatsapp_execution_audit e join public.whatsapp_commands o on o.id=e.command_id where o.conversation_id=${lit(id)}));commit;`));
  assert.deepEqual(actual.conversation,expected.conversation);
  for(const key of ['processing','transition_audit','commands','execution','attempts','worker_audit'])assert.deepEqual(sort(actual[key]),sort(expected[key] as unknown[]));
  checks.push({conversationId:id,state:actual.conversation.flow.state,version:actual.conversation.version,counts:Object.fromEntries(Object.entries(actual).filter(([k])=>k!=='conversation').map(([k,v])=>[k,(v as unknown[]).length])),result:'PASS'});
 }
 const final=JSON.parse(await query(evidence.database,"begin read only;select jsonb_build_object('bookings',(select jsonb_agg(to_jsonb(b)) from public.bookings b),'communication_count',(select count(*) from public.communication_deliveries));commit;"));
 assert.deepEqual(sort(final.bookings),sort(evidence.final.bookings));assert.equal(final.communication_count,0);
 assert.equal(checks.length,8);
 writeFileSync('work/gate3/direct-postgres-verification.json',JSON.stringify({database:evidence.database,readOnly:true,checks,bookingCount:final.bookings.length,communicationCount:0,result:'PASS'},null,2));
 console.log(`PASS independent read-only PostgreSQL reread: ${checks.length} conversations, ${final.bookings.length} bookings, zero communications`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
