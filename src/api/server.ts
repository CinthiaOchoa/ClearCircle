import { createServer, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { TaskStore } from '../core/types.ts';
export function createDashboardServer(store: TaskStore, parentId: string, helperId: string, token: string, groupMode: boolean): Server {
  if (token.length < 32) throw new Error('API_TOKEN must contain at least 32 characters');
  return createServer((req,res) => {
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    const bearer = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (bearer.length !== expected.length || !timingSafeEqual(bearer,expected)) {
      res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    if (req.method !== 'GET') { res.writeHead(405,{ Allow: 'GET' }); res.end(JSON.stringify({ error: 'Read-only API' })); return; }
    if (req.url === '/api/health') { res.end(JSON.stringify({ ok: true, pendingDeliveries: store.pendingCount() })); return; }
    if (req.url !== '/api/family') { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return; }
    const tasks = store.listTasks(parentId).slice(0,100).map(({ id,status,sender,action,actionEs,deadline,amount,currency,evidence,reminderAt,reminderSentAt,createdAt,offeredAt,completedAt }) => ({ id,status,sender,action,actionEs,deadline,amount,currency,evidence,reminderAt,reminderSentAt,createdAt,offeredAt,completedAt }));
    res.end(JSON.stringify({ mode: 'live', groupMode, generatedAt: Date.now(), pendingDeliveries: store.pendingCount(), participants: [{ role: 'parent', consented: !!store.participant(parentId)?.consented },{ role: 'helper', consented: !!store.participant(helperId)?.consented }], tasks }));
  });
}
