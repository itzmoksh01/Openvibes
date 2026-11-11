/** FIFO concurrency bound for expensive remote generations and local GPU work. */
export class GenerationLimiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    readonly maxConcurrent = 2,
    readonly maxQueued = 4,
  ) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 ||
        !Number.isInteger(maxQueued) || maxQueued < 0) {
      throw new Error('INVALID_GENERATION_LIMIT');
    }
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      if (this.waiting.length >= this.maxQueued) {
        throw new Error('GENERATION_CAPACITY_EXCEEDED: too many generation requests are already running or queued.');
      }
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active += 1;
    }

    try {
      return await operation();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active -= 1;
    }
  }

  get activeCount(): number { return this.active; }
  get queuedCount(): number { return this.waiting.length; }
}
