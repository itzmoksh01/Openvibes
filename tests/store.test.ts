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

test('SQLite adopts an existing version-zero database as schema version two', async () => {
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
      assert.equal(version.user_version, 3);
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


test('daily provider quotas are shared across Store instances and reset on a new UTC date', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-usage-'));
  const databasePath = path.join(directory, 'openvibes.sqlite');
  const first = new Store(databasePath);
  const second = new Store(databasePath);
  const today = new Date('2026-11-11T12:00:00.000Z');
  const tomorrow = new Date('2026-11-12T00:00:00.000Z');
  try {
    assert.equal(first.reserveDailyUsage('pollinations-hosted', 2, today).used, 1);
    assert.equal(second.reserveDailyUsage('pollinations-hosted', 2, today).used, 2);
    assert.throws(() => first.reserveDailyUsage('pollinations-hosted', 2, today), /DAILY_USAGE_LIMIT_REACHED/);
    assert.equal(second.getDailyUsage('pollinations-hosted', 2, today).remaining, 0);
    assert.equal(first.reserveDailyUsage('pollinations-hosted', 2, tomorrow).used, 1);
    assert.equal(first.reserveDailyUsage('comfyui-local', 0, today).unlimited, true);
  } finally {
    first.close(); second.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('expired job and asset rows can be previewed and deleted transactionally', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-cleanup-'));
  const databasePath = path.join(directory, 'openvibes.sqlite');
  const store = new Store(databasePath);
  try {
    const job = store.createJob({ kind: 'image', state: 'SUBMITTING', provider: 'test', prompt: 'old', optimizedPrompt: 'old', input: {} });
    store.addAsset({ jobId: job.id, filename: 'old.png', mimeType: 'image/png', sizeBytes: 1, sha256: 'a'.repeat(64), path: path.join(directory, 'old.png') });
    const db = new DatabaseSync(databasePath);
    db.prepare('UPDATE jobs SET created_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z', job.id);
    db.close();
    const cutoff = '2021-01-01T00:00:00.000Z';
    const preview = store.previewExpiredDataBefore(cutoff);
    assert.equal(preview.jobs, 1); assert.equal(preview.assets, 1);
    const result = store.deleteExpiredDataBefore(cutoff);
    assert.equal(result.jobsDeleted, 1); assert.equal(result.assetsDeleted, 1);
    assert.equal(result.assetPaths.length, 1); assert.equal(store.getJob(job.id), undefined);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});


test('SQLite shared generation leases cap concurrent Store instances and renew/expire', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-leases-'));
  const dbPath = path.join(directory, 'openvibes.sqlite');
  const first = new Store(dbPath), second = new Store(dbPath), third = new Store(dbPath);
  const now = new Date('2026-11-11T12:00:00.000Z');
  try {
    const one = first.acquireGenerationLease(2, 60_000, now);
    const two = second.acquireGenerationLease(2, 60_000, now);
    assert.ok(one); assert.ok(two);
    assert.equal(third.acquireGenerationLease(2, 60_000, now), null);
    assert.deepEqual(third.getGenerationSlotUsage(2, now), { active: 2, limit: 2, available: 0 });
    assert.equal(first.renewGenerationLease(one!, 60_000, new Date(now.getTime() + 30_000)), true);
    first.releaseGenerationLease(one!);
    assert.ok(third.acquireGenerationLease(2, 60_000, new Date(now.getTime() + 31_000)));
    assert.equal(second.renewGenerationLease(two!, 60_000, new Date(now.getTime() + 61_000)), false);
  } finally {
    first.close(); second.close(); third.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('audit trail records job, asset and provider events without prompts or paths', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-audit-'));
  const store = new Store(path.join(directory, 'openvibes.sqlite'));
  try {
    const job = store.createJob({ kind: 'image', state: 'SUBMITTING', provider: 'pollinations-hosted',
      prompt: 'sensitive prompt must not be audited', optimizedPrompt: 'sensitive prompt must not be audited',
      input: { token: 'private-value' } });
    store.reserveDailyUsage('pollinations-hosted', 5);
    store.updateJob(job.id, 'SAVED', { ok: true });
    store.addAsset({ jobId: job.id, filename: 'generated.png', mimeType: 'image/png', sizeBytes: 10,
      sha256: 'b'.repeat(64), path: path.join(directory, 'generated.png') });
    const audit = JSON.stringify(store.listAuditEvents(50));
    assert.match(audit, /job.created/); assert.match(audit, /job.state_changed/);
    assert.match(audit, /provider.request_reserved/); assert.match(audit, /asset.saved/);
    assert.equal(audit.includes('sensitive prompt must not be audited'), false);
    assert.equal(audit.includes('private-value'), false);
    assert.equal(audit.includes(directory), false);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});
