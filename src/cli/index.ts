import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { getConfig } from '../config.js';
import { Store } from '../database/store.js';
import { diagnose } from '../services/diagnostics.js';

const usage = "Openvibes CLI\n\nCommands:\n  openvibes setup [--client auto|all|muse|antigravity|codex|claude|zed]\n  openvibes status\n  openvibes doctor\n  openvibes jobs\n  openvibes assets\n  openvibes usage\n  openvibes cleanup --older-than-days N [--yes]\n  openvibes mcp\n  openvibes auth login\n  openvibes uninstall\n\nEnvironment:\n  COMFYUI_URL             Local ComfyUI base URL (loopback by default)\n  OPENVIBES_ALLOW_REMOTE_COMFYUI  Set true only for a trusted HTTPS ComfyUI endpoint\n  OPENVIBES_DATA_DIR      Persistent jobs/assets database directory\n  OPENVIBES_OUTPUT_DIR    Generated media directory\n  OPENVIBES_POLLINATIONS_API_KEY  Optional user-owned hosted inference key (keep secret)\n  CLOUDFLARE_ACCOUNT_ID     Cloudflare Workers AI account ID\n  CLOUDFLARE_API_TOKEN      Cloudflare Workers AI API token (keep secret)\n  OPENVIBES_DAILY_CLOUDFLARE_LIMIT  Daily Cloudflare cap (default 20; 0 = unlimited)\n  OPENVIBES_DAILY_POLLINATIONS_LIMIT Daily Pollinations cap (default 20; 0 = unlimited)\n  OPENVIBES_DAILY_COMFYUI_LIMIT     Daily ComfyUI cap (default 0 = unlimited)\n";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function commandAvailable(command: string): boolean {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore', windowsHide: true, shell: process.platform === 'win32' });
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
  options: { rootKey?: string } = {},
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
  const servers = config[rootKey] === undefined ? {} : config[rootKey];
  if (!isObject(servers)) throw new Error(rootKey.toUpperCase() + '_NOT_OBJECT: ' + filePath);

  const previous = servers.openvibes;
  if (previous !== undefined && !isObject(previous)) {
    throw new Error('OPENVIBES_CONFIG_CONFLICT: Existing entry in ' + filePath + ' is not an object; it was left unchanged.');
  }
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
    backup = filePath + '.openvibes-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID();
    fs.copyFileSync(filePath, backup);
  }
  const temporary = filePath + '.openvibes-' + randomUUID() + '.tmp';
  let descriptor: number | undefined;
  try {
    // Exclusive creation prevents following a pre-created symlink at the temp path.
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, JSON.stringify(config, null, 2) + '\n', 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, filePath);
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* preserve original error */ }
    }
    try { fs.rmSync(temporary, { force: true }); } catch { /* preserve original error */ }
    throw error;
  }
  return { path: filePath, ...(backup ? { backup } : {}), alreadyConfigured: false };
}

function clientEnvironment(config: ReturnType<typeof getConfig>): Record<string, string> {
  return {
    COMFYUI_URL: process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188',
    OPENVIBES_DATA_DIR: config.dataDir,
    OPENVIBES_OUTPUT_DIR: config.outputDir,
    ...(process.env.OPENVIBES_ALLOW_REMOTE_COMFYUI === 'true'
      ? { OPENVIBES_ALLOW_REMOTE_COMFYUI: 'true' }
      : {}),
    OPENVIBES_DAILY_CLOUDFLARE_LIMIT: String(config.dailyLimits.cloudflare),
    OPENVIBES_DAILY_POLLINATIONS_LIMIT: String(config.dailyLimits.pollinations),
    OPENVIBES_DAILY_COMFYUI_LIMIT: String(config.dailyLimits.comfyui),
  };
}

function installMuse(config: ReturnType<typeof getConfig>, entrypoint: string) {
  const file = path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'muse', 'settings.json');
  const result = writeJsonConfig(file, {
    transport: 'stdio',
    command: process.execPath,
    args: [entrypoint, 'mcp'],
    env: clientEnvironment(config),
    enabled: true,
    mode: 'optional',
  }, { rootKey: 'mcp_servers' });
  return { client: 'Muse Code', ...result };
}

function installAntigravity(config: ReturnType<typeof getConfig>, entrypoint: string) {
  const file = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
  const result = writeJsonConfig(file, {
    command: process.execPath, args: [entrypoint, 'mcp'],
    env: clientEnvironment(config), timeoutSeconds: 600,
  });
  return { client: 'Antigravity', ...result };
}

function installCodex(config: ReturnType<typeof getConfig>, entrypoint: string) {
  const list = spawnSync('codex', ['mcp', 'list'], { encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' });
  if (list.error || list.status !== 0) {
    throw new Error('CODEX_MCP_LIST_FAILED: run codex mcp list manually to inspect the current configuration.');
  }
  if (/\bopenvibes\b/i.test(list.stdout ?? '')) {
    return { client: 'Codex', alreadyConfigured: true, note: 'Existing entry was left unchanged.' };
  }
  const env = clientEnvironment(config);
  const envArgs = Object.entries(env).flatMap(([key, value]) => ['--env', key + '=' + value]);
  const result = spawnSync('codex', ['mcp', 'add', 'openvibes', ...envArgs, '--', process.execPath, entrypoint, 'mcp'], { encoding: 'utf8', stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' });
  if (result.error || result.status !== 0) {
    throw new Error('CODEX_MCP_ADD_FAILED: ' + (result.error?.message ?? result.stderr ?? result.status));
  }
  return { client: 'Codex', alreadyConfigured: false };
}

function installClaude(config: ReturnType<typeof getConfig>, entrypoint: string) {
  const list = spawnSync('claude', ['mcp', 'list'], { encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' });
  if (list.error || list.status !== 0) {
    throw new Error('CLAUDE_MCP_LIST_FAILED: run claude mcp list manually to inspect the current configuration.');
  }
  if (/\bopenvibes\b/i.test(list.stdout ?? '')) {
    return { client: 'Claude Code', alreadyConfigured: true, note: 'Existing entry was left unchanged.' };
  }
  const env = clientEnvironment(config);
  const envArgs = Object.entries(env).flatMap(([key, value]) => ['-e', key + '=' + value]);
  const result = spawnSync('claude', ['mcp', 'add', '--scope', 'user', '--transport', 'stdio', ...envArgs, 'openvibes', '--', process.execPath, entrypoint, 'mcp'], { encoding: 'utf8', stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' });
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
  }, { rootKey: 'context_servers' });
  return { client: 'Zed', ...result };
}

function setupClients(args: string[], config: ReturnType<typeof getConfig>) {
  const clientFlag = args.indexOf('--client');
  const requested = clientFlag >= 0 ? (args[clientFlag + 1] ?? 'auto') : 'auto';
  const valid = ['auto', 'all', 'muse', 'antigravity', 'codex', 'claude', 'zed'];
  if (!valid.includes(requested)) throw new Error('UNKNOWN_CLIENT: ' + requested + '. Choose: ' + valid.join(', ') + '.');

  const entrypoint = fs.realpathSync(path.resolve(process.argv[1] ?? path.join(process.cwd(), 'dist', 'src', 'index.js')));
  const clients = detectClients();
  const antigravity = clients.find((client) => client.name === 'Antigravity');
  const codex = clients.find((client) => client.name === 'Codex');
  const claude = clients.find((client) => client.name === 'Claude Code');
  const zed = clients.find((client) => client.name === 'Zed');
  const selected = requested === 'all'
    ? ['muse', 'antigravity', 'codex', 'claude', 'zed']
    : requested === 'auto'
      ? [
          'muse',
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
      const report = setupClients(args.slice(1), config);
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      if (report.errors.length > 0) process.exitCode = 2;
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
  if (command === 'usage') {
    const store = new Store(config.databasePath);
    try {
      process.stdout.write(JSON.stringify({
        timezone: 'UTC',
        providers: {
          'cloudflare-workers-ai': store.getDailyUsage('cloudflare-workers-ai', config.dailyLimits.cloudflare),
          'pollinations-hosted': store.getDailyUsage('pollinations-hosted', config.dailyLimits.pollinations),
          'comfyui-local': store.getDailyUsage('comfyui-local', config.dailyLimits.comfyui),
        },
        note: 'Request counts are not dollar-spend estimates; provider-side budgets still apply.',
      }, null, 2) + '\n');
    } finally { store.close(); }
    return;
  }
  if (command === 'cleanup') {
    const index = args.indexOf('--older-than-days');
    const days = index >= 0 ? Number(args[index + 1]) : NaN;
    if (!Number.isSafeInteger(days) || days < 1 || days > 3650) {
      process.stderr.write('Usage: openvibes cleanup --older-than-days N [--yes] (N must be 1..3650).\n');
      process.exitCode = 2;
      return;
    }
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const store = new Store(config.databasePath);
    try {
      const preview = store.previewExpiredDataBefore(cutoff);
      if (!args.includes('--yes')) {
        process.stdout.write(JSON.stringify({ dryRun: true, cutoff, olderThanDays: days, jobsThatWouldBeDeleted: preview.jobs, assetsThatWouldBeDeleted: preview.assets, note: 'Nothing deleted. Add --yes to permanently delete old records and eligible media under OPENVIBES_OUTPUT_DIR.' }, null, 2) + '\n');
        return;
      }
      const result = store.deleteExpiredDataBefore(cutoff);
      let filesDeleted = 0, filesMissing = 0, filesSkippedOutsideOutputDir = 0;
      const fileErrors: string[] = [];
      const outputRoot = path.resolve(config.outputDir);
      for (const assetPath of result.assetPaths) {
        const resolved = path.resolve(assetPath);
        const relative = path.relative(outputRoot, resolved);
        if (!relative || relative === '.' || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
          filesSkippedOutsideOutputDir++; continue;
        }
        try {
          const stat = fs.lstatSync(resolved);
          if (stat.isFile() || stat.isSymbolicLink()) { fs.unlinkSync(resolved); filesDeleted++; }
          else filesSkippedOutsideOutputDir++;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') filesMissing++;
          else fileErrors.push(resolved + ': ' + (error instanceof Error ? error.message : String(error)));
        }
      }
      process.stdout.write(JSON.stringify({ dryRun: false, cutoff, olderThanDays: days, jobsDeleted: result.jobsDeleted, assetsDeleted: result.assetsDeleted, filesDeleted, filesMissing, filesSkippedOutsideOutputDir, fileErrors }, null, 2) + '\n');
      if (fileErrors.length > 0) process.exitCode = 1;
    } finally { store.close(); }
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
