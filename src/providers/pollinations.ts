import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../services/assets.js';
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
    const key = this.apiKey?.trim();
    if (!key) {
      throw new Error('POLLINATIONS_API_KEY_MISSING: Create a user-owned key at https://enter.pollinations.ai/keys and set OPENVIBES_POLLINATIONS_API_KEY.');
    }
    return { Authorization: 'Bearer ' + key, ...extra };
  }

  async listModels(category?: 'text' | 'image' | 'video' | 'audio') {
    const endpoint = category ? '/' + category + '/models' : '/models';
    const response = await fetch(BASE + endpoint, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      const detail = await readResponseText(response, 4096, 'POLLINATIONS_CATALOG_ERROR');
      throw new Error('POLLINATIONS_CATALOG_HTTP_' + response.status + ': ' + detail.slice(0, 500));
    }
    return readResponseJson<unknown>(response, 8 * 1024 * 1024, 'POLLINATIONS_CATALOG_RESPONSE');
  }

  async generateText(prompt: string, model: string) {
    if (!prompt.trim()) throw new Error('POLLINATIONS_TEXT_PROMPT_REQUIRED');
    if (!model.trim() || model.length > 200) throw new Error('POLLINATIONS_MODEL_ID_INVALID');
    const response = await fetch(BASE + '/v1/chat/completions', {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) {
      const detail = await readResponseText(response, 4096, 'POLLINATIONS_TEXT_ERROR');
      throw new Error('POLLINATIONS_TEXT_HTTP_' + response.status + ': ' + detail.slice(0, 1000));
    }
    return readResponseJson<unknown>(response, 16 * 1024 * 1024, 'POLLINATIONS_TEXT_RESPONSE');
  }

  async generateMedia(
    kind: 'image' | 'video' | 'audio',
    prompt: string,
    model: string,
    options: Record<string, string | number | boolean> = {},
  ): Promise<HostedMediaResult> {
    if (!prompt.trim()) throw new Error('POLLINATIONS_PROMPT_REQUIRED');
    if (!/^[a-zA-Z0-9._:/-]{1,200}$/.test(model)) throw new Error('POLLINATIONS_MODEL_ID_INVALID');

    const endpoint = new URL('/' + kind + '/' + encodeURIComponent(prompt), BASE);
    endpoint.searchParams.set('model', model);
    for (const [key, value] of Object.entries(options)) {
      if (key === 'model' || key === 'prompt' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key)) {
        throw new Error('POLLINATIONS_OPTION_INVALID: ' + key);
      }
      endpoint.searchParams.set(key, String(value));
    }

    const response = await fetch(endpoint, {
      headers: this.headers({ Prefer: 'respond-async' }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) {
      const detail = await readResponseText(response, 4096, 'POLLINATIONS_MEDIA_ERROR');
      throw new Error('POLLINATIONS_' + kind.toUpperCase() + '_HTTP_' + response.status + ': ' + detail.slice(0, 1000));
    }

    let mediaResponse = response;
    let providerJobId: string | undefined;
    if (response.status === 202) {
      const job = await readResponseJson<{ id?: string; status_url?: string; status?: string }>(
        response, 1024 * 1024, 'POLLINATIONS_JOB_RESPONSE',
      );
      if (typeof job.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(job.id)) {
        throw new Error('POLLINATIONS_ASYNC_JOB_ID_INVALID');
      }
      providerJobId = job.id;
      const statusUrl = new URL(job.status_url ?? '/v1/jobs/' + encodeURIComponent(job.id), BASE);
      if (
        statusUrl.origin !== BASE ||
        statusUrl.protocol !== 'https:' ||
        statusUrl.username ||
        statusUrl.password ||
        statusUrl.hash ||
        !statusUrl.pathname.startsWith('/v1/jobs/')
      ) {
        throw new Error('POLLINATIONS_INVALID_STATUS_URL');
      }

      let status = job.status ?? 'pending';
      const deadline = Date.now() + 15 * 60_000;
      let pollDelay = 2_000;
      while (status !== 'succeeded') {
        if (status === 'failed' || status === 'cancelled') {
          throw new Error('POLLINATIONS_JOB_' + status.toUpperCase() + ': ' + job.id);
        }
        if (Date.now() > deadline) throw new Error('POLLINATIONS_JOB_TIMEOUT: ' + job.id);

        await new Promise((resolve) => setTimeout(resolve, pollDelay));
        const check = await fetch(statusUrl, {
          headers: this.headers(),
          signal: AbortSignal.timeout(30_000),
        });
        if (check.status === 429 || check.status >= 500) {
          pollDelay = Math.min(pollDelay * 2, 30_000);
          continue;
        }
        if (!check.ok) {
          const detail = await readResponseText(check, 4096, 'POLLINATIONS_STATUS_ERROR');
          throw new Error('POLLINATIONS_STATUS_HTTP_' + check.status + ': ' + detail.slice(0, 500));
        }
        const body = await readResponseJson<{ status?: string }>(
          check, 1024 * 1024, 'POLLINATIONS_STATUS_RESPONSE',
        );
        status = body.status ?? 'pending';
        pollDelay = Math.min(Math.max(pollDelay, 2_000), 10_000);
      }

      mediaResponse = await fetch(new URL('/v1/jobs/' + encodeURIComponent(job.id) + '/result', BASE), {
        headers: this.headers(),
        signal: AbortSignal.timeout(180_000),
      });
    }

    if (!mediaResponse.ok) {
      const detail = await readResponseText(mediaResponse, 4096, 'POLLINATIONS_RESULT_ERROR');
      throw new Error('POLLINATIONS_RESULT_HTTP_' + mediaResponse.status + ': ' + detail.slice(0, 1000));
    }

    const maxBytes = kind === 'video' ? 512 * 1024 * 1024
      : kind === 'audio' ? 100 * 1024 * 1024
      : 40 * 1024 * 1024;
    const bytes = await readResponseBuffer(mediaResponse, maxBytes, 'POLLINATIONS_MEDIA');
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
    const filename = 'pollinations-' + randomUUID() + extension;
    const target = path.join(folder, filename);
    await writeFileAtomic(target, bytes);
    return {
      path: target,
      filename,
      mimeType,
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      ...(providerJobId ? { providerJobId } : {}),
    };
  }
}
