import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteStore } from '../src/db/sqlite.ts';
import { Coordinator } from '../src/core/coordinator.ts';
import { processEscalations, processReminders } from '../src/workers/reminders.ts';
import { flushOutbox } from '../src/workers/outbox.ts';
import type { Extraction, Inbound, Messenger } from '../src/core/types.ts';
const parent = '+15550001111', helper = '+15550002222';
const extraction: Extraction = { documentType: 'utility', sender: 'Fictional Utility', purpose: 'Notice', purposeEs: 'Aviso', requiredAction: 'Contact the company', requiredActionEs: 'Contacta la compañía', deadline: '2026-10-15', amount: null, currency: null, contactPhone: null, referenceNumber: null, evidence: [{ field: 'requiredAction', quote: 'Contact the company' }], needsReview: false };
function rig(path = ':memory:') {
  const store = new SqliteStore(path,parent,helper);
  const sent: { to: string; body: string }[] = [];
  let offline = false, reads = 0;
  const transport: Messenger = { sendToParticipant: async (to,body) => { if (offline) throw new Error('offline'); sent.push({ to,body }); }, sendToFamily: async body => { if (offline) throw new Error('offline'); sent.push({ to: 'family',body }); } };
  const coordinator = new Coordinator(store,transport,{ extract: async () => { reads++; return extraction; } },{ parentId: parent, helperId: helper, groupId: 'family', reminderSeconds: 1 });
  let seq = 0;
  const msg = (actorId: string, text?: string, more: Partial<Inbound> = {}) => ({ actorId, text, messageId: `m${++seq}`, spaceId: actorId === parent ? 'parent-dm' : 'helper-dm', isDirect: true, ...more });
  const send = (actor: string, text?: string, more?: Partial<Inbound>) => coordinator.handle(msg(actor,text,more));
  const setup = async () => { await send(parent,'START'); await send(helper,'JOIN'); await send(parent,undefined,{ image: { data: Buffer.from('fake'), mimeType: 'image/png' } }); return store.latestForParent(parent)!; };
  return { store,transport,coordinator,sent,msg,send,setup,offline: (v: boolean) => { offline = v; }, reads: () => reads };
}
test('unauthorized and non-consenting attachments never read provider bytes', async () => {
  const r = rig(); let reads = 0;
  const readImage = async () => { reads++; return { mimeType: 'image/png' as const, data: Buffer.from('fake') }; };
  await r.send('stranger',undefined,{ readImage }); await r.send(parent,undefined,{ readImage });
  assert.equal(reads,0); assert.equal(r.reads(),0); r.store.close();
});
test('unrecognized groups cannot enroll, approve or extract; known group still cannot approve', async () => {
  const r = rig(); await r.send(parent,'START',{ isDirect: false, spaceId: 'other-group' });
  assert.equal(r.store.participant(parent)?.consented,false);
  const t = await r.setup();
  await r.send(parent,'SÍ',{ isDirect: false, spaceId: 'family' });
  await r.send(parent,undefined,{ isDirect: false, spaceId: 'other-group', image: { data: Buffer.from('fake'), mimeType: 'image/png' } });
  assert.equal(r.store.byId(t.id)?.status,'EXPLAINED'); assert.equal(r.reads(),1); r.store.close();
});
test('concurrent duplicate images create one task, and a second active letter cannot overwrite approval target', async () => {
  const r = rig(); await r.send(parent,'START'); await r.send(helper,'JOIN');
  const m = r.msg(parent,undefined,{ image: { data: Buffer.from('fake'), mimeType: 'image/png' } });
  await Promise.all([r.coordinator.handle(m),r.coordinator.handle(m)]);
  const first = r.store.latestForParent(parent)!;
  await r.send(parent,undefined,{ image: m.image });
  assert.equal(r.reads(),1); assert.equal(r.store.listTasks(parent).length,1);
  await r.send(parent,`SÍ ${first.id}`); assert.equal(r.store.byId(first.id)?.status,'OFFERED'); r.store.close();
});
test('malformed task IDs never fall back to another task', async () => {
  const r = rig(); const t = await r.setup();
  await r.send(parent,'SÍ CC-BAD'); assert.equal(r.store.byId(t.id)?.status,'EXPLAINED');
  await r.send(parent,'SÍ'); await r.send(helper,`CLAIM ${t.id}`);
  await r.send(helper,'DONE CC-NOTVALID — I called the company'); assert.equal(r.store.byId(t.id)?.status,'CLAIMED');
  await r.send(helper,`DONE ${t.id}`); assert.equal(r.store.byId(t.id)?.status,'CLAIMED'); r.store.close();
});
test('atomic claim succeeds once, rejects unauthorized helper and forbids terminal transitions', async () => {
  const r = rig(); const t = await r.setup(); await r.send(parent,'SÍ');
  assert.equal(r.store.claim(t.id,'stranger',Date.now()),null);
  assert.ok(r.store.claim(t.id,helper,Date.now())); assert.equal(r.store.claim(t.id,helper,Date.now()),null);
  r.store.transition(t.id,['CLAIMED'],'DONE'); assert.throws(() => r.store.transition(t.id,['DONE'],'CLAIMED')); r.store.close();
});
test('failed handoff persists and retries after restart; escalation clock begins at actual delivery', async () => {
  const dir = mkdtempSync(join(tmpdir(),'cc-')); const path = join(dir,'tasks.sqlite');
  try {
    const r = rig(path); const t = await r.setup(); r.offline(true); await r.send(parent,'SÍ');
    assert.equal(r.store.byId(t.id)?.offeredAt,null); assert.ok(r.store.pendingCount() >= 1);
    await processEscalations(r.store,r.transport,parent,helper,1,Date.now()+10_000);
    assert.equal(r.store.byId(t.id)?.status,'OFFERED'); r.store.close();
    const reopened = new SqliteStore(path,parent,helper); const sent: string[] = [];
    const transport = { sendToParticipant: async () => {}, sendToFamily: async (body: string) => { sent.push(body); } };
    const now = Date.now()+60_000;
    await flushOutbox(reopened,transport,parent,helper,now);
    assert.equal(sent.length,1); assert.equal(reopened.byId(t.id)?.offeredAt,now);
    await processEscalations(reopened,transport,parent,helper,60_000,now+60_001);
    assert.equal(reopened.byId(t.id)?.status,'ESCALATED'); reopened.close();
  } finally { rmSync(dir,{ recursive: true, force: true }); }
});
test('failed reminder is retried, not silently lost or queued twice', async () => {
  const r = rig(); const t = await r.setup(); await r.send(parent,'SÍ'); await r.send(helper,`CLAIM ${t.id}`);
  r.offline(true); const now = Date.now()+5000;
  await processReminders(r.store,r.transport,parent,helper,now);
  assert.equal(r.store.byId(t.id)?.reminderSentAt,null); assert.equal(r.store.byId(t.id)?.status,'REMINDED');
  r.offline(false); await processReminders(r.store,r.transport,parent,helper,now+5000);
  assert.equal(r.sent.filter(m => m.body.includes('ClearCircle reminder')).length,1);
  assert.ok(r.store.byId(t.id)?.reminderSentAt); r.store.close();
});
test('opt-out cancels shared tasks and suppresses queued sensitive handoffs', async () => {
  const r = rig(); const t = await r.setup(); r.offline(true); await r.send(parent,'SÍ'); await r.send(helper,'STOP');
  assert.equal(r.store.byId(t.id)?.status,'CANCELLED'); assert.equal(r.store.participant(helper)?.consented,false);
  r.offline(false); await flushOutbox(r.store,r.transport,parent,helper,Date.now()+60_000);
  assert.equal(r.sent.filter(m => m.to === 'family').length,0);
  await r.send(helper,`CLAIM ${t.id}`); assert.equal(r.store.byId(t.id)?.status,'CANCELLED'); r.store.close();
});
test('cancelled reminder cannot be sent on retry', async () => {
  const r = rig(); const t = await r.setup(); await r.send(parent,'SÍ'); await r.send(helper,`CLAIM ${t.id}`); r.offline(true);
  await processReminders(r.store,r.transport,parent,helper,Date.now()+5000);
  await r.send(parent,`CANCELAR ${t.id}`); r.offline(false); await flushOutbox(r.store,r.transport,parent,helper,Date.now()+60_000);
  assert.equal(r.sent.filter(m => m.body.includes('ClearCircle reminder')).length,0); r.store.close();
});
test('task, event and outbox mutations roll back together on error', () => {
  const r = rig();
  assert.throws(() => r.store.transaction(() => { r.store.optIn(parent,'dm'); r.store.recordEvent('rollback',parent,'test'); r.store.enqueue({ id: 'bad', recipient: parent, body: 'private', taskId: null, allowedStatus: null, requireConsent: true }); throw new Error('crash'); }));
  assert.equal(r.store.seen('rollback'),false); assert.equal(r.store.participant(parent)?.consented,false); assert.equal(r.store.pendingCount(),0); r.store.close();
});
test('leased sends cannot be dispatched by overlapping workers', async () => {
  const r = rig(); await r.send(parent,'START');
  r.store.enqueue({ id: 'test', recipient: parent, body: 'one', taskId: null, allowedStatus: null, requireConsent: true });
  let release!: () => void; let calls = 0;
  const transport = { sendToParticipant: async () => { calls++; await new Promise<void>(r => { release = r; }); }, sendToFamily: async () => {} };
  const first = flushOutbox(r.store,transport,parent,helper);
  await flushOutbox(r.store,transport,parent,helper); assert.equal(calls,1); release(); await first; r.store.close();
});
