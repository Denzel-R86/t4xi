import { PreEffectFailure, type MockWorkerAdapter, type WorkCommand, type WorkResult } from '../../lib/whatsapp/worker';
/** Observable fake provider. Recording uses a SEPARATE committed DB session, never the result transaction. */
export function fakeAdapter(mode: string, record: (command: WorkCommand) => Promise<void>, pause: (point: string) => Promise<void>): MockWorkerAdapter {
 return {
  mode:'mock',
  async prepare(command) {
   if(mode==='pre_crash') await pause('after_claim');
   if(mode==='permanent') throw new PreEffectFailure(false);
   if(mode==='transient' || (mode==='transient_once' && command.attempt===1)) throw new PreEffectFailure(true);
  },
  async execute(command): Promise<WorkResult> {
   // No actual service calls: ledger counts every effect, with NO dedup constraint masking repeats.
   await record(command);
   if(mode==='after_effect_crash' || mode==='parallel') await pause('after_effect');
   if(mode==='timeout') throw new Error('provider timeout: outcome unknown');
   if(command.kind==='request_booking') return {type:'booking',booking:{id:'fake-'+command.id,reference:'FAKE-'+command.id,status:'pending'}};
   return {type:'quote',quote:{quoteId:'fake-quote-'+command.id,totalCents:12345,currency:'EUR',draftRevision:Number(command.payload.draftRevision),expiresAt:new Date(Date.now()+3600000).toISOString(),outboundFlightRequired:false,returnFlightRequired:false}};
  },
 };
}
