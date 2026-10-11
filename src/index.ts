import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Coordinator } from './core/coordinator.ts';
import { SqliteStore } from './db/sqlite.ts';
import { GeminiExtractor, DEFAULT_MODEL } from './ai/gemini.ts';
import { connectPhoton, normalizeIncoming } from './photon/adapter.ts';
import { processEscalations, processReminders } from './workers/reminders.ts';
import { createDashboardServer } from './api/server.ts';
import { flushOutbox } from './workers/outbox.ts';

for (const key of ['PROJECT_ID','PROJECT_SECRET','GEMINI_API_KEY','PARENT_ADDRESS','HELPER_ADDRESS']) if (!process.env[key]) throw new Error(`Missing ${key}`);
const parentId = process.env.PARENT_ADDRESS!, helperId = process.env.HELPER_ADDRESS!;
if (![parentId,helperId].every(id => /^\+[1-9]\d{7,14}$/.test(id)) || parentId === helperId) throw new Error('Use distinct E.164 family phone numbers');
const groupId = process.env.FAMILY_GROUP_ID || null;
const reminderSeconds = Number(process.env.DEMO_REMINDER_SECONDS ?? '0');
if (!Number.isFinite(reminderSeconds) || reminderSeconds < 0) throw new Error('Invalid DEMO_REMINDER_SECONDS');
const path = process.env.DATABASE_PATH || './data/clearcircle.sqlite';
mkdirSync(dirname(path),{ recursive: true, mode: 0o700 });
process.umask(0o077);
const store = new SqliteStore(path,parentId,helperId);
const { messages, transport, stop } = await connectPhoton(groupId,parentId,helperId);
const coordinator = new Coordinator(store,transport,new GeminiExtractor(process.env.GEMINI_API_KEY!,process.env.GEMINI_MODEL || DEFAULT_MODEL),{ parentId,helperId,groupId,reminderSeconds });
console.log('ClearCircle listening; group mode:',groupId ? 'configured; membership checked before sending' : 'labeled DM fallback');
const api = process.env.API_TOKEN ? createDashboardServer(store,parentId,helperId,process.env.API_TOKEN,!!groupId) : null;
if (api) {
  const port = Number(process.env.API_PORT || '8787');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API_PORT');
  api.listen(port,'127.0.0.1',() => console.log('Read-only dashboard API listening on loopback'));
}
let closing = false;
let working = false;
let worker: Promise<void> = Promise.resolve();
const tick = setInterval(() => {
  if (working || closing) return;
  working = true;
  worker = (async () => {
    await processReminders(store,transport,parentId,helperId);
    await processEscalations(store,transport,parentId,helperId,60*60*1000);
    await flushOutbox(store,transport,parentId,helperId);
  })().catch(() => console.error('Worker failed; queued deliveries remain retryable')).finally(() => { working = false; });
},5000);
const quit = async () => { if (closing) return; closing = true; clearInterval(tick); if (api) await new Promise<void>(resolve => api.close(() => resolve())); await stop(); };
process.once('SIGINT',() => void quit()); process.once('SIGTERM',() => void quit());
try {
  for await (const [space,message] of messages) {
    if (closing) break;
    const incoming = normalizeIncoming(space,message);
    if (!incoming) continue;
    try { await coordinator.handle(incoming); }
    catch { console.error('Inbound processing failed; no document or credentials logged'); }
  }
} finally { await quit(); await worker; store.close(); }
