import { Spectrum } from '@spectrum-ts/core';
import { imessage } from '@spectrum-ts/imessage';
import type { ImageInput, Inbound, Messenger } from '../core/types.ts';

export const MAX_IMAGE_BYTES = 6_000_000;
const acceptedMime = ['image/jpeg', 'image/png', 'image/webp'] as const;
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;

// Spectrum attachments are lazy SDK objects with stream()/read(), not inline bytes.
// Use its authenticated stream, never fetch a message-supplied URL. Read only AFTER consent.
export async function readAttachment(content: Record<string, unknown>, timeoutMs = 30_000): Promise<ImageInput> {
  const mimeType = content.mimeType as ImageInput['mimeType'];
  if (!acceptedMime.includes(mimeType)) throw new Error('Unsupported image; send JPEG, PNG or WebP');
  if (typeof content.size === 'number' && content.size > MAX_IMAGE_BYTES) throw new Error('Image exceeds 6 MB');
  if (typeof content.stream !== 'function') throw new Error('Attachment has no authenticated SDK stream');
  const stream = await content.stream() as ReadableStream<Uint8Array>;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, timeoutMs);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error('Invalid attachment bytes');
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) throw new Error('Image exceeds 6 MB');
      chunks.push(value);
    }
    if (timedOut) throw new Error('Attachment download timed out');
    if (size === 0) throw new Error('Empty attachment');
    return { data: Buffer.concat(chunks, size), mimeType };
  } finally {
    clearTimeout(timeout);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function normalizeIncoming(space: unknown, message: unknown): Inbound | null {
  const s = record(space), m = record(message);
  if (!s || !m || m.direction !== 'inbound' || m.platform !== 'imessage' ||
      typeof m.id !== 'string' || typeof s.id !== 'string' || !['dm', 'group'].includes(String(s.type))) return null;
  const sender = record(m.sender);
  if (typeof sender?.id !== 'string') return null;
  const content = record(m.content);
  if (!content) return null;
  const base = { messageId: m.id, actorId: sender.id, spaceId: s.id, isDirect: s.type === 'dm' };
  if (content.type === 'text' && typeof content.text === 'string') return { ...base, text: content.text };
  if (content.type === 'attachment') {
    if (!acceptedMime.includes(content.mimeType as ImageInput['mimeType']) || typeof content.stream !== 'function')
      return { ...base, mediaError: 'Send a JPEG, PNG or WebP photo (up to 6 MB).' };
    return { ...base, readImage: () => readAttachment(content) };
  }
  // Voice, reactions and rich cards remain on the roadmap; they cannot claim tasks.
  return null;
}

type SendSpace = { type: string; send(text: string): Promise<unknown>; getMembers(): Promise<{ id: string }[]> };
export type PhotonAccess = { direct(id: string): Promise<SendSpace>; group(id: string): Promise<SendSpace> };
export function createPhotonTransport(access: PhotonAccess, parentId: string, helperId: string, groupId: string | null): Messenger {
  return {
    async sendToParticipant(id, text) {
      if (![parentId, helperId].includes(id)) throw new Error('Unauthorized recipient');
      const space = await access.direct(id);
      if (space.type !== 'dm') throw new Error('Participant destination is not private');
      await space.send(text);
    },
    async sendToFamily(text) {
      if (!groupId) {
        const space = await access.direct(helperId);
        if (space.type !== 'dm') throw new Error('Fallback destination is not private');
        await space.send(`[Direct-message fallback · no group configured]\n${text}`);
        return;
      }
      const space = await access.group(groupId);
      if (space.type !== 'group') throw new Error('FAMILY_GROUP_ID is not a group');
      const ids = (await space.getMembers()).map(member => member.id);
      if (ids.length !== 2 || !ids.includes(parentId) || !ids.includes(helperId))
        throw new Error('Family group must contain only the configured parent and helper (excluding the agent)');
      await space.send(text);
    }
  };
}

export async function connectPhoton(groupId: string | null, parentId: string, helperId: string) {
  if (!process.env.PROJECT_ID || !process.env.PROJECT_SECRET) throw new Error('Photon credentials are not set');
  const line = process.env.PHOTON_LINE_NUMBER;
  if (line && !/^\+[1-9]\d{7,14}$/.test(line)) throw new Error('Invalid PHOTON_LINE_NUMBER');
  const app = await Spectrum({ projectId: process.env.PROJECT_ID, projectSecret: process.env.PROJECT_SECRET,
    providers: [imessage.config()] });
  const im = imessage(app);
  const transport = createPhotonTransport({
    direct: async id => im.space.create(await im.user(id), line ? { phone: line } : {}),
    group: async id => im.space.get(id, line ? { phone: line } : {})
  }, parentId, helperId, groupId);
  return { messages: app.messages, transport, stop: () => app.stop() };
}
