import test from 'node:test';
import assert from 'node:assert/strict';
import { SqliteStore } from '../src/db/sqlite.ts';
import { createDashboardServer } from '../src/api/server.ts';
const parent = '+15550001111', helper = '+15550002222';
test('dashboard requires auth, is read-only, and excludes recipient addresses and completion notes', async () => {
  const store = new SqliteStore(':memory:',parent,helper); store.optIn(parent,'private-dm');
  const token = 'test-token-'.repeat(5);
  const server = createDashboardServer(store,parent,helper,token,false);
  await new Promise<void>(r => server.listen(0,'127.0.0.1',r));
  const addr = server.address(); assert.ok(addr && typeof addr !== 'string');
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    assert.equal((await fetch(`${base}/api/family`)).status,401);
    assert.equal((await fetch(`${base}/api/family`,{ headers: { Authorization: 'Bearer bad' } })).status,401);
    const headers = { Authorization: `Bearer ${token}` };
    const response = await fetch(`${base}/api/family`,{ headers }); assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
    const text = await response.text(); assert.equal(text.includes(parent),false); assert.equal(text.includes('private-dm'),false);
    const data = JSON.parse(text); assert.equal(data.mode,'live'); assert.equal(data.participants[0].consented,true); assert.equal(data.participants[1].consented,false);
    assert.equal((await fetch(`${base}/api/family`,{ method: 'POST',headers })).status,405);
    assert.equal((await fetch(`${base}/unknown`,{ headers })).status,404);
    assert.equal((await fetch(`${base}/api/health`,{ headers })).status,200);
  } finally { await new Promise<void>(r => server.close(() => r())); store.close(); }
});
test('weak dashboard token and database family changes are rejected', () => {
  const store = new SqliteStore(':memory:',parent,helper);
  assert.throws(() => createDashboardServer(store,parent,helper,'weak',false)); store.close();
  assert.throws(() => new SqliteStore(':memory:',parent,parent));
});
