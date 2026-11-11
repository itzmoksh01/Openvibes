import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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

test('SQLite adopts an existing version-zero database as schema version one', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-store-migration-'));
  const databasePath = path.join(directory, 'legacy.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL,
      provider TEXT NOT NULL, prompt TEXT NOT NULL, optimized_prompt TEXT NOT NULL,
      input_json TEXT NOT NULL, output_json TEXT, error_code TEXT, error_message TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE assets (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id),
      filename TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL, path TEXT NOT NULL, metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  legacy.close();
  let store: Store | undefined;
  try {
    store = new Store(databasePath);
    store.close();
    store = undefined;
    store = new Store(databasePath);
    store.close();
    store = undefined;
    const verify = new DatabaseSync(databasePath);
    try {
      const version = verify.prepare('PRAGMA user_version').get() as { user_version: number };
      assert.equal(version.user_version, 1);
    } finally {
      verify.close();
    }
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('SQLite refuses to open a database created by a newer schema version', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-store-newer-'));
  const databasePath = path.join(directory, 'future.sqlite');
  const future = new DatabaseSync(databasePath);
  future.exec('PRAGMA user_version=999');
  future.close();
  try {
    assert.throws(() => new Store(databasePath), /DATABASE_SCHEMA_TOO_NEW/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test('SQLite enforces safe job-state transitions and protects terminal jobs', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-store-states-'));
  const store = new Store(path.join(directory, 'openvibes.sqlite'));
  try {
    const job = store.createJob({
      kind: 'image',
      state: 'SUBMITTED',
      provider: 'comfyui-local',
      prompt: 'restart recovery',
      optimizedPrompt: 'restart recovery',
      input: { promptId: 'openvibes-recover-1234' },
    });

    store.updateJob(job.id, 'PROCESSING', { promptId: 'openvibes-recover-1234' });
    store.updateJob(job.id, 'PROCESSING', { promptId: 'openvibes-recover-1234', retry: 1 });
    store.updateJob(job.id, 'DOWNLOADING', { promptId: 'openvibes-recover-1234' });
    store.updateJob(job.id, 'SAVED', { promptId: 'openvibes-recover-1234', outputs: [] });

    assert.equal(store.getJob(job.id)?.state, 'SAVED');
    assert.throws(
      () => store.updateJob(job.id, 'FAILED', { error: 'late failure' }),
      /JOB_STATE_TRANSITION_NOT_ALLOWED: SAVED -> FAILED/,
    );
    assert.equal(store.getJob(job.id)?.state, 'SAVED');
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
