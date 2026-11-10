import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../src/database/store.js';

test('SQLite job and asset records persist across Store restarts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-store-'));
  const databasePath = path.join(directory, 'data', 'openvibes.sqlite');
  const assetPath = path.join(directory, 'generated', 'image.png');
  const digest = createHash('sha256').update('image bytes').digest('hex');
  let store: Store | undefined;
  try {
    store = new Store(databasePath);
    const job = store.createJob({
      kind: 'image',
      state: 'SUBMITTING',
      provider: 'test-provider',
      prompt: 'a test image',
      optimizedPrompt: 'a test image',
      input: { model: 'test' },
    });
    store.updateJob(job.id, 'SAVED', { output: assetPath });
    const asset = store.addAsset({
      jobId: job.id,
      filename: 'image.png',
      mimeType: 'image/png',
      sizeBytes: 11,
      sha256: digest,
      path: assetPath,
      metadata: { test: true },
    });
    assert.equal(store.getJob(job.id)?.state, 'SAVED');
    assert.equal(store.getAsset(asset.id)?.filename, 'image.png');
    store.close();
    store = new Store(databasePath);
    assert.equal(store.getJob(job.id)?.state, 'SAVED');
    assert.equal(store.listAssets()[0]?.sha256, digest);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('SQLite rejects missing jobs and invalid asset metadata', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-store-invalid-'));
  const store = new Store(path.join(directory, 'openvibes.sqlite'));
  const validHash = 'a'.repeat(64);
  try {
    assert.throws(() => store.updateJob('00000000-0000-0000-0000-000000000000', 'FAILED'), /JOB_NOT_FOUND/);
    const job = store.createJob({
      kind: 'image',
      state: 'SUBMITTING',
      provider: 'test-provider',
      prompt: 'test',
      optimizedPrompt: 'test',
      input: {},
    });
    assert.throws(() => store.addAsset({
      jobId: job.id, filename: '../escape.png', mimeType: 'image/png',
      sizeBytes: 1, sha256: validHash, path: path.join(directory, 'escape.png'),
    }), /INVALID_ASSET_FILENAME/);
    assert.throws(() => store.addAsset({
      jobId: job.id, filename: 'file.exe', mimeType: 'not-a-mime',
      sizeBytes: 1, sha256: validHash, path: path.join(directory, 'file.exe'),
    }), /INVALID_ASSET_MIME_TYPE/);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
