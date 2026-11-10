import fs from 'node:fs';
import process from 'node:process';
import type { OpenvibesConfig } from '../config.js';

function directoryStatus(directory: string): { writable: boolean; error?: string } {
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK);
    return { writable: true };
  } catch (error) {
    return { writable: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function isSupportedNode(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major > 22 || (major === 22 && (minor > 13 || (minor === 13 && patch >= 0)));
}

export function diagnose(config: OpenvibesConfig, env: NodeJS.ProcessEnv = process.env) {
  const data = directoryStatus(config.dataDir);
  const output = directoryStatus(config.outputDir);
  const cloudflareAccountValid = /^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID ?? '');
  const cloudflareTokenPresent = Boolean(env.CLOUDFLARE_API_TOKEN?.trim());
  let comfyUrlValid = false;
  try {
    const url = new URL(env.COMFYUI_URL ?? 'http://127.0.0.1:8188');
    comfyUrlValid = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    comfyUrlValid = false;
  }

  return {
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      minimumNode: '22.13.0',
      supported: isSupportedNode(process.version),
    },
    storage: {
      dataDirectory: config.dataDir,
      dataDirectoryWritable: data.writable,
      ...(data.error ? { dataDirectoryError: data.error } : {}),
      outputDirectory: config.outputDir,
      outputDirectoryWritable: output.writable,
      ...(output.error ? { outputDirectoryError: output.error } : {}),
    },
    providers: {
      metaVibes: {
        id: 'meta-vibes-free',
        status: 'BLOCKED',
        reason: 'No documented and authorized unattended free-Vibes generation interface has been verified.',
      },
      cloudflareWorkersAi: {
        id: 'cloudflare-workers-ai',
        status: cloudflareAccountValid && cloudflareTokenPresent
          ? 'CONFIGURED_NOT_LIVE_TESTED'
          : 'NEEDS_USER_CREDENTIALS',
        accountIdValid: cloudflareAccountValid,
        tokenPresent: cloudflareTokenPresent,
      },
      pollinations: {
        id: 'pollinations-hosted',
        status: env.OPENVIBES_POLLINATIONS_API_KEY?.trim()
          ? 'CONFIGURED_NOT_LIVE_TESTED'
          : 'NEEDS_USER_KEY',
        apiKeyPresent: Boolean(env.OPENVIBES_POLLINATIONS_API_KEY?.trim()),
      },
      comfyUiLocal: {
        id: 'comfyui-local',
        status: comfyUrlValid ? 'CONFIGURED_NOT_CONNECTED' : 'INVALID_URL',
        urlValid: comfyUrlValid,
        networkChecked: false,
      },
    },
    network: {
      checked: false,
      note: 'Doctor validates local configuration only; provider connectivity and credentials are not tested to avoid unexpected network calls or generation charges.',
    },
  };
}
