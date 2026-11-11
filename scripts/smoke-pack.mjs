import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
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

function readJsonLine(stream, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('PACKAGED_MCP_RESPONSE_TIMEOUT'));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      stream.off('data', onData);
    };
    const onData = (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      const line = buffer.slice(0, newline).trim();
      cleanup();
      try {
        resolve(JSON.parse(line));
      } catch (error) {
        reject(new Error('PACKAGED_MCP_INVALID_STDOUT: ' + line, { cause: error }));
      }
    };
    stream.on('data', onData);
  });
}

async function verifyPackagedMcp(entrypoint, directory) {
  const child = spawn(process.execPath, [entrypoint, 'mcp'], {
    cwd: directory,
    env: {
      ...process.env,
      OPENVIBES_DATA_DIR: path.join(directory, 'data'),
      OPENVIBES_OUTPUT_DIR: path.join(directory, 'generated'),
      COMFYUI_URL: 'http://127.0.0.1:8188',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  try {
    const initialize = readJsonLine(child.stdout);
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'openvibes-packed-smoke', version: '1.0.0' },
      },
    }) + '\n');
    const initialized = await initialize;
    assert.equal(initialized.id, 1);
    assert.equal(initialized.result?.serverInfo?.name, 'openvibes');

    const tools = readJsonLine(child.stdout);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
    const listed = await tools;
    assert.equal(listed.id, 2);
    const names = new Set((listed.result?.tools ?? []).map((tool) => tool.name));
    assert.ok(names.has('openvibes_get_capabilities'));
    assert.ok(names.has('openvibes_hosted_generate_media'));
    assert.ok(names.has('openvibes_comfy_generate_image'));
  } finally {
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once('exit', resolve);
    });
  }
}

try {
  const packed = JSON.parse(runNpm(['pack', '--json', '--pack-destination', temporary]));
  const filename = packed[0]?.filename;
  assert.equal(typeof filename, 'string', 'npm pack must produce a tarball');
  const tarball = path.join(temporary, filename);
  const installDirectory = path.join(temporary, 'install');
  runNpm(['install', '--prefix', installDirectory, '--ignore-scripts', '--no-audit', '--no-fund', tarball]);

  const packageRoot = path.join(installDirectory, 'node_modules', 'openvibes-mcp');
  const entrypoint = path.join(packageRoot, 'dist', 'src', 'index.js');
  const output = execFileSync(process.execPath, [entrypoint, '--help'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  assert.match(output, /Openvibes CLI/);
  assert.match(output, /openvibes setup/);
  await verifyPackagedMcp(entrypoint, temporary);
  process.stdout.write('Package smoke test passed: tarball installed, CLI executed, MCP initialized and tools listed.\\n');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
