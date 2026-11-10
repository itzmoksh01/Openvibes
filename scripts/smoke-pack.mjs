import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const temporary = await mkdtemp(path.join(os.tmpdir(), 'openvibes-package-smoke-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const runNpm = (args) => execFileSync(npm, args, {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
  shell: process.platform === 'win32',
});

try {
  const packed = JSON.parse(runNpm(['pack', '--json', '--pack-destination', temporary]));
  const filename = packed[0]?.filename;
  assert.equal(typeof filename, 'string', 'npm pack must produce a tarball');
  const tarball = path.join(temporary, filename);
  const installDirectory = path.join(temporary, 'install');
  runNpm(['install', '--prefix', installDirectory, '--ignore-scripts', '--no-audit', '--no-fund', tarball]);

  const entrypoint = path.join(installDirectory, 'node_modules', 'openvibes-mcp', 'dist', 'src', 'index.js');
  const output = execFileSync(process.execPath, [entrypoint, '--help'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  assert.match(output, /Openvibes CLI/);
  assert.match(output, /openvibes setup/);
  process.stdout.write('Package smoke test passed: packed tarball installed and CLI entrypoint executed.\n');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
