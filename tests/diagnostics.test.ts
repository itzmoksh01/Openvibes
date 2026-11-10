import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { diagnose } from '../src/services/diagnostics.js';

test('doctor reports configured providers without exposing credential values', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-doctor-'));
  const accountId = '0123456789abcdef0123456789abcdef';
  const token = 'never-print-this-cloudflare-token';
  const apiKey = 'never-print-this-pollinations-key';
  try {
    const report = diagnose({
      dataDir: path.join(directory, 'data'),
      outputDir: path.join(directory, 'generated'),
      databasePath: path.join(directory, 'data', 'openvibes.sqlite'),
    }, {
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: token,
      OPENVIBES_POLLINATIONS_API_KEY: apiKey,
    });
    assert.equal(report.runtime.supported, true);
    assert.equal(report.storage.dataDirectoryWritable, true);
    assert.equal(report.storage.outputDirectoryWritable, true);
    assert.equal(report.providers.cloudflareWorkersAi.status, 'CONFIGURED_NOT_LIVE_TESTED');
    assert.equal(report.providers.pollinations.status, 'CONFIGURED_NOT_LIVE_TESTED');
    assert.equal(report.providers.comfyUiLocal.status, 'CONFIGURED_NOT_CONNECTED');
    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes(token), false);
    assert.equal(serialized.includes(apiKey), false);
    assert.equal(serialized.includes(accountId), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('doctor rejects an invalid ComfyUI URL without making a network request', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-doctor-invalid-'));
  try {
    const report = diagnose({
      dataDir: path.join(directory, 'data'),
      outputDir: path.join(directory, 'generated'),
      databasePath: path.join(directory, 'data', 'openvibes.sqlite'),
    }, { COMFYUI_URL: 'file:///etc/passwd' });
    assert.equal(report.providers.comfyUiLocal.status, 'INVALID_URL');
    assert.equal(report.network.checked, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
