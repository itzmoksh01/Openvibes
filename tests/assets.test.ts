import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { safeAssetPath, writeFileAtomic } from '../src/services/assets.js';

test('asset path rejects traversal', () => {
  assert.throws(
    () => safeAssetPath(path.join(os.tmpdir(), 'ov-test'), 'images', '../escape.png'),
    /INVALID_FILENAME/,
  );
});

test('asset path accepts safe PNG path', () => {
  assert.match(safeAssetPath(path.join(os.tmpdir(), 'ov-test'), 'images', 'portrait.png'), /images/);
});

test('atomic asset write exposes only the complete file and removes its temporary file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'openvibes-atomic-'));
  const target = path.join(directory, 'asset.png');
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  try {
    await writeFileAtomic(target, bytes);
    assert.deepEqual(await readFile(target), bytes);
    assert.deepEqual(await readdir(directory), ['asset.png']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('atomic asset write never overwrites an existing asset and cleans up after collision', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'openvibes-atomic-collision-'));
  const target = path.join(directory, 'asset.png');
  const original = Buffer.from('original asset');
  try {
    await writeFile(target, original);
    await assert.rejects(
      () => writeFileAtomic(target, Buffer.from('replacement')),
      (error: NodeJS.ErrnoException) => error.code === 'EEXIST',
    );
    assert.deepEqual(await readFile(target), original);
    assert.deepEqual(await readdir(directory), ['asset.png']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('concurrent atomic asset writes create one complete winner without overwriting', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'openvibes-atomic-race-'));
  const target = path.join(directory, 'asset.png');
  const first = Buffer.from('first complete asset');
  const second = Buffer.from('second complete asset');
  try {
    const outcomes = await Promise.allSettled([
      writeFileAtomic(target, first),
      writeFileAtomic(target, second),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    const saved = await readFile(target);
    assert.ok(saved.equals(first) || saved.equals(second));
    assert.deepEqual(await readdir(directory), ['asset.png']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
