import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

test('built MCP server initializes, lists tools and completes a local ComfyUI image job', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openvibes-mcp-smoke-'));
  const imageBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 3, 3, 7]);
  const promptId = 'openvibes-smoke-1234';
  const mockComfy = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.method === 'GET' && request.url === '/models/checkpoints') {
      response.end(JSON.stringify(['smoke-checkpoint.safetensors']));
      return;
    }
    if (request.method === 'POST' && request.url === '/prompt') {
      response.end(JSON.stringify({ prompt_id: promptId, number: 1 }));
      return;
    }
    if (request.method === 'GET' && request.url === '/history/' + promptId) {
      response.end(JSON.stringify({
        [promptId]: {
          status: { completed: true, status_str: 'success' },
          outputs: {
            '7': {
              images: [{ filename: 'openvibes-smoke.png', subfolder: '', type: 'output' }],
            },
          },
        },
      }));
      return;
    }
    if (request.method === 'GET' && request.url?.startsWith('/view?')) {
      response.statusCode = 200;
      response.setHeader('content-type', 'image/png');
      response.setHeader('content-length', String(imageBytes.length));
      response.end(imageBytes);
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not_found', path: request.url }));
  });

  await new Promise<void>((resolve, reject) => {
    mockComfy.once('error', reject);
    mockComfy.listen(0, '127.0.0.1', resolve);
  });
  const address = mockComfy.address() as AddressInfo;
  const entrypoint = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/index.js');
  const child = spawn(process.execPath, [entrypoint, 'mcp'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      COMFYUI_URL: 'http://127.0.0.1:' + address.port,
      OPENVIBES_DATA_DIR: path.join(directory, 'data'),
      OPENVIBES_OUTPUT_DIR: path.join(directory, 'generated'),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const reader = createInterface({ input: child.stdout });

  try {
    const initializeResponse = readLine(reader);
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

    const initialized = JSON.parse(await initializeResponse) as {
      id?: number;
      result?: { protocolVersion?: string; serverInfo?: { name?: string } };
      error?: unknown;
    };
    assert.equal(initialized.id, 1);
    assert.equal(initialized.error, undefined);
    assert.equal(initialized.result?.serverInfo?.name, 'openvibes');
    assert.ok(initialized.result?.protocolVersion);

    const toolsResponse = readLine(reader);
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

    const listed = JSON.parse(await toolsResponse) as {
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
    assert.ok(names.has('openvibes_comfy_generate_image'));

    const generationResponse = readLine(reader, 20_000);
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'openvibes_comfy_generate_image',
        arguments: {
          prompt: 'A small smoke-test image',
          checkpoint: 'smoke-checkpoint.safetensors',
          width: 512,
          height: 512,
          steps: 4,
          timeout_seconds: 10,
        },
      },
    }) + '\n');

    const generated = JSON.parse(await generationResponse) as {
      id?: number;
      result?: { isError?: boolean; content?: Array<{ type: string; text?: string }> };
      error?: unknown;
    };
    assert.equal(generated.id, 3);
    assert.equal(generated.error, undefined);
    assert.notEqual(generated.result?.isError, true);
    const textContent = generated.result?.content?.find((item) => item.type === 'text')?.text;
    assert.ok(textContent);
    const payload = JSON.parse(textContent) as {
      success?: boolean;
      state?: string;
      outputs?: Array<{ path: string; mimeType: string }>;
      assets?: Array<{ sha256: string; filename: string }>;
    };
    assert.equal(payload.success, true);
    assert.equal(payload.state, 'SAVED');
    assert.equal(payload.outputs?.[0]?.mimeType, 'image/png');
    assert.equal(payload.assets?.length, 1);
    assert.match(payload.assets?.[0]?.sha256 ?? '', /^[a-f0-9]{64}$/);
    assert.deepEqual(await readFile(payload.outputs?.[0]?.path ?? ''), imageBytes);
  } finally {
    reader.close();
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.kill();
      });
    }
    await new Promise<void>((resolve) => mockComfy.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
