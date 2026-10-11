import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GeminiExtractor } from '../src/ai/gemini.ts';
import { Coordinator } from '../src/core/coordinator.ts';
import { SqliteStore } from '../src/db/sqlite.ts';
import { createPhotonTransport, normalizeIncoming } from '../src/photon/adapter.ts';
test('SDK-shaped image runs through Photon normalization, Gemini validation, consented handoff and reported completion', async () => {
  const parent = '+15550001111', helper = '+15550002222';
  const store = new SqliteStore(':memory:',parent,helper);
  const sent: { to: string; body: string }[] = [];
  const space = (to: string, type: 'dm'|'group') => ({ type, getMembers: async () => [{ id: parent },{ id: helper }], send: async (body: string) => { sent.push({ to,body }); } });
  const transport = createPhotonTransport({ direct: async id => space(id,'dm'),group: async id => space(id,'group') },parent,helper,'family');
  const originalText = 'Synthetic Utility. USD 86.40. Please contact us by October 15, 2026.';
  const extractor = new GeminiExtractor('synthetic', 'test-model', async () => ({ text: JSON.stringify({ documentType: 'utility', sender: 'Synthetic Utility', purpose: 'Notice', purposeEs: 'Aviso de saldo pendiente', requiredAction: 'Contact the company', requiredActionEs: 'Comunícate con la compañía', deadline: '2026-10-15', amount: 86.40, currency: 'USD', contactPhone: null, referenceNumber: null, originalText, evidence: [{ field: 'sender',quote: 'Synthetic Utility' },{ field: 'amount',quote: 'USD 86.40' },{ field: 'currency',quote: 'USD 86.40' },{ field: 'requiredAction',quote: 'Please contact us by October 15, 2026.' },{ field: 'deadline',quote: 'Please contact us by October 15, 2026.' }], needsReview: false }) }));
  const coordinator = new Coordinator(store,transport,extractor,{ parentId: parent,helperId: helper,groupId: 'family',reminderSeconds: 60 });
  let seq = 0, downloads = 0;
  const send = async (id: string, content: unknown, group = false) => {
    const inbound = normalizeIncoming({ id: group ? 'family' : `${id}-dm`,type: group ? 'group' : 'dm' },{ id: `pipe${++seq}`,direction: 'inbound',platform: 'imessage',sender: { id },content });
    assert.ok(inbound); await coordinator.handle(inbound);
  };
  try {
    await send(parent,{ type: 'text',text: 'START' }); await send(helper,{ type: 'text',text: 'JOIN' });
    await send(parent,{ type: 'attachment',mimeType: 'image/png',stream: async () => { downloads++; return new ReadableStream({ start(c) { c.enqueue(readFileSync(new URL('../fixtures/utility-notice.png',import.meta.url))); c.close(); } }); } });
    const task = store.latestForParent(parent)!; assert.equal(task.status,'EXPLAINED'); assert.equal(downloads,1); assert.equal(sent.some(m => m.to === 'family'),false);
    await send(parent,{ type: 'text',text: `SÍ ${task.id}` }); assert.ok(sent.some(m => m.to === 'family' && m.body.includes(task.id)));
    await send(helper,{ type: 'text',text: `CLAIM ${task.id}` },true);
    await send(helper,{ type: 'text',text: `DONE ${task.id} — I called the company` },true);
    assert.equal(store.byId(task.id)?.status,'DONE'); assert.equal(store.byId(task.id)?.completionNote,'I called the company'); assert.ok(sent.some(m => m.to === parent && m.body.includes('no confirma')));
  } finally { store.close(); }
});
