// Synthetic-only integration fixture. It exercises the real coordinator + SQLite + HTTP API.
// This is never imported by production code and never contacts Photon or Gemini.
import { SqliteStore } from '../../src/db/sqlite.ts';
import { Coordinator } from '../../src/core/coordinator.ts';
import { createDashboardServer } from '../../src/api/server.ts';
import type { Extraction } from '../../src/core/types.ts';
const parent = '+15550001111', helper = '+15550002222';
const store = new SqliteStore(':memory:',parent,helper);
const extracted: Extraction = { documentType: 'utility', sender: 'Peach State Utilities', purpose: 'Past-due notice', purposeEs: 'Aviso de saldo pendiente', requiredAction: 'Contact the utility company about the past-due balance.', requiredActionEs: 'Comunícate con la compañía sobre el saldo pendiente.', deadline: '2026-10-15', amount: 86.40, currency: 'USD', contactPhone: null, referenceNumber: null, evidence: [{ field: 'requiredAction', quote: 'Please contact us by October 15, 2026.' },{ field: 'deadline', quote: 'Please contact us by October 15, 2026.' }], needsReview: false };
const coordinator = new Coordinator(store,{ sendToParticipant: async () => {}, sendToFamily: async () => {} },{ extract: async () => extracted },{ parentId: parent, helperId: helper, groupId: null, reminderSeconds: 60 });
let seq = 0;
const send = (actorId: string, text?: string, photo = false) => coordinator.handle({ actorId, messageId: `fixture-${++seq}`, spaceId: `${actorId}-dm`, isDirect: true, text, image: photo ? { mimeType: 'image/png',data: Buffer.from('synthetic') } : undefined });
await send(parent,'START'); await send(helper,'JOIN'); await send(parent,undefined,true);
const completed = store.latestForParent(parent)!;
await send(parent,'SÍ'); await send(helper,`CLAIM ${completed.id}`); await send(helper,`DONE ${completed.id} — I contacted the company`);
await send(parent,undefined,true);
const token = process.env.CLEARCIRCLE_API_TOKEN || 'synthetic-test-token-not-a-credential-0001';
const server = createDashboardServer(store,parent,helper,token,false);
server.listen(8788,'127.0.0.1',() => console.log('Synthetic test API listening'));
const close = () => server.close(() => { store.close(); process.exit(0); });
process.once('SIGTERM',close); process.once('SIGINT',close);
