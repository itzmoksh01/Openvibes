import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'https://api.cloudflare.com/client/v4';

export class CloudflareWorkersAiProvider {
  readonly id = 'cloudflare-workers-ai';
  constructor(
    private readonly accountId: string | undefined,
    private readonly apiToken: string | undefined,
    private readonly outputDir: string,
  ) {}

  private get endpoint() {
    if (!this.accountId || !/^[a-f0-9]{32}$/i.test(this.accountId)) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID_MISSING_OR_INVALID');
    }
    if (!this.apiToken) throw new Error('CLOUDFLARE_API_TOKEN_MISSING');
    return `${API}/accounts/${this.accountId}/ai/run`;
  }

  private async run(model: string, input: Record<string, unknown>) {
    const response = await fetch(`${this.endpoint}/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`CLOUDFLARE_AI_HTTP_${response.status}: ${(await response.text()).slice(0, 1000)}`);
    const body = await response.json() as { success?: boolean; result?: Record<string, unknown>; errors?: unknown[] };
    if (body.success === false || !body.result) throw new Error(`CLOUDFLARE_AI_FAILED: ${JSON.stringify(body.errors ?? []).slice(0, 1000)}`);
    return body.result;
  }

  async generateText(prompt: string, model = '@cf/meta/llama-3.1-8b-instruct') {
    return this.run(model, { prompt });
  }

  async generateAudio(text: string, model = '@cf/deepgram/aura-1', options: Record<string, string | number | boolean> = {}) {
    if (!text.trim()) throw new Error('CLOUDFLARE_AUDIO_TEXT_REQUIRED');
    const response = await fetch(`${this.endpoint}/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...options }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`CLOUDFLARE_TTS_HTTP_${response.status}: ${(await response.text()).slice(0, 1000)}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error('CLOUDFLARE_TTS_EMPTY_AUDIO');
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? 'audio/mpeg';
    const extension = contentType === 'audio/wav' ? '.wav' : contentType === 'audio/ogg' ? '.ogg' : '.mp3';
    const folder = path.join(this.outputDir, 'audio');
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    const filename = `cloudflare-tts-${randomUUID()}${extension}`;
    const target = path.join(folder, filename);
    await fs.writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
    return {
      path: target, filename, mimeType: contentType, sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }

  async generateImage(prompt: string, model = '@cf/black-forest-labs/flux-1-schnell', options: Record<string, string | number | boolean> = {}) {
    const result = await this.run(model, { prompt, ...options });
    if (typeof result.image !== 'string') throw new Error('CLOUDFLARE_IMAGE_RESULT_MISSING');
    const bytes = Buffer.from(result.image, 'base64');
    if (!bytes.length) throw new Error('CLOUDFLARE_IMAGE_EMPTY');
    const folder = path.join(this.outputDir, 'images');
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    const filename = `cloudflare-${randomUUID()}.jpg`;
    const target = path.join(folder, filename);
    await fs.writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
    return {
      path: target, filename, mimeType: 'image/jpeg', sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }
}
