import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ComfyUiLocalProvider } from '../src/providers/comfyui-local.js';
import { safeAssetPath } from '../src/services/assets.js';

const promptId = '00000000-0000-0000-0000-000000000001';
const json = (value: unknown) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

test('one-call image generation submits, waits, downloads and hashes the output', async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'openvibes-test-'));
  const originalFetch = globalThis.fetch;
  let submittedWorkflow: Record<string, unknown> | undefined;
  const bytes = Buffer.from([1, 2, 3, 4, 5]);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
    if (url.pathname === '/models/checkpoints') return json(['test-model.safetensors']);
    if (url.pathname === '/prompt') {
      submittedWorkflow = (JSON.parse(String(init?.body)) as { prompt: Record<string, unknown> }).prompt;
      return json({ prompt_id: promptId, number: 1 });
    }
    if (url.pathname === '/history/' + promptId) {
      return json({
        [promptId]: {
          status: { completed: true, status_str: 'success' },
          outputs: { '7': { images: [{ filename: 'openvibes_00001.png', subfolder: '', type: 'output' }] } },
        },
      });
    }
    if (url.pathname === '/view') return new Response(bytes, { status: 200 });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const provider = new ComfyUiLocalProvider('http://127.0.0.1:8188', outputDir);
    const result = await provider.generateImage({
      prompt: 'A cinematic mountain sunrise',
      checkpoint: 'test-model.safetensors',
      width: 512,
      height: 512,
      steps: 18,
      seed: 42,
      timeoutSeconds: 5,
    });

    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.promptId, promptId);
    assert.equal(result.outputs.length, 1);
    assert.equal(result.outputs[0]?.mimeType, 'image/png');
    assert.equal(result.outputs[0]?.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.deepEqual([...await readFile(result.outputs[0]!.path)], [...bytes]);
    assert.equal((submittedWorkflow?.['5'] as { inputs: { steps: number; seed: number } }).inputs.steps, 18);
    assert.equal((submittedWorkflow?.['5'] as { inputs: { steps: number; seed: number } }).inputs.seed, 42);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('cancel removes a queued ComfyUI job by its prompt ID', async () => {
  const originalFetch = globalThis.fetch;
  let deleteBody: { delete?: string[] } | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
    if (url.pathname === '/queue' && init?.method !== 'POST') {
      return json({ queue_running: [], queue_pending: [[1, promptId, {}, {}, []]] });
    }
    if (url.pathname === '/queue' && init?.method === 'POST') {
      deleteBody = JSON.parse(String(init.body)) as { delete?: string[] };
      return json({});
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const provider = new ComfyUiLocalProvider();
    const result = await provider.cancel(promptId);
    assert.deepEqual(result, { cancelled: true, action: 'removed_from_pending_queue' });
    assert.deepEqual(deleteBody?.delete, [promptId]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects unsafe ComfyUI URLs and unsafe output paths', () => {
  assert.throws(() => new ComfyUiLocalProvider('file:///etc/passwd'), /INVALID_COMFYUI_URL/);
  assert.throws(() => new ComfyUiLocalProvider('http://user:pass@127.0.0.1:8188'), /INVALID_COMFYUI_URL/);
  assert.throws(() => safeAssetPath('/tmp/openvibes', 'images', '../escape.png'), /INVALID_FILENAME/);
  assert.throws(() => safeAssetPath('/tmp/openvibes', 'images', 'file.exe'), /UNSUPPORTED_MEDIA_EXTENSION/);
});
