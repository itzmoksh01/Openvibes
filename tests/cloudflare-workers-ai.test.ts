import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CloudflareWorkersAiProvider } from '../src/providers/cloudflare-workers-ai.js';

test('Cloudflare provider refuses missing account credentials', async () => {
  const provider = new CloudflareWorkersAiProvider(undefined, undefined, tmpdir());
  await assert.rejects(() => provider.generateText('hello'), /CLOUDFLARE_ACCOUNT_ID_MISSING_OR_INVALID/);
});

test('Cloudflare text generation uses the configured account, token and model', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.pathname, '/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/run/@cf/meta/llama-3.1-8b-instruct');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer cf_test_token');
    assert.deepEqual(JSON.parse(String(init?.body)), { prompt: 'hello' });
    return Response.json({ success: true, result: { response: 'Hello there' } });
  }) as typeof fetch;
  try {
    const provider = new CloudflareWorkersAiProvider('0123456789abcdef0123456789abcdef', 'cf_test_token', tmpdir());
    const result = await provider.generateText('hello') as { response: string };
    assert.equal(result.response, 'Hello there');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Cloudflare FLUX base64 image is saved and hashed', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-cf-'));
  const originalFetch = globalThis.fetch;
  const bytes = Buffer.from([1, 3, 3, 7]);
  globalThis.fetch = (async () => Response.json({ success: true, result: { image: bytes.toString('base64') } })) as typeof fetch;
  try {
    const provider = new CloudflareWorkersAiProvider('0123456789abcdef0123456789abcdef', 'cf_test_token', directory);
    const output = await provider.generateImage('a test image');
    assert.equal(output.mimeType, 'image/jpeg');
    assert.deepEqual(await readFile(output.path), bytes);
    assert.match(output.sha256, /^[a-f0-9]{64}$/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
