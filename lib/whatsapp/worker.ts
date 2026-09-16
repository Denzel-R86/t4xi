import { randomUUID } from "node:crypto";
import { acceptBookingResult, acceptDomainQuote, newConfirmationToken, type Conversation, type Decision, type QuotedTrip } from "./conversation";
export type WorkCommand = { id: string; kind: 'request_quote' | 'request_booking'; payload: Record<string, unknown>; claim_token: string; attempt: number };
export type WorkResult = { type: 'quote'; quote: QuotedTrip } | { type: 'booking'; booking: NonNullable<Conversation['booking']> };
export type WorkerSnapshot = { command: { status: string; claim_token: string | null }; execution: { phase: string; token: string | null; lease_until: string | null } | null; conversation: { version: number; flow: Conversation } };
export interface WorkerStore {
 due(): Promise<string[]>;
 recover(id: string): Promise<string>;
 claim(id: string, token: string): Promise<WorkCommand | null>;
 begin(id: string, token: string): Promise<boolean>;
 load(id: string): Promise<WorkerSnapshot>;
 fail(id: string, token: string, reason: 'transient_pre_effect' | 'permanent_pre_effect' | 'unknown' | 'recover'): Promise<string>;
 finish(id: string, token: string, result: WorkResult, version: number, decision: Decision): Promise<string>;
}
/** An adapter must guarantee this error means no external effect. Unknown errors never qualify. */
export class PreEffectFailure extends Error {
 constructor(public readonly transient: boolean) { super(transient ? 'transient_pre_effect' : 'permanent_pre_effect'); }
}
export interface MockWorkerAdapter {
 readonly mode: 'mock';
 /** Strictly no effects: preflight may fail, but cannot execute the command. */
 prepare(command: WorkCommand): Promise<void>;
 execute(command: WorkCommand): Promise<WorkResult>;
}
export function classifyWorkerFailure(error: unknown) {
 return error instanceof PreEffectFailure ? error.transient ? 'transient_pre_effect' as const : 'permanent_pre_effect' as const : 'unknown' as const;
}
/** One command per invocation; no scheduling, outbound or real domain adapters are installed. */
export async function runMockWorker(store: WorkerStore, id: string, adapter: MockWorkerAdapter) {
 if (adapter.mode !== 'mock') throw new Error('ONLY_MOCK_ADAPTERS_ALLOWED');
 return runCommandWorker(store,id,adapter);
}
/** Same Gate 2 execution protocol; callers supply a separately guarded adapter. */
export async function runCommandWorker(store: WorkerStore, id: string, adapter: Pick<MockWorkerAdapter, 'prepare' | 'execute'>) {
 const token=randomUUID();
 const command=await store.claim(id,token);
 if (!command) return 'not_claimed';
 try { await adapter.prepare(command); }
 catch(error) { return store.fail(id,token,classifyWorkerFailure(error)); }
 // Unknown response to BEGIN means do not execute. Recovery will conservatively classify it.
 if (!await store.begin(id,token)) return 'stale_claim';
 let result: WorkResult;
 try { result=await adapter.execute(command); }
 catch(error) { return store.fail(id,token,classifyWorkerFailure(error)); }
 if ((command.kind==='request_booking' && (result.type!=='booking' || !result.booking?.id || !result.booking.reference || !result.booking.status))
  || (command.kind==='request_quote' && result.type!=='quote')) return store.fail(id,token,'unknown');
 // Recompute against concurrent conversation changes, never re-execute the adapter.
 const confirmationToken=newConfirmationToken();
 for (let attempt=0;attempt<3;attempt++) {
  const snapshot=await store.load(id); const c=snapshot.conversation.flow;
  const context={eventId:id,expectedVersion:snapshot.conversation.version,now:new Date()};
  const decision=result.type==='quote' ? acceptDomainQuote(c,context,result.quote,confirmationToken)
   : acceptBookingResult(c,context,String(command.payload.commandId),result.booking);
  const outcome=await store.finish(id,token,result,snapshot.conversation.version,decision);
  if(outcome==='conflict') continue;
  if(outcome==='expired') return store.fail(id,token,'recover');
  return outcome;
 }
 // The effect is already possible; exhausting local CAS retries must never rerun it.
 return store.fail(id,token,'unknown');
}
/** DB clock, phase and fencing decide recovery; no local timeout guesses. */
export async function recoverMockCommand(store: WorkerStore,id:string) {
 return store.recover(id);
}
/** Bounded pass discovers expired claims, including legacy claims without execution evidence. */
export async function recoverDueMockCommands(store: WorkerStore) {
 const outcomes=[];
 for(const id of await store.due()) outcomes.push({id,result:await store.recover(id)});
 return outcomes;
}
