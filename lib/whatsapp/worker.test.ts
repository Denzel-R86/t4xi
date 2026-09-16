import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyWorkerFailure, PreEffectFailure, runMockWorker, type WorkerStore, type MockWorkerAdapter } from './worker';
test('only explicit pre-effect evidence can make a failure retryable',()=>{
 assert.equal(classifyWorkerFailure(new PreEffectFailure(true)),'transient_pre_effect');
 assert.equal(classifyWorkerFailure(new PreEffectFailure(false)),'permanent_pre_effect');
 for(const e of [new Error('timeout'),new Error('network'),{transient:true},null]) assert.equal(classifyWorkerFailure(e),'unknown');
});
test('unconfirmed execution marker never invokes adapter',async()=>{
 let effects=0;const store:WorkerStore={async due(){throw new Error('unexpected');},async recover(){throw new Error('unexpected');},async load(){throw new Error('unexpected');},async fail(){throw new Error('unexpected');},async finish(){throw new Error('unexpected');},async claim(){return {id:'id',kind:'request_booking',payload:{},claim_token:'token',attempt:1};},async begin(){throw new Error('commit response lost');}};
 const adapter:MockWorkerAdapter={mode:'mock',async prepare(){},async execute(){effects++;return {type:'booking',booking:{id:'fake',reference:'fake',status:'pending'}};}};
 await assert.rejects(runMockWorker(store,'id',adapter),/commit response lost/);assert.equal(effects,0);
});
test('production adapters are refused before claim',async()=>{
 await assert.rejects(runMockWorker({} as WorkerStore,'id',{mode:'real'} as unknown as MockWorkerAdapter),/ONLY_MOCK/);
});
