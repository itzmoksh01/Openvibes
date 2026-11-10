import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { safeAssetPath } from '../services/assets.js';
import { readResponseBuffer, readResponseJson, readResponseText } from '../services/http.js';

export interface ComfyOutput {
  filename: string;
  subfolder?: string;
  type?: string;
}
export interface ComfySavedOutput {
  path: string;
  filename: string;
  sha256: string;
  bytes: number;
  mimeType: string;
}
export interface ComfyRunResult {
  promptId: string;
  queueNumber?: number;
  outputs: ComfySavedOutput[];
  status: 'COMPLETED';
}
export interface ComfyImageOptions {
  prompt: string;
  checkpoint: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  timeoutSeconds?: number;
}
type ComfyHistory = Record<string, unknown>;

export class ComfyUiLocalProvider {
  readonly id = 'comfyui-local';
  readonly baseUrl: string;
  readonly outputDir: string;

  constructor(
    baseUrl = process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188',
    outputDir = process.env.OPENVIBES_OUTPUT_DIR ?? path.join(process.cwd(), 'generated'),
  ) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('INVALID_COMFYUI_URL');
    }
    this.baseUrl = url.toString().replace(/\/$/, '');
    this.outputDir = path.resolve(outputDir);
  }

  private async request(route: string, init?: RequestInit, timeoutMs = 15_000): Promise<Response> {
    const url = new URL(route, this.baseUrl);
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      const detail = await readResponseText(response, 4096, 'COMFYUI_HTTP_ERROR');
      throw new Error(`COMFYUI_HTTP_${response.status}: ${detail.slice(0, 1200)}`);
    }
    return response;
  }

  async serverInfo(): Promise<Record<string, unknown>> {
    const [system, queue] = await Promise.all([
      this.request('/system_stats').then((response) => response.json()),
      this.request('/queue').then((response) => response.json()),
    ]);
    return { provider: this.id, connected: true, baseUrl: this.baseUrl, system, queue };
  }

  async listCheckpoints(): Promise<string[]> {
    const response = await this.request('/models/checkpoints');
    const data: unknown = await response.json();
    return Array.isArray(data) ? data.filter((value): value is string => typeof value === 'string') : [];
  }

  private buildImageWorkflow(options: {
    prompt: string; checkpoint: string; negativePrompt: string;
    width: number; height: number; steps: number; cfg: number; seed: number;
  }): Record<string, unknown> {
    return {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: options.checkpoint } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: options.prompt, clip: ['1', 1] } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: options.negativePrompt, clip: ['1', 1] } },
      '4': { class_type: 'EmptyLatentImage', inputs: { width: options.width, height: options.height, batch_size: 1 } },
      '5': {
        class_type: 'KSampler',
        inputs: {
          seed: options.seed, steps: options.steps, cfg: options.cfg,
          sampler_name: 'euler', scheduler: 'normal', denoise: 1,
          model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
        },
      },
      '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
      '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'openvibes', images: ['6', 0] } },
    };
  }

  async createImageWorkflow(options: ComfyImageOptions): Promise<Record<string, unknown>> {
    const width = options.width ?? 768;
    const height = options.height ?? 768;
    const steps = options.steps ?? 24;
    const cfg = options.cfg ?? 7;
    const seed = options.seed ?? randomInt(0, 2 ** 31 - 1);
    if (!options.prompt.trim()) throw new Error('PROMPT_REQUIRED');
    if (!options.checkpoint.trim()) throw new Error('CHECKPOINT_REQUIRED');
    if (!Number.isInteger(width) || width < 256 || width > 2048 || width % 8 !== 0) {
      throw new Error('INVALID_IMAGE_WIDTH: Use a multiple of 8 between 256 and 2048.');
    }
    if (!Number.isInteger(height) || height < 256 || height > 2048 || height % 8 !== 0) {
      throw new Error('INVALID_IMAGE_HEIGHT: Use a multiple of 8 between 256 and 2048.');
    }
    if (!Number.isInteger(steps) || steps < 1 || steps > 100) throw new Error('INVALID_STEPS');
    if (!Number.isFinite(cfg) || cfg < 0 || cfg > 30) throw new Error('INVALID_CFG');

    const installed = await this.listCheckpoints();
    if (!installed.includes(options.checkpoint)) {
      throw new Error(`CHECKPOINT_NOT_INSTALLED: ${options.checkpoint}. Installed checkpoints: ${installed.join(', ') || '(none)'}`);
    }
    return this.buildImageWorkflow({
      prompt: options.prompt, checkpoint: options.checkpoint,
      negativePrompt: options.negativePrompt ?? '', width, height, steps, cfg, seed,
    });
  }

  async generateImage(options: ComfyImageOptions): Promise<ComfyRunResult> {
    const workflow = await this.createImageWorkflow(options);
    return this.run(workflow, options.timeoutSeconds ?? 300);
  }

  async submit(workflow: Record<string, unknown>): Promise<{ promptId: string; queueNumber?: number }> {
    if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow) || Object.keys(workflow).length === 0) {
      throw new Error('INVALID_WORKFLOW_OBJECT');
    }
    const requestBody = JSON.stringify({ prompt: workflow, client_id: randomUUID() });
    if (typeof requestBody !== 'string') throw new Error('WORKFLOW_SERIALIZATION_FAILED');
    const response = await this.request('/prompt', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: requestBody,
    });
    const data = await response.json() as {
      prompt_id?: string; number?: number; error?: unknown; node_errors?: unknown;
    };
    if (!data.prompt_id) {
      throw new Error(`COMFYUI_WORKFLOW_REJECTED: ${JSON.stringify({
        error: data.error, node_errors: data.node_errors,
      }).slice(0, 2500)}`);
    }
    return {
      promptId: data.prompt_id,
      ...(typeof data.number === 'number' ? { queueNumber: data.number } : {}),
    };
  }

  async getHistory(promptId: string): Promise<ComfyHistory | undefined> {
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(promptId)) throw new Error('INVALID_PROMPT_ID');
    const response = await this.request(`/history/${encodeURIComponent(promptId)}`);
    const history = await readResponseJson<Record<string, ComfyHistory>>(response, 16 * 1024 * 1024, 'COMFYUI_HISTORY_RESPONSE');
    return history[promptId];
  }

  async wait(promptId: string, timeoutSeconds = 300, pollMs = 1500): Promise<ComfyHistory> {
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(promptId)) throw new Error('INVALID_PROMPT_ID');
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (Date.now() < deadline) {
      const item = await this.getHistory(promptId);
      if (item) {
        const status = item.status as Record<string, unknown> | undefined;
        const statusText = String(status?.status_str ?? '').toLowerCase();
        if (status?.completed === true || statusText === 'success') return item;
        if (statusText === 'error' || status?.status === 'error') {
          throw new Error(`COMFYUI_JOB_FAILED: ${JSON.stringify(status).slice(0, 2000)}`);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    throw new Error('COMFYUI_WAIT_TIMEOUT: Job may still be running; use its prompt ID to check again.');
  }

  async cancel(promptId: string): Promise<{ cancelled: boolean; action: string }> {
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(promptId)) throw new Error('INVALID_PROMPT_ID');
    const queue = await this.request('/queue').then((response) => response.json()) as {
      queue_running?: unknown[][];
      queue_pending?: unknown[][];
    };
    const running = (queue.queue_running ?? []).some((entry) => entry[1] === promptId);
    if (running) {
      await this.request('/interrupt', { method: 'POST' });
      return { cancelled: true, action: 'interrupted_running_job' };
    }
    const pending = (queue.queue_pending ?? []).some((entry) => entry[1] === promptId);
    if (pending) {
      await this.request('/queue', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ delete: [promptId] }),
      });
      return { cancelled: true, action: 'removed_from_pending_queue' };
    }
    return { cancelled: false, action: 'not_in_active_queue' };
  }

  async download(promptId: string, history: ComfyHistory): Promise<ComfySavedOutput[]> {
    const raw = history.outputs;
    if (!raw || typeof raw !== 'object') throw new Error('COMFYUI_OUTPUTS_MISSING');

    const files: Array<{ file: ComfyOutput; category: 'images' | 'videos' }> = [];
    for (const node of Object.values(raw as Record<string, Record<string, unknown>>)) {
      for (const key of ['images', 'gifs', 'videos', 'animated']) {
        const values = node?.[key];
        if (Array.isArray(values)) {
          for (const item of values) {
            if (item && typeof item === 'object' && typeof (item as ComfyOutput).filename === 'string') {
              files.push({ file: item as ComfyOutput, category: key === 'images' ? 'images' : 'videos' });
            }
          }
        }
      }
    }
    if (files.length === 0) throw new Error('COMFYUI_NO_MEDIA_OUTPUTS_FOUND');

    const results: ComfySavedOutput[] = [];
    for (const { file, category } of files) {
      const filename = path.basename(file.filename);
      const extension = path.extname(filename).toLowerCase();
      const allowed = category === 'images'
        ? ['.png', '.jpg', '.jpeg', '.webp', '.gif']
        : ['.mp4', '.webm', '.gif'];
      if (!allowed.includes(extension)) continue;

      const target = safeAssetPath(this.outputDir, category, filename);
      const query = new URLSearchParams({
        filename: file.filename, subfolder: file.subfolder ?? '', type: file.type ?? 'output',
      });
      const response = await this.request(`/view?${query.toString()}`, undefined, 120_000);
      const bytes = await readResponseBuffer(response, 512 * 1024 * 1024, 'COMFYUI_MEDIA');\n      if (!bytes.length) throw new Error('COMFYUI_EMPTY_MEDIA_OUTPUT');
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });

      let finalPath = target;
      try {
        await fs.writeFile(finalPath, bytes, { mode: 0o600, flag: 'wx' });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        finalPath = path.join(
          path.dirname(target),
          `${path.parse(filename).name}-${promptId.slice(0, 8)}-${randomUUID().slice(0, 8)}${extension}`,
        );
        await fs.writeFile(finalPath, bytes, { mode: 0o600, flag: 'wx' });
      }
      results.push({
        path: finalPath, filename: path.basename(finalPath),
        sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
        mimeType: extension === '.mp4' ? 'video/mp4'
          : extension === '.webm' ? 'video/webm'
          : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg'
          : extension === '.webp' ? 'image/webp'
          : extension === '.gif' ? 'image/gif' : 'image/png',
      });
    }
    if (results.length === 0) throw new Error('NO_SUPPORTED_MEDIA_OUTPUTS');
    return results;
  }

  async run(workflow: Record<string, unknown>, timeoutSeconds = 300): Promise<ComfyRunResult> {
    const submitted = await this.submit(workflow);
    const history = await this.wait(submitted.promptId, timeoutSeconds);
    const outputs = await this.download(submitted.promptId, history);
    return {
      promptId: submitted.promptId,
      ...(typeof submitted.queueNumber === 'number' ? { queueNumber: submitted.queueNumber } : {}),
      outputs, status: 'COMPLETED',
    };
  }
}
