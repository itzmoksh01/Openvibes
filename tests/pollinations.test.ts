import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PollinationsProvider } from '../src/providers/pollinations.js';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});

test('public model catalogue works without a generation key', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.pathname, '/image/models');
    return json([{ name: 'example-image-model' }]);
  }) as typeof fetch;
  try {
    const provider = new PollinationsProvider(undefined, tmpdir());
    assert.deepEqual(await provider.listModels('image'), [{ name: 'example-image-model' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('text generation requires a user-owned key and sends it only as bearer auth', async () => {
  const missing = new PollinationsProvider(undefined, tmpdir());
  await assert.rejects(() => missing.generateText('hello', 'test/model'), /POLLINATIONS_API_KEY_MISSING/);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer sk_test_secret');
    const body = JSON.parse(String(init?.body)) as { model: string };
    assert.equal(body.model, 'test/model');
    return json({ choices: [{ message: { content: 'hello back' } }] });
  }) as typeof fetch;
  try {
    const provider = new PollinationsProvider('sk_test_secret', tmpdir());
    const result = await provider.generateText('hello', 'test/model') as { choices: Array<{ message: { content: string } }> };
    assert.equal(result.choices[0]?.message.content, 'hello back');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('image generation downloads bytes and computes a stable SHA-256', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-polli-'));
  const originalFetch = globalThis.fetch;
  const bytes = Buffer.from([9, 8, 7, 6]);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.pathname, '/image/a%20quiet%20lake');
    assert.equal(url.searchParams.get('model'), 'test/image');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer sk_test');
    return new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } });
  }) as typeof fetch;
  try {
    const provider = new PollinationsProvider('sk_test', directory);
    const result = await provider.generateMedia('image', 'a quiet lake', 'test/image');
    assert.equal(result.mimeType, 'image/png');
    assert.deepEqual(await readFile(result.path), bytes);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});

test('video async job is polled and its result is downloaded', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-polli-video-'));
  const originalFetch = globalThis.fetch;
  const originalTimeout = globalThis.setTimeout;
  let statusCalls = 0;
  const videoBytes = Buffer.from([0, 0, 0, 1, 2, 3]);
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void) => {
    queueMicrotask(() => callback());
    return 0 as unknown as NodeJS.Timeout;
  }) as typeof setTimeout;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.startsWith('/video/')) return json({ id: 'job-123', status: 'pending', status_url: '/v1/jobs/job-123' }, 202);
    if (url.pathname === '/v1/jobs/job-123') {
      statusCalls++;
      return json({ status: 'succeeded' });
    }
    if (url.pathname === '/v1/jobs/job-123/result') {
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer sk_test');
      return new Response(videoBytes, { status: 200, headers: { 'content-type': 'video/mp4' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  try {
    const provider = new PollinationsProvider('sk_test', directory);
    const result = await provider.generateMedia('video', 'a tiny paper boat', 'test/video');
    assert.equal(result.providerJobId, 'job-123');
    assert.equal(result.mimeType, 'video/mp4');
    assert.equal(statusCalls, 1);
    assert.deepEqual(await readFile(result.path), videoBytes);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalTimeout;
    await rm(directory, { recursive: true, force: true });
  }
});
