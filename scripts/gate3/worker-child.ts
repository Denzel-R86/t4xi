import { Session } from '../whatsapp-test/session';
import { installTransport,container,lit,val } from './transport';
import { rpcWorkerStore } from '../../lib/whatsapp/worker-store';
import { runLocalDomainWorker } from '../../lib/whatsapp/domain-worker';
import { createBooking } from '../../lib/bookings/create';
const [database,id,mode,label]=process.argv.slice(2);
const session=new Session(database,container);
async function pause(point:string) {process.send?.({point});await new Promise<void>(resolve=>process.once('message',()=>resolve()));}
installTransport(database,label,mode==='after_booking_crash'||mode==='timeout'?()=>pause('booking_committed'):undefined,mode==='status_failure');
async function main() {
 await session.query(`set application_name=${lit(label)};set role service_role;`);
 const store=rpcWorkerStore(async(name,args)=>{
  process.send?.({calling:name});
  const result=JSON.parse(await session.query(`select coalesce(to_jsonb(public.${name}(${Object.values(args).map(val).join(',')})),'null'::jsonb);`));
  if(name==='claim_whatsapp_execution'&&result&&mode==='pre_effect_crash')await pause('claimed');
  return result;
 });
 if(mode==='api') {
   const {POST}=await import('../../app/api/bookings/route');
   const response=await POST(new Request('http://127.0.0.1:65530/api/bookings',{method:'POST',body:id}));
   process.send?.({api:{status:response.status,payload:await response.json()}});
 } else if(mode==='direct') process.send?.({api:await createBooking(JSON.parse(id),{requireQuoteLock:true})});
 else process.send?.({done:await runLocalDomainWorker(store,id)});
}
main().catch(e=>{process.send?.({error:String(e)});process.exitCode=1;}).finally(()=>{session.close();process.disconnect?.();});
