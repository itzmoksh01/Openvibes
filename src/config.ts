import os from 'node:os';
import path from 'node:path';
export interface DailyLimits { cloudflare: number; pollinations: number; comfyui: number; }
export interface OpenvibesConfig { dataDir: string; outputDir: string; databasePath: string; dailyLimits: DailyLimits; }
function dailyLimit(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw=env[name];
  if(raw===undefined||raw.trim()==='') return fallback;
  const value=Number(raw);
  if(!Number.isSafeInteger(value)||value<0||value>1_000_000) throw new Error('INVALID_DAILY_LIMIT: '+name+' must be an integer from 0 to 1000000 (0 means unlimited).');
  return value;
}
export function getConfig(env: NodeJS.ProcessEnv=process.env): OpenvibesConfig {
  const dataDir=path.resolve(env.OPENVIBES_DATA_DIR??path.join(os.homedir(),'.openvibes','data'));
  const outputDir=path.resolve(env.OPENVIBES_OUTPUT_DIR??path.join(os.homedir(),'Openvibes','generated'));
  return {dataDir,outputDir,databasePath:path.join(dataDir,'openvibes.sqlite'),dailyLimits:{
    cloudflare:dailyLimit(env,'OPENVIBES_DAILY_CLOUDFLARE_LIMIT',20),
    pollinations:dailyLimit(env,'OPENVIBES_DAILY_POLLINATIONS_LIMIT',20),
    comfyui:dailyLimit(env,'OPENVIBES_DAILY_COMFYUI_LIMIT',0),
  }};
}
