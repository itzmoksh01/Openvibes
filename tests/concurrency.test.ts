import test from 'node:test';
import assert from 'node:assert/strict';
import { GenerationLimiter } from '../src/services/concurrency.js';

test('generation limiter enforces concurrency and FIFO queued work', async () => {
  const limiter = new GenerationLimiter(1, 2);
  const order: number[] = [];
  let releaseFirst!: () => void;
  const first = limiter.run(async () => {
    await new Promise<void>((resolve) => { releaseFirst = resolve; });
    order.push(1);
  });
  const second = limiter.run(async () => { order.push(2); });
  const third = limiter.run(async () => { order.push(3); });
  await assert.rejects(() => limiter.run(async () => undefined), /GENERATION_CAPACITY_EXCEEDED/);
  assert.equal(limiter.activeCount, 1);
  assert.equal(limiter.queuedCount, 2);
  releaseFirst();
  await Promise.all([first, second, third]);
  assert.deepEqual(order, [1, 2, 3]);
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.queuedCount, 0);
});

test('generation limiter validates its capacity configuration', () => {
  assert.throws(() => new GenerationLimiter(0, 1), /INVALID_GENERATION_LIMIT/);
  assert.throws(() => new GenerationLimiter(1, -1), /INVALID_GENERATION_LIMIT/);
});
