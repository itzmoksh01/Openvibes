import os from 'node:os';
import path from 'node:path';
export interface OpenvibesConfig { dataDir:string; outputDir:string; databasePath:string; }
export function getConfig(env:NodeJS.ProcessEnv=process.env):OpenvibesConfig { const dataDir=path.resolve(env.OPENVIBES_DATA_DIR??path.join(os.homedir(),'.openvibes','data')); const outputDir=path.resolve(env.OPENVIBES_OUTPUT_DIR??path.join(os.homedir(),'Openvibes','generated')); return {dataDir,outputDir,databasePath:path.join(dataDir,'openvibes.sqlite')}; }
