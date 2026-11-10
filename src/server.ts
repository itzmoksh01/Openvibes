import { randomInt } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { getConfig } from './config.js';
import { Store } from './database/store.js';
import { MetaVibesFreeProvider } from './providers/meta-vibes-free.js';
import { ComfyUiLocalProvider } from './providers/comfyui-local.js';
import { PollinationsProvider } from './providers/pollinations.js';
import { CloudflareWorkersAiProvider } from './providers/cloudflare-workers-ai.js';
import { optimizePrompt } from './services/prompt-engine.js';
import { diagnose } from './services/diagnostics.js';
import type { JobKind } from './types.js';

const config = getConfig();
const store = new Store(config.databasePath);
const metaVibes = new MetaVibesFreeProvider();
const comfy = new ComfyUiLocalProvider(process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188', config.outputDir);
const pollinations = new PollinationsProvider(process.env.OPENVIBES_POLLINATIONS_API_KEY, config.outputDir);
const cloudflare = new CloudflareWorkersAiProvider(process.env.CLOUDFLARE_ACCOUNT_ID, process.env.CLOUDFLARE_API_TOKEN, config.outputDir);
const server = new McpServer({ name: 'openvibes', version: '0.3.0' });
const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) ?? String(value) }],
});

const generationSchema = z.object({
  prompt: z.string().min(1).max(10_000),
  style: z.string().max(300).optional(),
  subject: z.string().max(1000).optional(),
  composition: z.string().max(1000).optional(),
  lighting: z.string().max(1000).optional(),
  aspect_ratio: z.string().max(30).optional(),
  camera_movement: z.string().max(1000).optional(),
  duration: z.number().int().min(1).max(120).optional(),
  scene: z.string().max(2000).optional(),
  action: z.string().max(2000).optional(),
  reference_images: z.array(z.string().max(2000)).max(4).optional(),
  output_count: z.number().int().min(1).max(4).optional(),
});

function parseJobOutput(jobId: string): Record<string, unknown> {
  const job = store.getJob(jobId);
  if (!job?.outputJson) return {};
  try {
    const value: unknown = JSON.parse(job.outputJson);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function saveAssets(jobId: string, promptId: string, outputs: Awaited<ReturnType<ComfyUiLocalProvider['download']>>) {
  return outputs.map((output) => store.addAsset({
    jobId,
    filename: output.filename,
    mimeType: output.mimeType,
    sizeBytes: output.bytes,
    sha256: output.sha256,
    path: output.path,
    metadata: { promptId, provider: comfy.id },
  }));
}

async function blockedMeta(kind: JobKind, input: z.infer<typeof generationSchema>) {
  const optimizedPrompt = optimizePrompt(kind, input);
  const capabilities = await metaVibes.getCapabilities();
  const job = store.createJob({
    kind,
    state: 'BLOCKED',
    provider: metaVibes.id,
    prompt: input.prompt,
    optimizedPrompt,
    input,
    errorCode: 'META_VIBES_AUTOMATION_UNVERIFIED',
    errorMessage: capabilities.reason,
  });
  return text({
    success: false,
    state: job.state,
    jobId: job.id,
    provider: metaVibes.id,
    originalPrompt: job.prompt,
    optimizedPrompt: job.optimizedPrompt,
    error: { code: job.errorCode, message: job.errorMessage },
    nextStep: 'Use the local ComfyUI tools, or see docs/META-FEASIBILITY.md. Openvibes never substitutes a paid API.',
  });
}

async function runComfyWorkflow(
  kind: JobKind,
  prompt: string,
  workflow: Record<string, unknown>,
  timeoutSeconds: number,
) {
  const job = store.createJob({
    kind,
    state: 'SUBMITTING',
    provider: comfy.id,
    prompt,
    optimizedPrompt: optimizePrompt(kind, { prompt }),
    input: { workflow },
  });

  let promptId: string | undefined;
  try {
    const submitted = await comfy.submit(workflow);
    promptId = submitted.promptId;
    store.updateJob(job.id, 'SUBMITTED', {
      promptId,
      ...(typeof submitted.queueNumber === 'number' ? { queueNumber: submitted.queueNumber } : {}),
    });

    const history = await comfy.wait(promptId, timeoutSeconds);
    store.updateJob(job.id, 'DOWNLOADING', { promptId });
    const outputs = await comfy.download(promptId, history);
    const assets = saveAssets(job.id, promptId, outputs);
    store.updateJob(job.id, 'SAVED', { promptId, outputs, assets });
    return text({
      success: true,
      state: 'SAVED',
      jobId: job.id,
      provider: comfy.id,
      promptId,
      outputs,
      assets,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const pending = message.includes('COMFYUI_WAIT_TIMEOUT');
    store.updateJob(
      job.id,
      pending ? 'PROCESSING' : 'FAILED',
      { ...(promptId ? { promptId } : {}), error: message },
      pending ? 'COMFYUI_WAIT_TIMEOUT' : 'COMFYUI_JOB_FAILED',
      message,
    );
    return text({
      success: false,
      state: pending ? 'PROCESSING' : 'FAILED',
      jobId: job.id,
      ...(promptId ? { promptId } : {}),
      provider: comfy.id,
      error: message,
      nextStep: pending
        ? 'Use openvibes_wait_for_job with this jobId to continue waiting and download results automatically.'
        : 'Check the ComfyUI console, installed models, and workflow node errors.',
    });
  }
}

server.registerTool(
  'openvibes_get_capabilities',
  {
    description: 'Show verified provider status. Meta Vibes free-plan automation is blocked until Meta documents and authorizes it. Local ComfyUI is the free self-hosted alternative.',
    inputSchema: z.object({}),
  },
  async () => text({
    metaVibes: await metaVibes.getCapabilities(),
    cloudflareWorkersAi: {
      provider: cloudflare.id,
      status: /^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID ?? '') && Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim()) ? 'CONFIGURED_NOT_LIVE_TESTED' : 'NEEDS_USER_CREDENTIALS',
      modalities: ['text', 'image', 'text-to-speech'],
      defaultTextModel: '@cf/google/gemma-4-26b-a4b-it',
      defaultImageModel: '@cf/black-forest-labs/flux-1-schnell',
      billing: 'Free Workers AI allocation: 10,000 Neurons/day. Default Gemma 4: $0.10/M input and $0.30/M output tokens (9,091/27,273 Neurons per M tokens). FLUX.1-schnell: $0.0000528 per 512x512 tile (4.8 Neurons). Aura-1: $0.015/1,000 characters (1,363.64 Neurons). Above the daily free allocation, Workers Paid is required and usage costs $0.011/1,000 Neurons.',
    },
    hosted: {
      provider: pollinations.id,
      status: process.env.OPENVIBES_POLLINATIONS_API_KEY?.trim() ? 'CONFIGURED_NOT_LIVE_TESTED' : 'NEEDS_USER_KEY',
      modalities: ['text', 'image', 'video', 'audio'],
      models: 'Discovered live from the provider catalog; pricing and access vary by model and user account.',
      billing: 'User-authorized Pollinations account and Pollen budget; no free/unlimited usage is promised.',
    },
    comfyUiLocal: {
      provider: comfy.id,
      status: 'CONDITIONAL',
      imageGeneration: 'Available when ComfyUI is running and a compatible checkpoint is installed.',
      videoGeneration: 'Available when a compatible video workflow and its required models/custom nodes are installed.',
      billing: 'No per-generation provider fee for local inference; hardware and electricity are yours.',
    },
  }),
);

server.registerTool(
  'openvibes_generate_image',
  {
    description: 'Generate with Meta Vibes free plan. Currently returns BLOCKED because authorized unattended free-plan API access has not been verified.',
    inputSchema: generationSchema,
  },
  async (input) => blockedMeta('image', input),
);
server.registerTool(
  'openvibes_generate_video',
  {
    description: 'Generate with Meta Vibes free plan. Currently returns BLOCKED because authorized unattended free-plan API access has not been verified.',
    inputSchema: generationSchema,
  },
  async (input) => blockedMeta('video', input),
);
server.registerTool(
  'openvibes_animate_image',
  {
    description: 'Animate an image with Meta Vibes free plan. Currently returns BLOCKED pending an authorized unattended interface.',
    inputSchema: generationSchema.extend({ source_image: z.string().min(1).max(2000) }),
  },
  async (input) => blockedMeta('image-to-video', input),
);

server.registerTool(
  'openvibes_cloudflare_generate_text',
  {
    description: 'Generate text online using Cloudflare Workers AI. Default is Google Gemma 4 26B A4B. Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN. Cloudflare Free Workers includes 10,000 Neurons/day. Gemma 4 costs $0.10/M input and $0.30/M output tokens (Neurons); usage above the daily allowance requires Workers Paid.',
    inputSchema: z.object({
      prompt: z.string().min(1).max(20000),
      model: z.string().min(1).max(200).default('@cf/google/gemma-4-26b-a4b-it'),
    }),
  },
  async ({ prompt, model }) => {
    try {
      return text({ success: true, provider: cloudflare.id, model, result: await cloudflare.generateText(prompt, model) });
    } catch (error) {
      return text({ success: false, provider: cloudflare.id, error: error instanceof Error ? error.message : String(error) });
    }
  },
);
server.registerTool(
  'openvibes_cloudflare_generate_audio',
  {
    description: 'Generate speech online using Cloudflare Deepgram Aura-1 TTS by default. Saves MP3/audio output locally. Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN. Deepgram Aura-1 is priced at $0.015 per 1,000 characters (1,363.64 Neurons); eligible use can consume the daily 10,000-Neuron free allocation. Above that allowance, Workers Paid is required. This is text-to-speech, not music generation.',
    inputSchema: z.object({
      text: z.string().min(1).max(10000),
      model: z.string().min(1).max(200).default('@cf/deepgram/aura-1'),
      options: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    }),
  },
  async ({ text: speechText, model, options }) => {
    let jobId: string | undefined;
    try {
      const job = store.createJob({ kind: 'audio', state: 'SUBMITTING', provider: cloudflare.id, prompt: speechText, optimizedPrompt: speechText, input: { model, options: options ?? {} } });
      jobId = job.id;
      const output = await cloudflare.generateAudio(speechText, model, options ?? {});
      const asset = store.addAsset({ jobId, filename: output.filename, mimeType: output.mimeType, sizeBytes: output.sizeBytes, sha256: output.sha256, path: output.path, metadata: { model, provider: cloudflare.id } });
      store.updateJob(jobId, 'SAVED', { output, asset, model });
      return text({ success: true, state: 'SAVED', jobId, provider: cloudflare.id, model, output, asset });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (jobId) store.updateJob(jobId, 'FAILED', { error: message }, 'CLOUDFLARE_TTS_FAILED', message);
      return text({ success: false, state: 'FAILED', ...(jobId ? { jobId } : {}), provider: cloudflare.id, error: message });
    }
  },
);

server.registerTool(
  'openvibes_cloudflare_generate_image',
  {
    description: 'Generate an image online using Cloudflare-hosted FLUX.1-schnell by default. Saves image locally and records it in SQLite. Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN. FLUX.1-schnell costs $0.0000528 per 512x512 tile (4.8 Neurons); eligible usage can consume the 10,000-Neuron daily free allowance. Above that allowance, Workers Paid is required.',
    inputSchema: z.object({
      prompt: z.string().min(1).max(2048),
      model: z.string().min(1).max(200).default('@cf/black-forest-labs/flux-1-schnell'),
      options: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    }),
  },
  async ({ prompt, model, options }) => {
    let jobId: string | undefined;
    try {
      const job = store.createJob({ kind: 'image', state: 'SUBMITTING', provider: cloudflare.id, prompt, optimizedPrompt: prompt, input: { model, options: options ?? {} } });
      jobId = job.id;
      const output = await cloudflare.generateImage(prompt, model, options ?? {});
      const asset = store.addAsset({ jobId, filename: output.filename, mimeType: output.mimeType, sizeBytes: output.sizeBytes, sha256: output.sha256, path: output.path, metadata: { model, provider: cloudflare.id } });
      store.updateJob(jobId, 'SAVED', { output, asset, model });
      return text({ success: true, state: 'SAVED', jobId, provider: cloudflare.id, model, output, asset });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (jobId) store.updateJob(jobId, 'FAILED', { error: message }, 'CLOUDFLARE_GENERATION_FAILED', message);
      return text({ success: false, state: 'FAILED', ...(jobId ? { jobId } : {}), provider: cloudflare.id, error: message });
    }
  },
);

server.registerTool(
  'openvibes_hosted_list_models',
  {
    description: 'Discover currently available hosted text, image, video or audio models and their published capabilities/pricing. Public model catalog; generation still requires the user-owned Pollinations API key and account budget.',
    inputSchema: z.object({ category: z.enum(['text', 'image', 'video', 'audio']).optional() }),
  },
  async ({ category }) => {
    try {
      return text({ success: true, provider: pollinations.id, category: category ?? 'all', models: await pollinations.listModels(category) });
    } catch (error) {
      return text({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  },
);
server.registerTool(
  'openvibes_hosted_generate_text',
  {
    description: 'Generate text using a currently available hosted model via Pollinations. Model IDs should come from openvibes_hosted_list_models. Requires OPENVIBES_POLLINATIONS_API_KEY and user-owned account budget.',
    inputSchema: z.object({ prompt: z.string().min(1).max(20000), model: z.string().min(1).max(200) }),
  },
  async ({ prompt, model }) => {
    try {
      return text({ success: true, provider: pollinations.id, model, result: await pollinations.generateText(prompt, model) });
    } catch (error) {
      return text({ success: false, provider: pollinations.id, error: error instanceof Error ? error.message : String(error) });
    }
  },
);
server.registerTool(
  'openvibes_hosted_generate_media',
  {
    description: 'Generate and download an image, video or speech/audio file using a hosted Pollinations model. The model must be selected from the live catalog. Media is saved locally and registered in Openvibes. Requires a user-owned Pollinations key and available Pollen budget; model costs vary.',
    inputSchema: z.object({
      kind: z.enum(['image', 'video', 'audio']),
      prompt: z.string().min(1).max(10000),
      model: z.string().min(1).max(200),
      options: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    }),
  },
  async ({ kind, prompt, model, options }) => {
    let jobId: string | undefined;
    try {
      const job = store.createJob({
        kind,
        state: 'SUBMITTING',
        provider: pollinations.id,
        prompt,
        optimizedPrompt: prompt,
        input: { model, options: options ?? {} },
      });
      jobId = job.id;
      const output = await pollinations.generateMedia(kind, prompt, model, options ?? {});
      const asset = store.addAsset({
        jobId,
        filename: output.filename,
        mimeType: output.mimeType,
        sizeBytes: output.sizeBytes,
        sha256: output.sha256,
        path: output.path,
        metadata: { model, provider: pollinations.id, providerJobId: output.providerJobId },
      });
      store.updateJob(jobId, 'SAVED', { output, asset, model });
      return text({ success: true, state: 'SAVED', jobId, provider: pollinations.id, model, output, asset });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (jobId) store.updateJob(jobId, 'FAILED', { error: message }, 'POLLINATIONS_GENERATION_FAILED', message);
      return text({ success: false, state: 'FAILED', ...(jobId ? { jobId } : {}), provider: pollinations.id, error: message });
    }
  },
);

server.registerTool(
  'openvibes_comfy_server_info',
  {
    description: 'Check the local ComfyUI server, hardware information and execution queue. Defaults to http://127.0.0.1:8188 or COMFYUI_URL.',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      return text(await comfy.serverInfo());
    } catch (error) {
      return text({
        success: false,
        provider: comfy.id,
        error: error instanceof Error ? error.message : String(error),
        setup: 'Install and start ComfyUI locally, then see docs/COMFYUI-LOCAL.md.',
      });
    }
  },
);
server.registerTool(
  'openvibes_comfy_list_checkpoints',
  {
    description: 'List checkpoint models installed in the local ComfyUI instance. Use one of these exact names with openvibes_comfy_generate_image.',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const checkpoints = await comfy.listCheckpoints();
      return text({ success: true, provider: comfy.id, checkpoints });
    } catch (error) {
      return text({ success: false, provider: comfy.id, error: error instanceof Error ? error.message : String(error) });
    }
  },
);

const imageSchema = z.object({
  prompt: z.string().min(1).max(10_000),
  checkpoint: z.string().min(1).max(500),
  negative_prompt: z.string().max(5000).default(''),
  width: z.number().int().min(256).max(2048).multipleOf(8).default(768),
  height: z.number().int().min(256).max(2048).multipleOf(8).default(768),
  steps: z.number().int().min(1).max(100).default(24),
  cfg: z.number().min(0).max(30).default(7),
  seed: z.number().int().min(0).max(2_147_483_646).optional(),
  timeout_seconds: z.number().int().min(1).max(600).default(30),
});
server.registerTool(
  'openvibes_comfy_generate_image',
  {
    description: 'Generate a text-to-image result in one call using standard ComfyUI nodes and an installed checkpoint. Waits for the job, downloads the image locally and saves it to the Openvibes asset library. No cloud fallback.',
    inputSchema: imageSchema,
  },
  async (input) => {
    try {
      const checkpoints = await comfy.listCheckpoints();
      if (!checkpoints.includes(input.checkpoint)) {
        return text({
          success: false,
          error: 'CHECKPOINT_NOT_INSTALLED',
          requested: input.checkpoint,
          installed: checkpoints,
          nextStep: 'Call openvibes_comfy_list_checkpoints and choose an installed checkpoint.',
        });
      }
      const workflow = await comfy.createImageWorkflow({
        prompt: input.prompt,
        checkpoint: input.checkpoint,
        negativePrompt: input.negative_prompt,
        width: input.width,
        height: input.height,
        steps: input.steps,
        cfg: input.cfg,
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      });
      return await runComfyWorkflow('image', input.prompt, workflow, input.timeout_seconds);
    } catch (error) {
      return text({ success: false, provider: comfy.id, error: error instanceof Error ? error.message : String(error) });
    }
  },
);

const workflowSchema = z.object({
  workflow: z.record(z.string(), z.unknown()),
  prompt: z.string().min(1).max(10_000).default('ComfyUI workflow'),
  kind: z.enum(['image', 'video', 'image-to-video']).default('image'),
  timeout_seconds: z.number().int().min(1).max(600).default(300),
});
server.registerTool(
  'openvibes_comfy_run_workflow',
  {
    description: 'Run an API-format ComfyUI workflow on the local machine. Supports compatible image, video and image-to-video graphs; waits, downloads media into OPENVIBES_OUTPUT_DIR, and records job/assets. Requires a running local ComfyUI and compatible models/custom nodes.',
    inputSchema: workflowSchema,
  },
  async (input) => runComfyWorkflow(input.kind, input.prompt, input.workflow, input.timeout_seconds),
);

server.registerTool(
  'openvibes_comfy_check_job',
  {
    description: 'Check a local ComfyUI prompt ID without starting another generation.',
    inputSchema: z.object({ prompt_id: z.string().min(8).max(80) }),
  },
  async ({ prompt_id }) => {
    try {
      const history = await comfy.getHistory(prompt_id);
      if (!history) return text({ promptId: prompt_id, state: 'PROCESSING' });
      const status = history.status as Record<string, unknown> | undefined;
      return text({
        promptId: prompt_id,
        state: status?.completed === true ? 'COMPLETED' : status?.status_str ?? 'PROCESSING',
        status,
        outputs: history.outputs ?? {},
      });
    } catch (error) {
      return text({ success: false, promptId: prompt_id, error: error instanceof Error ? error.message : String(error) });
    }
  },
);

server.registerTool(
  'openvibes_comfy_download_outputs',
  {
    description: 'Download outputs for a finished local ComfyUI job and record them in the Openvibes asset library. The prompt ID must belong to the supplied Openvibes job.',
    inputSchema: z.object({ prompt_id: z.string().min(8).max(80), job_id: z.string().uuid() }),
  },
  async ({ prompt_id, job_id }) => {
    try {
      const job = store.getJob(job_id);
      if (!job || job.provider !== comfy.id) return text({ success: false, error: 'COMFY_JOB_NOT_FOUND', jobId: job_id });
      const saved = parseJobOutput(job_id);
      if (saved.promptId !== prompt_id) return text({ success: false, error: 'PROMPT_JOB_MISMATCH' });
      if (job.state === 'SAVED') return text({ success: true, state: 'SAVED', jobId: job_id, ...saved });
      const history = await comfy.getHistory(prompt_id);
      if (!history) return text({ success: false, state: 'PROCESSING', promptId: prompt_id });
      const status = history.status as Record<string, unknown> | undefined;
      if (!(status?.completed === true || String(status?.status_str ?? '').toLowerCase() === 'success')) {
        return text({ success: false, state: status?.status_str ?? 'PROCESSING', promptId: prompt_id });
      }
      const outputs = await comfy.download(prompt_id, history);
      const assets = saveAssets(job_id, prompt_id, outputs);
      store.updateJob(job_id, 'SAVED', { promptId: prompt_id, outputs, assets });
      return text({ success: true, state: 'SAVED', jobId: job_id, outputs, assets });
    } catch (error) {
      return text({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  },
);

server.registerTool(
  'openvibes_get_job',
  {
    description: 'Retrieve a persisted job by ID.',
    inputSchema: z.object({ job_id: z.string().uuid() }),
  },
  async ({ job_id }) => text(store.getJob(job_id) ?? { error: 'JOB_NOT_FOUND', jobId: job_id }),
);
server.registerTool(
  'openvibes_wait_for_job',
  {
    description: 'Wait for a persisted local ComfyUI job, then download and save its media automatically. Returns immediately for terminal or non-Comfy jobs.',
    inputSchema: z.object({
      job_id: z.string().uuid(),
      timeout_seconds: z.number().int().min(1).max(600).default(30),
    }),
  },
  async ({ job_id, timeout_seconds }) => {
    const job = store.getJob(job_id);
    if (!job) return text({ error: 'JOB_NOT_FOUND', jobId: job_id });
    if (job.provider !== comfy.id || ['SAVED', 'FAILED', 'CANCELLED', 'BLOCKED'].includes(job.state)) {
      return text(job);
    }
    const stored = parseJobOutput(job_id);
    const promptId = typeof stored.promptId === 'string' ? stored.promptId : undefined;
    if (!promptId) return text(job);
    try {
      const history = await comfy.wait(promptId, timeout_seconds);
      store.updateJob(job_id, 'DOWNLOADING', { promptId });
      const outputs = await comfy.download(promptId, history);
      const assets = saveAssets(job_id, promptId, outputs);
      store.updateJob(job_id, 'SAVED', { promptId, outputs, assets });
      return text({ success: true, state: 'SAVED', jobId: job_id, promptId, outputs, assets });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('COMFYUI_WAIT_TIMEOUT')) {
        store.updateJob(job_id, 'PROCESSING', { promptId, error: message }, 'COMFYUI_WAIT_TIMEOUT', message);
        return text({ success: false, state: 'PROCESSING', jobId: job_id, promptId, error: message });
      }
      store.updateJob(job_id, 'FAILED', { promptId, error: message }, 'COMFYUI_JOB_FAILED', message);
      return text({ success: false, state: 'FAILED', jobId: job_id, promptId, error: message });
    }
  },
);
server.registerTool(
  'openvibes_cancel_job',
  {
    description: 'Cancel a queued or currently running local ComfyUI job. Does not interrupt other ComfyUI jobs.',
    inputSchema: z.object({ job_id: z.string().uuid() }),
  },
  async ({ job_id }) => {
    const job = store.getJob(job_id);
    if (!job) return text({ error: 'JOB_NOT_FOUND', jobId: job_id });
    if (job.provider !== comfy.id) return text({ success: false, state: job.state, message: 'This job is not a local ComfyUI job.' });
    const stored = parseJobOutput(job_id);
    const promptId = typeof stored.promptId === 'string' ? stored.promptId : undefined;
    if (!promptId) return text({ success: false, state: job.state, message: 'No ComfyUI prompt ID is stored for this job.' });
    try {
      const result = await comfy.cancel(promptId);
      if (result.cancelled) store.updateJob(job_id, 'CANCELLED', { promptId, cancelAction: result.action });
      return text({ success: result.cancelled, jobId: job_id, promptId, ...result });
    } catch (error) {
      return text({ success: false, jobId: job_id, error: error instanceof Error ? error.message : String(error) });
    }
  },
);
server.registerTool(
  'openvibes_list_jobs',
  {
    description: 'List recent generation jobs.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(25) }),
  },
  async ({ limit }) => text(store.listJobs(limit)),
);
server.registerTool(
  'openvibes_list_assets',
  {
    description: 'List media assets stored by Openvibes.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(50) }),
  },
  async ({ limit }) => text(store.listAssets(limit)),
);
server.registerTool(
  'openvibes_get_asset',
  {
    description: 'Retrieve stored asset metadata by ID.',
    inputSchema: z.object({ asset_id: z.string().uuid() }),
  },
  async ({ asset_id }) => text(store.getAsset(asset_id) ?? {
    error: 'ASSET_NOT_FOUND',
    assetId: asset_id,
  }),
);
server.registerTool(
  'openvibes_doctor',
  {
    description: 'Diagnose runtime and local storage without exposing secrets. Does not claim ComfyUI is online unless its server check succeeds.',
    inputSchema: z.object({}),
  },
  async () => {
    let comfyUi: Record<string, unknown>;
    try {
      const info = await comfy.serverInfo();
      comfyUi = { connected: true, baseUrl: comfy.baseUrl, queue: info.queue };
    } catch (error) {
      comfyUi = {
        connected: false,
        baseUrl: comfy.baseUrl,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const local = diagnose(config);
    return text({
      ...local,
      providers: {
        ...local.providers,
        metaVibes: {
          ...(await metaVibes.getCapabilities()),
          status: 'BLOCKED',
        },
        pollinations: {
          ...local.providers.pollinations,
          provider: pollinations.id,
        },
        cloudflareWorkersAi: {
          ...local.providers.cloudflareWorkersAi,
          provider: cloudflare.id,
        },
        comfyUiLocal: {
          ...local.providers.comfyUiLocal,
          ...comfyUi,
          status: comfyUi.connected === true ? 'CONNECTED'
            : comfy.configurationError ? 'INVALID_URL' : 'CONFIGURED_NOT_CONNECTED',
        },
      },
    });
  },
);

export { server, store };
