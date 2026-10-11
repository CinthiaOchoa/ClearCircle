import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotonTransport, MAX_IMAGE_BYTES, normalizeIncoming, readAttachment } from '../src/photon/adapter.ts';
const parent = '+15550001111', helper = '+15550002222';
const message = { id: 'm1', platform: 'imessage', direction: 'inbound', sender: { id: parent }, content: { type: 'text', text: 'START' } };
const dm = { id: 'dm1', type: 'dm' };
const stream = (bytes: Uint8Array[]) => new ReadableStream<Uint8Array>({ start(c) { for (const b of bytes) c.enqueue(b); c.close(); } });
test('SDK text normalization rejects outbound, other platforms, missing actor and unknown spaces', () => {
  assert.equal(normalizeIncoming(dm, message)?.text, 'START');
  assert.equal(normalizeIncoming(dm, { ...message, direction: 'outbound' }), null);
  assert.equal(normalizeIncoming(dm, { ...message, platform: 'slack' }), null);
  assert.equal(normalizeIncoming(dm, { ...message, sender: undefined }), null);
  assert.equal(normalizeIncoming({}, message), null);
  assert.equal(normalizeIncoming(null, null), null);
  assert.equal(normalizeIncoming({ id: 'group', type: 'group' }, message)?.isDirect, false);
});
test('authenticated SDK attachment is lazy and reads complete bounded bytes', async () => {
  let reads = 0;
  const m = normalizeIncoming(dm, { ...message, content: { type: 'attachment', mimeType: 'image/png', stream: async () => { reads++; return stream([Buffer.from('first'), Buffer.from('second')]); } } })!;
  assert.equal(reads, 0);
  const image = await m.readImage!();
  assert.equal(reads, 1);
  assert.equal(Buffer.from(image.data).toString(), 'firstsecond');
});
test('rejects URL-only, HEIC, empty and oversized photos and cancels oversized streams', async () => {
  assert.ok(normalizeIncoming(dm, { ...message, content: { type: 'attachment', mimeType: 'image/jpeg', url: 'http://localhost/secret' } })?.mediaError);
  await assert.rejects(readAttachment({ mimeType: 'image/heic' }), /Unsupported/);
  await assert.rejects(readAttachment({ mimeType: 'image/png', size: MAX_IMAGE_BYTES + 1 }), /6 MB/);
  await assert.rejects(readAttachment({ mimeType: 'image/png', stream: async () => stream([]) }), /Empty/);
  let cancelled = false;
  await assert.rejects(readAttachment({ mimeType: 'image/png', stream: async () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_IMAGE_BYTES + 1)); }, cancel() { cancelled = true; } }) }), /6 MB/);
  assert.equal(cancelled, true);
});
test('transport enforces private recipients and checks current group membership on every send', async () => {
  const sent: string[] = [];
  let ids = [parent, helper];
  const space = (type: string) => ({ type, send: async (text: string) => { sent.push(text); }, getMembers: async () => ids.map(id => ({ id })) });
  const access = { direct: async () => space('dm'), group: async () => space('group') };
  const transport = createPhotonTransport(access, parent, helper, 'family');
  await transport.sendToParticipant(parent, 'private');
  await transport.sendToFamily('approved');
  ids.push('stranger');
  await assert.rejects(transport.sendToFamily('blocked'), /only/);
  await assert.rejects(transport.sendToParticipant('stranger', 'blocked'), /Unauthorized/);
  assert.deepEqual(sent, ['private', 'approved']);
  const fallback = createPhotonTransport(access, parent, helper, null);
  await fallback.sendToFamily('handoff');
  assert.match(sent[2], /Direct-message fallback/);
});
test('delivery errors propagate so durable backend can retry', async () => {
  const space = { type: 'dm', send: async () => { throw new Error('offline'); }, getMembers: async () => [] };
  await assert.rejects(createPhotonTransport({ direct: async () => space, group: async () => space }, parent, helper, null).sendToParticipant(parent, 'hello'), /offline/);
});
test('a timed-out partial download is rejected rather than analyzed as a complete photo', async () => {
  let cancelled = false;
  await assert.rejects(readAttachment({ mimeType: 'image/png', stream: async () => new ReadableStream({ start(c) { c.enqueue(Buffer.from('partial')); }, cancel() { cancelled = true; } }) },10),/timed out/);
  assert.equal(cancelled,true);
});
