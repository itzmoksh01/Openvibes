import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function readLine(reader: ReturnType<typeof createInterface>, timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reader.off('line', onLine);
      reject(new Error('MCP_STDIO_RESPONSE_TIMEOUT'));
    }, timeoutMs);
    const onLine = (line: string) => {
      clearTimeout(timer);
      resolve(line);
    };
    reader.once('line', onLine);
  });
}

test('built executable completes MCP initialize and tools/list over real stdio', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-mcp-smoke-'));
  const entrypoint = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/index.js');
  const child = spawn(process.execPath, [entrypoint, 'mcp'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      OPENVIBES_DATA_DIR: path.join(directory, 'data'),
      OPENVIBES_OUTPUT_DIR: path.join(directory, 'generated'),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const reader = createInterface({ input: child.stdout });

  try {
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'openvibes-smoke-test', version: '1.0.0' },
      },
    }) + '\n');

    const initialized = JSON.parse(await readLine(reader)) as {
      id?: number;
      result?: { protocolVersion?: string; serverInfo?: { name?: string } };
      error?: unknown;
    };
    assert.equal(initialized.id, 1);
    assert.equal(initialized.error, undefined);
    assert.equal(initialized.result?.serverInfo?.name, 'openvibes');
    assert.ok(initialized.result?.protocolVersion);

    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }) + '\n');
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }) + '\n');

    const listed = JSON.parse(await readLine(reader)) as {
      id?: number;
      result?: { tools?: Array<{ name: string }> };
      error?: unknown;
    };
    assert.equal(listed.id, 2);
    assert.equal(listed.error, undefined);
    const names = new Set((listed.result?.tools ?? []).map((tool) => tool.name));
    assert.ok(names.has('openvibes_get_capabilities'));
    assert.ok(names.has('openvibes_cloudflare_generate_image'));
    assert.ok(names.has('openvibes_hosted_generate_media'));
    assert.ok(names.has('openvibes_comfy_run_workflow'));
  } finally {
    reader.close();
    if (child.exitCode === null) {
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.kill();
      });
    }
    await rm(directory, { recursive: true, force: true });
  }
});
