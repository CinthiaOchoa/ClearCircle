import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../src/db/sqlite.ts';
import { Coordinator } from '../src/core/coordinator.ts';
import { canTransition } from '../src/core/state-machine.ts';
import { processReminders } from '../src/workers/reminders.ts';
import type { Extraction, Extractor, Messenger, TaskStore } from '../src/core/types.ts';

const parent='+15550001111',helper='+15550002222';
const extracted:Extraction={documentType:'utility',sender:'Peach State Utilities',purpose:'Past-due notice',purposeEs:'Aviso de saldo pendiente',
 requiredAction:'Contact the utility company',requiredActionEs:'Comunicarte con la compañía de servicios',
 deadline:'2026-10-15',amount:86.40,currency:'USD',contactPhone:null,referenceNumber:null,
 evidence:[{field:'requiredAction',quote:'Please contact us by October 15, 2026.'},{field:'deadline',quote:'Please contact us by October 15, 2026.'}],needsReview:false};
function rig(value:Extraction=extracted){
 const store=new SqliteStore(':memory:',parent,helper);
 const sent:{to:string;body:string}[]=[];
 const messenger:Messenger={sendToParticipant:async(to,body)=>{sent.push({to,body});},sendToFamily:async(body)=>{sent.push({to:'group',body});}};
 const extractor:Extractor={extract:async()=>value};
 const coordinator=new Coordinator(store,messenger,extractor,{parentId:parent,helperId:helper,groupId:'family-group',reminderSeconds:1});
 let seq=0;
 const send=async(actorId:string,spaceId:string,text?:string,image=false)=>{
  await coordinator.handle({actorId,spaceId,isDirect:spaceId!=='family-group',messageId:`m-${++seq}`,text,image:image?{data:new Uint8Array([1]),mimeType:'image/jpeg'}:undefined});
 };
 return {store,sent,send};
}
test('only valid transitions are permitted',()=>{
 assert.equal(canTransition('EXPLAINED','OFFERED'),true);
 assert.equal(canTransition('DONE','CLAIMED'),false);
});
test('complete consented family loop with reminder, duplicate prevention and cancellation safety',async()=>{
 const r=rig();
 await r.send(parent,'parent-dm','START');
 await r.send(helper,'helper-dm','JOIN');
 await r.send(parent,'parent-dm',undefined,true);
 let task=r.store.latestForParent(parent)!;
 assert.equal(task.status,'EXPLAINED');
 await r.send(parent,'parent-dm','SÍ');
 assert.equal(r.store.byId(task.id)?.status,'OFFERED');
 assert.equal(r.sent.some(x=>x.to==='group'),true);
 await r.send(helper,'family-group',`CLAIM ${task.id}`);
 assert.equal(r.store.byId(task.id)?.status,'CLAIMED');
 await processReminders(r.store,{sendToParticipant:async(to,body)=>{r.sent.push({to,body});},sendToFamily:async()=>{}},parent,helper,Date.now()+2000);
 assert.equal(r.store.byId(task.id)?.status,'REMINDED');
 const n=r.sent.length;
 await processReminders(r.store,{sendToParticipant:async(to,body)=>{r.sent.push({to,body});},sendToFamily:async()=>{}},parent,helper,Date.now()+2000);
 assert.equal(r.sent.length,n);
 await r.send(helper,'family-group',`DONE ${task.id} — I called the utility provider`);
 task=r.store.byId(task.id)!;
 assert.equal(task.status,'DONE');
 assert.ok(r.sent.some(x=>x.to===parent&&x.body.includes('no confirma')));
 r.store.close();
});
test('no handoff until helper opts in',async()=>{
 const r=rig();await r.send(parent,'parent-dm','START');await r.send(parent,'parent-dm',undefined,true);
 await r.send(parent,'parent-dm','SÍ');
 assert.equal(r.store.latestForParent(parent)?.status,'EXPLAINED');
 assert.equal(r.sent.some(x=>x.to==='group'),false);r.store.close();
});
test('cannot complete an unclaimed task or claim a cancelled task',async()=>{
 const r=rig();await r.send(parent,'parent-dm','START');await r.send(helper,'helper-dm','JOIN');
 await r.send(parent,'parent-dm',undefined,true);const task=r.store.latestForParent(parent)!;
 await r.send(helper,'helper-dm',`DONE ${task.id} — called`);
 assert.equal(r.store.byId(task.id)?.status,'EXPLAINED');
 await r.send(parent,'parent-dm','SÍ');await r.send(parent,'parent-dm','CANCELAR');
 await r.send(helper,'family-group',`CLAIM ${task.id}`);
 assert.equal(r.store.byId(task.id)?.status,'CANCELLED');r.store.close();
});
test('uncertain document requests a new photo without a guess',async()=>{
 const r=rig({...extracted,needsReview:true,deadline:null});
 await r.send(parent,'parent-dm','START');await r.send(parent,'parent-dm',undefined,true);
 assert.equal(r.store.latestForParent(parent)?.status,'NEEDS_REVIEW');
 assert.ok(r.sent.some(x=>x.body.includes('foto más clara')));
 r.store.close();
});
test('duplicate message ID is ignored',async()=>{
 const r=rig();await r.send(parent,'parent-dm','START');
 const first={actorId:parent,spaceId:'parent-dm',isDirect:true,messageId:'same-id',image:{data:new Uint8Array([1]),mimeType:'image/jpeg' as const}};
 const coordinator=new Coordinator(r.store,{sendToParticipant:async(to,body)=>{r.sent.push({to,body});},sendToFamily:async()=>{}},
  {extract:async()=>extracted},{parentId:parent,helperId:helper,groupId:'family-group',reminderSeconds:1});
 await coordinator.handle(first);const sentCount=r.sent.length;
 await coordinator.handle(first);
 assert.equal(r.sent.length,sentCount);
 r.store.close();
});
