import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'https://api.cloudflare.com/client/v4';
const MODEL_ID = /^@[a-z0-9-]+\/[a-z0-9._-]+\/[a-z0-9._-]+$/i;

function validateModel(model: string): void {
  if (!MODEL_ID.test(model)) throw new Error('CLOUDFLARE_MODEL_ID_INVALID');
}

function detectImageFormat(bytes: Buffer): { mimeType: string; extension: string } {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mimeType: 'image/png', extension: '.png' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: '.jpg' };
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return { mimeType: 'image/webp', extension: '.webp' };
  }
  throw new Error('CLOUDFLARE_IMAGE_FORMAT_UNSUPPORTED');
}

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
    if (!this.apiToken?.trim()) throw new Error('CLOUDFLARE_API_TOKEN_MISSING');
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
      body: JSON.stringify({ ...options, text }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`CLOUDFLARE_TTS_HTTP_${response.status}: ${(await response.text()).slice(0, 1000)}`);
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? 'audio/mpeg';
    let bytes: Buffer;
    if (contentType.includes('json')) {
      const envelope = await response.json() as {
        success?: boolean;
        result?: { audio?: string } | string;
        errors?: unknown[];
      };
      if (envelope.success === false) {
        throw new Error(`CLOUDFLARE_TTS_FAILED: ${JSON.stringify(envelope.errors ?? []).slice(0, 1000)}`);
      }
      const encoded = typeof envelope.result === 'string'
        ? envelope.result
        : envelope.result?.audio;
      if (typeof encoded !== 'string' || !encoded.length) {
        throw new Error('CLOUDFLARE_TTS_AUDIO_FIELD_MISSING');
      }
      bytes = Buffer.from(encoded, 'base64');
    } else {
      bytes = Buffer.from(await response.arrayBuffer());
    }
    if (!bytes.length) throw new Error('CLOUDFLARE_TTS_EMPTY_AUDIO');
    const audioMimeType = contentType.startsWith('audio/') ? contentType : 'audio/mpeg';
    const extension = audioMimeType === 'audio/wav' ? '.wav' : audioMimeType === 'audio/ogg' ? '.ogg' : '.mp3';
    const folder = path.join(this.outputDir, 'audio');
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    const filename = `cloudflare-tts-${randomUUID()}${extension}`;
    const target = path.join(folder, filename);
    await fs.writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
    return {
      path: target, filename, mimeType: audioMimeType, sizeBytes: bytes.length,
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
    const filename = `cloudflare-${randomUUID()}${format.extension}`;
    const target = path.join(folder, filename);
    await fs.writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
    return {
      path: target, filename, mimeType: format.mimeType, sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }
}
