import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GeminiExtractor, DEFAULT_MODEL } from '../../src/ai/gemini.ts';
import { connectPhoton } from '../../src/photon/adapter.ts';
test('live Gemini extracts the synthetic photo accurately', { skip: !process.env.GEMINI_API_KEY, timeout: 60_000 }, async () => {
  const extracted = await new GeminiExtractor(process.env.GEMINI_API_KEY!, process.env.GEMINI_MODEL || DEFAULT_MODEL).extract({ mimeType: 'image/png', data: readFileSync(new URL('../../fixtures/utility-notice.png', import.meta.url)) });
  assert.equal(extracted.needsReview, false);
  assert.equal(extracted.deadline, '2026-10-15');
  assert.equal(extracted.amount, 86.40);
  assert.equal(extracted.currency, 'USD');
  assert.ok(extracted.requiredActionEs);
});
test('live Photon authenticates and shuts down (does not verify delivery)', { skip: !process.env.PROJECT_ID || !process.env.PROJECT_SECRET || !process.env.PARENT_ADDRESS || !process.env.HELPER_ADDRESS, timeout: 45_000 }, async () => {
  const connection = await connectPhoton(process.env.FAMILY_GROUP_ID || null, process.env.PARENT_ADDRESS!, process.env.HELPER_ADDRESS!);
  try { assert.ok(connection.messages); } finally { await connection.stop(); }
});
