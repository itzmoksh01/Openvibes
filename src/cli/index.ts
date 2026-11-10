import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { getConfig } from '../config.js';
import { Store } from '../database/store.js';
import { diagnose } from '../services/diagnostics.js';

const usage = "Openvibes CLI\n\nCommands:\n  openvibes setup [--client auto|all|muse|antigravity|codex|claude|zed]\n  openvibes status\n  openvibes doctor\n  openvibes jobs\n  openvibes assets\n  openvibes mcp\n  openvibes auth login\n  openvibes uninstall\n\nEnvironment:\n  COMFYUI_URL             Local ComfyUI base URL\n  OPENVIBES_DATA_DIR      Persistent jobs/assets database directory\n  OPENVIBES_OUTPUT_DIR    Generated media directory\n";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function commandAvailable(command: string): boolean {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore', windowsHide: true });
  return !result.error && result.status === 0;
}

function zedSettingsPath(home: string): string {
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Zed', 'settings.json');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Zed', 'settings.json');
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'zed', 'settings.json');
}

function detectClients() {
  const home = os.homedir();
  const museConfig = path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'muse', 'settings.json');
  const antigravityConfig = path.join(home, '.gemini', 'config', 'mcp_config.json');
  const codexConfig = path.join(home, '.codex', 'config.toml');
  const claudeConfig = path.join(home, '.claude.json');
  const zedConfig = zedSettingsPath(home);
  return [
    { name: 'Muse Code', command: 'muse', installed: commandAvailable('muse'), config: museConfig, configured: fs.existsSync(museConfig) },
    { name: 'Antigravity', command: 'agy', installed: commandAvailable('agy'), config: antigravityConfig, configured: fs.existsSync(antigravityConfig) },
    { name: 'Codex', command: 'codex', installed: commandAvailable('codex'), config: codexConfig, configured: fs.existsSync(codexConfig) },
    { name: 'Claude Code', command: 'claude', installed: commandAvailable('claude'), config: claudeConfig, configured: fs.existsSync(claudeConfig) },
    { name: 'Zed', command: 'zed', installed: commandAvailable('zed'), config: zedConfig, configured: fs.existsSync(zedConfig) },
  ];
}

function writeJsonConfig(
  filePath: string,
  serverConfig: JsonObject,
  options: { museSchema?: boolean; rootKey?: string } = {},
) {
  const rootKey = options.rootKey ?? 'mcpServers';
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  let config: JsonObject = {};
  const existed = fs.existsSync(filePath);
  if (existed) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      throw new Error('CONFIG_INVALID_JSON: ' + filePath + '. Fix it manually; Openvibes will not overwrite it.');
    }
    if (!isObject(parsed)) throw new Error('CONFIG_NOT_OBJECT: ' + filePath);
    config = parsed;
  }
  if (options.museSchema) {
    if (config.schema_version !== undefined && config.schema_version !== 1) {
      throw new Error('MUSE_SCHEMA_VERSION_UNSUPPORTED: ' + String(config.schema_version));
    }
    config.schema_version = 1;
  }
  const servers = config[rootKey] === undefined ? {} : config[rootKey];
  if (!isObject(servers)) throw new Error(rootKey.toUpperCase() + '_NOT_OBJECT: ' + filePath);

  const previous = servers.openvibes;
  let alreadyConfigured = false;
  if (previous !== undefined && isObject(previous)) {
    if (previous.command !== serverConfig.command ||
        JSON.stringify(previous.args) !== JSON.stringify(serverConfig.args)) {
      throw new Error('OPENVIBES_CONFIG_CONFLICT: Existing entry in ' + filePath + ' points somewhere else; it was left unchanged.');
    }
    const updated = { ...previous, ...serverConfig };
    alreadyConfigured = JSON.stringify(previous) === JSON.stringify(updated);
    servers.openvibes = updated;
  } else {
    servers.openvibes = serverConfig;
  }
  config[rootKey] = servers;
  if (alreadyConfigured) return { path: filePath, alreadyConfigured: true };

  let backup: string | undefined;
  if (existed) {
    backup = filePath + '.openvibes-backup-' + new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(filePath, backup);
  }
  const temporary = filePath + '.openvibes-' + process.pid + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, filePath);
  return { path: filePath, ...(backup ? { backup } : {}), alreadyConfigured: false };
}

function clientEnvironment(config: ReturnType<typeof getConfig>): Record<string, string> {
  return {
    COMFYUI_URL: process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188',
    OPENVIBES_DATA_DIR: config.dataDir,
    OPENVIBES_OUTPUT_DIR: config.outputDir,
  };
}

function installMuse(config: ReturnType<typeof getConfig>, entrypoint: string) {
  const file = path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'muse', 'settings.json');
  const result = writeJsonConfig(file, {
    type: 'stdio', command: process.execPath, args: [entrypoint, 'mcp'],
    env: clientEnvironment(config), required: false, tool_timeout_sec: 600,
  }, { museSchema: true });
  return { client: 'Muse Code', ...result };
}

function installAntigravity(config: ReturnType<typeof getConfig>, entrypoint: string) {
  const file = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
  const result = writeJsonConfig(file, {
    type: 'stdio', command: process.execPath, args: [entrypoint, 'mcp'],
    env: clientEnvironment(config),
  });
  return { client: 'Antigravity', ...result };
}

function installCodex(config: ReturnType<typeof getConfig>, entrypoint: string) {
  const list = spawnSync('codex', ['mcp', 'list'], { encoding: 'utf8', windowsHide: true });
  if (list.error || list.status !== 0) {
    throw new Error('CODEX_MCP_LIST_FAILED: run codex mcp list manually to inspect the current configuration.');
  }
  if (/\bopenvibes\b/i.test(list.stdout ?? '')) {
    return { client: 'Codex', alreadyConfigured: true, note: 'Existing entry was left unchanged.' };
  }
  const env = clientEnvironment(config);
  const result = spawnSync('codex', [
    'mcp', 'add', 'openvibes',
    '--env', 'COMFYUI_URL=' + env.COMFYUI_URL,
    '--env', 'OPENVIBES_DATA_DIR=' + env.OPENVIBES_DATA_DIR,
    '--env', 'OPENVIBES_OUTPUT_DIR=' + env.OPENVIBES_OUTPUT_DIR,
    '--', process.execPath, entrypoint, 'mcp',
  ], { encoding: 'utf8', stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error('CODEX_MCP_ADD_FAILED: ' + (result.error?.message ?? result.stderr ?? result.status));
  }
  return { client: 'Codex', alreadyConfigured: false };
}

function installClaude(config: ReturnType<typeof getConfig>, entrypoint: string) {
  const list = spawnSync('claude', ['mcp', 'list'], { encoding: 'utf8', windowsHide: true });
  if (list.error || list.status !== 0) {
    throw new Error('CLAUDE_MCP_LIST_FAILED: run claude mcp list manually to inspect the current configuration.');
  }
  if (/\bopenvibes\b/i.test(list.stdout ?? '')) {
    return { client: 'Claude Code', alreadyConfigured: true, note: 'Existing entry was left unchanged.' };
  }
  const env = clientEnvironment(config);
  const result = spawnSync('claude', [
    'mcp', 'add', '--scope', 'user', '--transport', 'stdio',
    '-e', 'COMFYUI_URL=' + env.COMFYUI_URL,
    '-e', 'OPENVIBES_DATA_DIR=' + env.OPENVIBES_DATA_DIR,
    '-e', 'OPENVIBES_OUTPUT_DIR=' + env.OPENVIBES_OUTPUT_DIR,
    'openvibes', '--', process.execPath, entrypoint, 'mcp',
  ], { encoding: 'utf8', stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error('CLAUDE_MCP_ADD_FAILED: ' + (result.error?.message ?? result.stderr ?? result.status));
  }
  return { client: 'Claude Code', alreadyConfigured: false };
}

function installZed(config: ReturnType<typeof getConfig>, entrypoint: string) {
  const file = zedSettingsPath(os.homedir());
  const result = writeJsonConfig(file, {
    command: process.execPath,
    args: [entrypoint, 'mcp'],
    env: clientEnvironment(config),
    timeout: 600,
  }, { rootKey: 'context_servers' });
  return { client: 'Zed', ...result };
}

function setupClients(args: string[], config: ReturnType<typeof getConfig>) {
  const clientFlag = args.indexOf('--client');
  const requested = clientFlag >= 0 ? (args[clientFlag + 1] ?? 'auto') : 'auto';
  const valid = ['auto', 'all', 'muse', 'antigravity', 'codex', 'claude', 'zed'];
  if (!valid.includes(requested)) throw new Error('UNKNOWN_CLIENT: ' + requested + '. Choose: ' + valid.join(', ') + '.');

  const entrypoint = path.resolve(process.argv[1] ?? path.join(process.cwd(), 'dist', 'src', 'index.js'));
  const clients = detectClients();
  const muse = clients.find((client) => client.name === 'Muse Code');
  const antigravity = clients.find((client) => client.name === 'Antigravity');
  const codex = clients.find((client) => client.name === 'Codex');
  const claude = clients.find((client) => client.name === 'Claude Code');
  const zed = clients.find((client) => client.name === 'Zed');
  const selected = requested === 'all'
    ? ['muse', 'antigravity', 'codex', 'claude', 'zed']
    : requested === 'auto'
      ? [
          ...(muse?.installed || muse?.configured ? ['muse'] : []),
          ...(antigravity?.installed || antigravity?.configured ? ['antigravity'] : []),
          ...(codex?.installed ? ['codex'] : []),
          ...(claude?.installed ? ['claude'] : []),
          ...(zed?.installed || zed?.configured ? ['zed'] : []),
        ]
      : [requested];

  fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(config.outputDir, { recursive: true, mode: 0o700 });
  const configured: unknown[] = [];
  const errors: unknown[] = [];
  for (const client of selected) {
    try {
      if (client === 'muse') configured.push(installMuse(config, entrypoint));
      else if (client === 'antigravity') configured.push(installAntigravity(config, entrypoint));
      else if (client === 'codex') configured.push(installCodex(config, entrypoint));
      else if (client === 'claude') configured.push(installClaude(config, entrypoint));
      else if (client === 'zed') configured.push(installZed(config, entrypoint));
    } catch (error) {
      errors.push({ client, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    requested, configured, errors, detectedClients: clients,
    ...(selected.length === 0 ? {
      note: 'No supported MCP client was detected. Install Muse Code, Antigravity, Codex, Claude Code or Zed, then run openvibes setup --client auto, or follow docs/CLIENT-SETUP.md.',
    } : {}),
  };
}

export async function runCli(args: string[]): Promise<void> {
  const command = args[0] ?? 'help';
  const config = getConfig();
  if (['help', '--help', '-h'].includes(command)) {
    process.stdout.write(usage);
    return;
  }
  if (command === 'setup') {
    try {
      process.stdout.write(JSON.stringify(setupClients(args.slice(1), config), null, 2) + '\n');
    } catch (error) {
      process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
      process.exitCode = 2;
    }
    return;
  }
  if (command === 'status' || command === 'doctor') {
    process.stdout.write(JSON.stringify(diagnose(config), null, 2) + '\n');
    return;
  }
  if (command === 'jobs' || command === 'assets') {
    const store = new Store(config.databasePath);
    try {
      const rows = command === 'jobs' ? store.listJobs(50) : store.listAssets(50);
      process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
    } finally {
      store.close();
    }
    return;
  }
  if (command === 'auth') {
    process.stdout.write(JSON.stringify({
      status: 'not_available',
      message: 'No official Meta Vibes OAuth/API authorization flow has been verified. Never provide passwords or session cookies.',
    }, null, 2) + '\n');
    return;
  }
  if (command === 'uninstall') {
    process.stdout.write('Uninstall removes the package only. Local data and generated assets are preserved.\n');
    return;
  }
  process.stderr.write(usage);
  process.exitCode = 2;
}
