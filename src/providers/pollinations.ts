import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readResponseBuffer, readResponseJson, readResponseText } from '../services/http.js';

const BASE = 'https://gen.pollinations.ai';

export interface HostedMediaResult {
  path: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  providerJobId?: string;
}

export class PollinationsProvider {
  readonly id = 'pollinations-hosted';
  constructor(private readonly apiKey: string | undefined, private readonly outputDir: string) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    if (!this.apiKey) throw new Error('POLLINATIONS_API_KEY_MISSING: Create a user-owned key at https://enter.pollinations.ai/keys and set OPENVIBES_POLLINATIONS_API_KEY.');
    return { Authorization: `Bearer ${this.apiKey}`, ...extra };
  }

  async listModels(category?: 'text' | 'image' | 'video' | 'audio') {
    const endpoint = category ? `/${category}/models` : '/models';
    const response = await fetch(BASE + endpoint, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`POLLINATIONS_CATALOG_HTTP_${response.status}: ${(await response.text()).slice(0, 500)}`);
    return response.json() as Promise<unknown>;
  }

  async generateText(prompt: string, model: string) {
    const response = await fetch(BASE + '/v1/chat/completions', {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`POLLINATIONS_TEXT_HTTP_${response.status}: ${(await response.text()).slice(0, 1000)}`);
    return response.json() as Promise<unknown>;
  }

  async generateMedia(kind: 'image' | 'video' | 'audio', prompt: string, model: string, options: Record<string, string | number | boolean> = {}): Promise<HostedMediaResult> {
    const endpoint = new URL(`/${kind}/${encodeURIComponent(prompt)}`, BASE);
    if (!/^[a-zA-Z0-9._:/-]{1,200}$/.test(model)) throw new Error('POLLINATIONS_MODEL_ID_INVALID');
    endpoint.searchParams.set('model', model);
    for (const [key, value] of Object.entries(options)) {
      if (key === 'model' || key === 'prompt' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key)) {
        throw new Error(`POLLINATIONS_OPTION_INVALID: ${key}`);
      }
      endpoint.searchParams.set(key, String(value));
    }

    const response = await fetch(endpoint, {
      headers: this.headers({ Prefer: 'respond-async' }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`POLLINATIONS_${kind.toUpperCase()}_HTTP_${response.status}: ${(await readResponseText(response, 4096, 'POLLINATIONS_MEDIA_ERROR')).slice(0, 1000)}`);

    let mediaResponse = response;
    let providerJobId: string | undefined;
    if (response.status === 202) {
      const job = await readResponseJson<{ id?: string; status_url?: string; status?: string }>(response, 1024 * 1024, 'POLLINATIONS_JOB_RESPONSE');
      if (typeof job.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(job.id)) {
        throw new Error('POLLINATIONS_ASYNC_JOB_ID_INVALID');
      }
      providerJobId = job.id;
      const statusUrl = new URL(job.status_url ?? `/v1/jobs/${encodeURIComponent(job.id)}`, BASE);
      if (statusUrl.origin !== BASE || statusUrl.protocol !== 'https:') {
        throw new Error('POLLINATIONS_INVALID_STATUS_URL');
      }
      let status = job.status ?? 'pending';
      const deadline = Date.now() + 15 * 60_000;
      while (status !== 'succeeded') {
        if (status === 'failed' || status === 'cancelled') throw new Error(`POLLINATIONS_JOB_${status.toUpperCase()}: ${job.id}`);
        if (Date.now() > deadline) throw new Error(`POLLINATIONS_JOB_TIMEOUT: ${job.id}`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const check = await fetch(statusUrl, { headers: this.headers(), signal: AbortSignal.timeout(30_000) });
        if (!check.ok) throw new Error(`POLLINATIONS_STATUS_HTTP_${check.status}`);
        const body = await check.json() as { status?: string };
        status = body.status ?? 'pending';
      }
      mediaResponse = await fetch(new URL(`/v1/jobs/${encodeURIComponent(job.id)}/result`, BASE), {
        headers: this.headers(), signal: AbortSignal.timeout(180_000),
      });
    }
    if (!mediaResponse.ok) throw new Error(`POLLINATIONS_RESULT_HTTP_${mediaResponse.status}: ${(await mediaResponse.text()).slice(0, 1000)}`);

    const bytes = Buffer.from(await mediaResponse.arrayBuffer());
    if (!bytes.length) throw new Error('POLLINATIONS_EMPTY_MEDIA');
    const mimeType = mediaResponse.headers.get('content-type')?.split(';')[0]?.trim() ?? 'application/octet-stream';
    const extension = mimeType === 'image/png' ? '.png'
      : mimeType === 'image/webp' ? '.webp'
      : mimeType === 'image/jpeg' ? '.jpg'
      : mimeType === 'audio/mpeg' ? '.mp3'
      : mimeType === 'audio/wav' || mimeType === 'audio/x-wav' ? '.wav'
      : mimeType === 'audio/ogg' ? '.ogg'
      : mimeType === 'video/webm' ? '.webm'
      : mimeType === 'video/mp4' ? '.mp4'
      : mimeType.startsWith('image/') ? '.img'
      : mimeType.startsWith('audio/') ? '.audio'
      : mimeType.startsWith('video/') ? '.video' : '.bin';
    const folder = path.join(this.outputDir, kind === 'image' ? 'images' : kind === 'video' ? 'videos' : 'audio');
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    const filename = `pollinations-${randomUUID()}${extension}`;
    const target = path.join(folder, filename);
    await fs.writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
    return {
      path: target, filename, mimeType, sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      ...(providerJobId ? { providerJobId } : {}),
    };
  }
}
