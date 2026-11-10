import test from 'node:test';
import assert from 'node:assert/strict';
import { readResponseBuffer, readResponseJson, readResponseText } from '../src/services/http.js';

test('bounded response reader accepts payloads within the configured limit', async () => {
  const response = new Response('hello', { headers: { 'content-length': '5' } });
  assert.equal(await readResponseText(response, 5, 'TEST_RESPONSE'), 'hello');
});

test('bounded response reader rejects oversized declared content before reading', async () => {
  const response = new Response('payload', { headers: { 'content-length': '7' } });
  await assert.rejects(() => readResponseBuffer(response, 4, 'TEST_RESPONSE'), /TEST_RESPONSE_TOO_LARGE/);
});

test('bounded response reader rejects oversized streamed content', async () => {
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.enqueue(new Uint8Array([4, 5, 6]));
      controller.close();
    },
  }));
  await assert.rejects(() => readResponseBuffer(response, 4, 'TEST_RESPONSE'), /TEST_RESPONSE_TOO_LARGE/);
});

test('bounded JSON reader rejects malformed payloads with a stable error code', async () => {
  await assert.rejects(
    () => readResponseJson(new Response('{invalid'), 100, 'TEST_JSON'),
    /TEST_JSON_INVALID_JSON/,
  );
});
