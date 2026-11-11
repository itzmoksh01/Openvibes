import os from 'node:os';
import path from 'node:path';

export interface DailyLimits { cloudflare: number; pollinations: number; comfyui: number; }
export interface OpenvibesConfig {
  dataDir: string;
  outputDir: string;
  databasePath: string;
  dailyLimits: DailyLimits;
}
function readDailyLimit(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error('INVALID_DAILY_LIMIT: ' + key + ' must be an integer from 0 to 1000000; 0 means unlimited.');
  }
  return value;
}
export function getConfig(env: NodeJS.ProcessEnv = process.env): OpenvibesConfig {
  const dataDir = path.resolve(env.OPENVIBES_DATA_DIR ?? path.join(os.homedir(), '.openvibes', 'data'));
  const outputDir = path.resolve(env.OPENVIBES_OUTPUT_DIR ?? path.join(os.homedir(), 'Openvibes', 'generated'));
  return {
    dataDir, outputDir, databasePath: path.join(dataDir, 'openvibes.sqlite'),
    dailyLimits: {
      cloudflare: readDailyLimit(env, 'OPENVIBES_DAILY_CLOUDFLARE_LIMIT', 20),
      pollinations: readDailyLimit(env, 'OPENVIBES_DAILY_POLLINATIONS_LIMIT', 20),
      comfyui: readDailyLimit(env, 'OPENVIBES_DAILY_COMFYUI_LIMIT', 0),
    },
  };
}
