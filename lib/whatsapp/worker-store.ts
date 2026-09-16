import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkerStore, WorkerSnapshot, WorkCommand } from './worker';
/** RPC transport shared by the server adapter and the real-PostgreSQL test transport. */
export type WorkerRpc = (name: string,args: Record<string,unknown>) => Promise<unknown>;
export function rpcWorkerStore(rpc: WorkerRpc): WorkerStore {
 return {
  async due() { return await rpc('due_whatsapp_recovery',{}) as string[]; },
  async recover(id) { return String(await rpc('recover_whatsapp_execution',{p_command:id})); },
  async claim(id,token) { return await rpc('claim_whatsapp_execution',{p_command:id,p_token:token}) as WorkCommand|null; },
  async begin(id,token) { return await rpc('begin_whatsapp_effect',{p_command:id,p_token:token})===true; },
  async load(id) { const result=await rpc('load_whatsapp_execution',{p_command:id}); if(!result) throw new Error('COMMAND_NOT_FOUND'); return result as WorkerSnapshot; },
  async fail(id,token,reason) { return String(await rpc('fail_whatsapp_execution',{p_command:id,p_token:token,p_failure:reason})); },
  async finish(id,token,result,version,decision) { return String(await rpc('finish_whatsapp_execution',{p_command:id,p_token:token,p_result:result,p_version:version,p_decision:decision})); },
 };
}
/** Inactive: no service key acquisition, route, cron or network connection is created here. */
export function supabaseWorkerStore(client: SupabaseClient) {
 return rpcWorkerStore(async(name,args)=> { const {data,error}=await client.rpc(name,args); if(error) throw new Error('WORKER_RPC_OUTCOME_UNCONFIRMED'); return data; });
}
