import assert from "node:assert/strict";
import { test } from "node:test";
import { processInbound, type ProcessingInput } from "./processor";
import { newConversation } from "./conversation";
function input(): ProcessingInput {
 const flow=newConversation('test',{wabaId:'1',phoneNumberId:'2',waId:'31612345678'});
 return {message:{id:'message',text_body:'data'},conversation:{id:'test',waba_id:'1',phone_number_id:'2',wa_id:'31612345678',version:0,state:'active',booking_draft:{},flow},processed:false};
}
test('processor bounds conflicts to three fresh reads and computations',async()=>{
 let loads=0,decodes=0,commits=0;
 await assert.rejects(processInbound({async load(){loads++;return input();},async commit(){commits++;return 'conflict';}},'message',()=>{decodes++;return {type:'handoff'};}),/RETRY_EXHAUSTED/);
 assert.deepEqual([loads,decodes,commits],[3,3,3]);
});
test('unknown commit failure never automatically repeats a command',async()=>{
 let calls=0;
 await assert.rejects(processInbound({async load(){return input();},async commit(){calls++;throw new Error('connection lost');}},'message',()=>({type:'handoff'})),/connection lost/);
 assert.equal(calls,1);
});
