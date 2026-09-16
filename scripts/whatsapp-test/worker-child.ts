import { execFileSync } from 'node:child_process';
import { Session } from './session';
import { fakeAdapter } from './fake-adapter';
import { rpcWorkerStore } from '../../lib/whatsapp/worker-store';
import { runMockWorker } from '../../lib/whatsapp/worker';
const [database,id,mode,label]=process.argv.slice(2);
const container='t4xi-whatsapp-gate2';
if(!/^gate2_[0-9]+$/.test(database) || JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0].HostConfig.NetworkMode!=='none') throw new Error('LOCAL_TEST_ONLY');
const lit=(s:string)=>"'"+s.replace(/'/g,"''")+"'";
const session=new Session(database); const external=new Session(database);
async function pause(point:string) {process.send?.({point}); await new Promise<void>(resolve=>process.once('message',()=>resolve()));}
async function main() {
 await session.query(`set application_name=${lit(label)}; set role service_role;`);
 await external.query(`set application_name=${lit(label+'-fake-provider')};`);
 let pausedResult=false;
 const store=rpcWorkerStore(async(name,args)=> {
  if(name==='finish_whatsapp_execution' && mode==='result_conflict' && !pausedResult){pausedResult=true;await pause('before_result_commit');}
  const sql=Object.values(args).map(v=>v===null?'null':typeof v==='object'?lit(JSON.stringify(v))+'::jsonb':lit(String(v))).join(',');
  const result=JSON.parse(await session.query(`select coalesce(to_jsonb(public.${name}(${sql})),'null'::jsonb);`));
  process.send?.({rpc:name,result});
  if(name==='begin_whatsapp_effect' && result===true && mode==='before_effect_crash') await pause('effect_marker_committed');
  if(name==='finish_whatsapp_execution' && result==='succeeded' && mode==='after_success_crash') await pause('success_committed');
  return result;
 });
 const result=await runMockWorker(store,id,fakeAdapter(mode,async command=>{await external.query(`insert into public.fake_effects(command_id,kind,attempt) values(${lit(command.id)},${lit(command.kind)},${command.attempt});`);},pause));
 process.send?.({done:result});
}
main().catch(e=>{process.send?.({error:String(e)});process.exitCode=1;}).finally(()=>{session.close();external.close();process.disconnect?.();});
