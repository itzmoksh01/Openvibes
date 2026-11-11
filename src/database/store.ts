import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { AssetRecord, JobKind, JobRecord, JobState } from '../types.js';

const allowedJobTransitions: Record<JobState, ReadonlySet<JobState>> = {
  QUEUED: new Set<JobState>(['QUEUED', 'VALIDATING', 'FAILED', 'CANCELLED', 'BLOCKED']),
  VALIDATING: new Set<JobState>(['VALIDATING', 'AUTHENTICATING', 'SUBMITTING', 'FAILED', 'CANCELLED', 'BLOCKED', 'RATE_LIMITED']),
  AUTHENTICATING: new Set<JobState>(['AUTHENTICATING', 'SUBMITTING', 'FAILED', 'CANCELLED', 'BLOCKED', 'RATE_LIMITED']),
  SUBMITTING: new Set<JobState>(['SUBMITTING', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'DOWNLOADING', 'VERIFYING', 'SAVED', 'FAILED', 'CANCELLED', 'RATE_LIMITED', 'BLOCKED']),
  SUBMITTED: new Set<JobState>(['SUBMITTED', 'PROCESSING', 'COMPLETED', 'DOWNLOADING', 'VERIFYING', 'SAVED', 'FAILED', 'CANCELLED', 'RATE_LIMITED']),
  PROCESSING: new Set<JobState>(['PROCESSING', 'COMPLETED', 'DOWNLOADING', 'VERIFYING', 'SAVED', 'FAILED', 'CANCELLED', 'RATE_LIMITED']),
  COMPLETED: new Set<JobState>(['COMPLETED', 'DOWNLOADING', 'VERIFYING', 'SAVED', 'FAILED']),
  DOWNLOADING: new Set<JobState>(['DOWNLOADING', 'PROCESSING', 'VERIFYING', 'SAVED', 'FAILED', 'CANCELLED']),
  VERIFYING: new Set<JobState>(['VERIFYING', 'SAVED', 'FAILED']),
  SAVED: new Set<JobState>(['SAVED']),
  FAILED: new Set<JobState>(['FAILED']),
  CANCELLED: new Set<JobState>(['CANCELLED']),
  RATE_LIMITED: new Set<JobState>(['RATE_LIMITED', 'SUBMITTING', 'FAILED', 'CANCELLED']),
  BLOCKED: new Set<JobState>(['BLOCKED']),
};

export class Store {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    const absolutePath = path.resolve(databasePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(absolutePath);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;');
    const currentVersionRow = this.db.prepare('PRAGMA user_version').get() as { user_version?: number };
    const currentVersion = Number(currentVersionRow.user_version ?? 0);
    if (currentVersion > 3) {
      this.db.close();
      throw new Error(`DATABASE_SCHEMA_TOO_NEW: database version ${currentVersion} is newer than supported version 3.`);
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        state TEXT NOT NULL,
        provider TEXT NOT NULL,
        prompt TEXT NOT NULL,
        optimized_prompt TEXT NOT NULL,
        input_json TEXT NOT NULL,
        output_json TEXT,
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id),
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        path TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assets_created ON assets(created_at DESC);
      CREATE TABLE IF NOT EXISTS provider_usage (
        provider TEXT NOT NULL,
        usage_date TEXT NOT NULL,
        used INTEGER NOT NULL CHECK (used >= 0),
        updated_at TEXT NOT NULL,
        PRIMARY KEY(provider, usage_date)
      );
      CREATE INDEX IF NOT EXISTS idx_provider_usage_date ON provider_usage(usage_date);
      CREATE TABLE IF NOT EXISTS generation_leases (
        token TEXT PRIMARY KEY, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_generation_leases_expiry ON generation_leases(expires_at);
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY, event_type TEXT NOT NULL, entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL, provider TEXT, details_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);
      PRAGMA user_version=3;
      `);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      this.db.close();
      throw error;
    }
    try {
      fs.chmodSync(absolutePath, 0o600);
    } catch {
      // Windows ACLs govern file access; the parent directory is still private to the user.
    }
  }

  createJob(input: {
    kind: JobKind;
    state: JobState;
    provider: string;
    prompt: string;
    optimizedPrompt: string;
    input: unknown;
    errorCode?: string;
    errorMessage?: string;
  }): JobRecord {
    const now = new Date().toISOString();
    const row: JobRecord = {
      id: randomUUID(),
      kind: input.kind,
      state: input.state,
      provider: input.provider,
      prompt: input.prompt,
      optimizedPrompt: input.optimizedPrompt,
      inputJson: JSON.stringify(input.input) ?? 'null',
      outputJson: null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(
        'INSERT INTO jobs(id,kind,state,provider,prompt,optimized_prompt,input_json,output_json,error_code,error_message,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        row.id, row.kind, row.state, row.provider, row.prompt, row.optimizedPrompt,
        row.inputJson, row.outputJson, row.errorCode, row.errorMessage, row.createdAt, row.updatedAt,
      );
      this.writeAuditEvent('job.created', 'job', row.id, row.provider, { kind: row.kind, state: row.state }, now);
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch { /* Preserve the original error. */ }
      throw error;
    }
    return row;
  }

  updateJob(
    id: string,
    state: JobState,
    output?: unknown,
    errorCode?: string,
    errorMessage?: string,
  ): void {
    const serializedOutput = output === undefined ? null : (JSON.stringify(output) ?? 'null');

    // Check and update the state under one write lock so concurrent MCP processes
    // cannot both validate a transition against the same stale state.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.db.prepare('SELECT state FROM jobs WHERE id=?').get(id) as { state?: unknown } | undefined;
      if (!current) throw new Error('JOB_NOT_FOUND: ' + id);

      const currentState = String(current.state) as JobState;
      if (!allowedJobTransitions[currentState]?.has(state)) {
        throw new Error('JOB_STATE_TRANSITION_NOT_ALLOWED: ' + currentState + ' -> ' + state);
      }

      const result = this.db.prepare(
        'UPDATE jobs SET state=?,output_json=COALESCE(?,output_json),error_code=?,error_message=?,updated_at=? WHERE id=? AND state=?',
      ).run(
        state,
        serializedOutput,
        errorCode ?? null,
        errorMessage ?? null,
        new Date().toISOString(),
        id,
        currentState,
      );
      if (Number(result.changes) !== 1) throw new Error('JOB_STATE_CONFLICT: ' + id);
      this.writeAuditEvent('job.state_changed', 'job', id, undefined, {
        from: currentState, to: state, ...(errorCode ? { errorCode } : {}),
      });
      this.db.exec('COMMIT');
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Preserve the original transition or database error.
      }
      throw error;
    }
  }

  addAsset(input: {
    jobId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    path: string;
    metadata?: unknown;
  }): AssetRecord {
    if (
      !input.filename ||
      input.filename.length > 255 ||
      path.basename(input.filename) !== input.filename ||
      input.filename.includes('/') ||
      input.filename.includes('\\')
    ) {
      throw new Error('INVALID_ASSET_FILENAME');
    }
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(input.mimeType)) {
      throw new Error('INVALID_ASSET_MIME_TYPE');
    }
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1) {
      throw new Error('INVALID_ASSET_SIZE');
    }
    if (!/^[a-f0-9]{64}$/i.test(input.sha256)) throw new Error('INVALID_ASSET_SHA256');
    if (!path.isAbsolute(input.path)) throw new Error('INVALID_ASSET_PATH');

    const row: AssetRecord = {
      id: randomUUID(),
      jobId: input.jobId,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      path: input.path,
      metadataJson: JSON.stringify(input.metadata ?? {}) ?? '{}',
      createdAt: new Date().toISOString(),
    };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(
        'INSERT INTO assets(id,job_id,filename,mime_type,size_bytes,sha256,path,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      ).run(
        row.id, row.jobId, row.filename, row.mimeType, row.sizeBytes,
        row.sha256, row.path, row.metadataJson, row.createdAt,
      );
      this.writeAuditEvent('asset.saved', 'asset', row.id, undefined, {
        jobId: row.jobId, filename: row.filename, mimeType: row.mimeType,
        sizeBytes: row.sizeBytes, sha256: row.sha256,
      }, row.createdAt);
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch { /* Preserve the original error. */ }
      throw error;
    }
    return row;
  }

  getJob(id: string): JobRecord | undefined {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapJob(row) : undefined;
  }

  getAsset(id: string): AssetRecord | undefined {
    const row = this.db.prepare('SELECT * FROM assets WHERE id=?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapAsset(row) : undefined;
  }

  listJobs(limit = 25): JobRecord[] {
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), 100);
    return (this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?').all(bounded) as Record<string, unknown>[])
      .map((row) => this.mapJob(row));
  }

  listAssets(limit = 50): AssetRecord[] {
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), 100);
    return (this.db.prepare('SELECT * FROM assets ORDER BY created_at DESC LIMIT ?').all(bounded) as Record<string, unknown>[])
      .map((row) => this.mapAsset(row));
  }

  getDailyUsage(provider: string, limit: number, at = new Date()) {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(provider)) throw new Error('INVALID_USAGE_PROVIDER');
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 1_000_000) throw new Error('INVALID_DAILY_LIMIT');
    if (Number.isNaN(at.getTime())) throw new Error('INVALID_USAGE_DATE');
    const date = at.toISOString().slice(0, 10);
    const row = this.db.prepare('SELECT used FROM provider_usage WHERE provider=? AND usage_date=?')
      .get(provider, date) as { used?: number } | undefined;
    const used = Number(row?.used ?? 0);
    return { provider, date, used, limit, remaining: limit === 0 ? null : Math.max(0, limit - used), unlimited: limit === 0 };
  }

  reserveDailyUsage(provider: string, limit: number, at = new Date()) {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(provider)) throw new Error('INVALID_USAGE_PROVIDER');
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 1_000_000) throw new Error('INVALID_DAILY_LIMIT');
    if (Number.isNaN(at.getTime())) throw new Error('INVALID_USAGE_DATE');
    const date = at.toISOString().slice(0, 10);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT used FROM provider_usage WHERE provider=? AND usage_date=?')
        .get(provider, date) as { used?: number } | undefined;
      const used = Number(row?.used ?? 0);
      if (limit > 0 && used >= limit) {
        throw new Error(`DAILY_USAGE_LIMIT_REACHED: provider=${provider} date=${date} limit=${limit} used=${used}. Increase the limit or wait until the next UTC day.`);
      }
      const nextUsed = used + 1;
      this.db.prepare(
        'INSERT INTO provider_usage(provider, usage_date, used, updated_at) VALUES(?,?,?,?) ' +
        'ON CONFLICT(provider, usage_date) DO UPDATE SET used=excluded.used, updated_at=excluded.updated_at',
      ).run(provider, date, nextUsed, new Date().toISOString());
      this.writeAuditEvent('provider.request_reserved', 'provider', provider, provider, { date, used: nextUsed, limit });
      this.db.exec('COMMIT');
      return { provider, date, used: nextUsed, limit, remaining: limit === 0 ? null : Math.max(0, limit - nextUsed), unlimited: limit === 0 };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch { /* Preserve the original error. */ }
      throw error;
    }
  }

  previewExpiredDataBefore(cutoffIso: string) {
    if (!Number.isFinite(Date.parse(cutoffIso))) throw new Error('INVALID_CLEANUP_CUTOFF');
    const jobs = this.db.prepare('SELECT COUNT(*) AS count FROM jobs WHERE created_at < ?')
      .get(cutoffIso) as { count?: number };
    const assets = this.db.prepare(
      'SELECT COUNT(*) AS count FROM assets WHERE job_id IN (SELECT id FROM jobs WHERE created_at < ?)',
    ).get(cutoffIso) as { count?: number };
    const auditEvents = this.db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE created_at < ?')
      .get(cutoffIso) as { count?: number };
    return { jobs: Number(jobs.count ?? 0), assets: Number(assets.count ?? 0), auditEvents: Number(auditEvents.count ?? 0) };
  }

  deleteExpiredDataBefore(cutoffIso: string) {
    if (!Number.isFinite(Date.parse(cutoffIso))) throw new Error('INVALID_CLEANUP_CUTOFF');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const assets = this.db.prepare(
        'SELECT path FROM assets WHERE job_id IN (SELECT id FROM jobs WHERE created_at < ?)',
      ).all(cutoffIso) as Array<{ path: string }>;
      const assetResult = this.db.prepare(
        'DELETE FROM assets WHERE job_id IN (SELECT id FROM jobs WHERE created_at < ?)',
      ).run(cutoffIso);
      const jobResult = this.db.prepare('DELETE FROM jobs WHERE created_at < ?').run(cutoffIso);
      const auditResult = this.db.prepare('DELETE FROM audit_events WHERE created_at < ?').run(cutoffIso);
      this.db.exec('COMMIT');
      return { jobsDeleted: Number(jobResult.changes), assetsDeleted: Number(assetResult.changes), auditEventsDeleted: Number(auditResult.changes), assetPaths: assets.map(row => String(row.path)) };
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch { /* Preserve the original error. */ }
      throw error;
    }
  }

  acquireGenerationLease(maxConcurrent: number, leaseMs: number, at = new Date()): string | null {
    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 100) throw new Error('INVALID_GENERATION_SLOT_LIMIT');
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 3_600_000) throw new Error('INVALID_GENERATION_LEASE');
    if (Number.isNaN(at.getTime())) throw new Error('INVALID_GENERATION_LEASE_DATE');
    const now = at.toISOString();
    const expiresAt = new Date(at.getTime() + leaseMs).toISOString();
    const token = randomUUID();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM generation_leases WHERE expires_at <= ?').run(now);
      const row = this.db.prepare('SELECT COUNT(*) AS count FROM generation_leases').get() as { count?: number };
      if (Number(row.count ?? 0) >= maxConcurrent) {
        this.db.exec('COMMIT');
        return null;
      }
      this.db.prepare('INSERT INTO generation_leases(token, expires_at, created_at) VALUES(?,?,?)')
        .run(token, expiresAt, now);
      this.writeAuditEvent('generation.slot_acquired', 'generation-slot', token, undefined, { maxConcurrent, expiresAt }, now);
      this.db.exec('COMMIT');
      return token;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch { /* Preserve the original error. */ }
      throw error;
    }
  }

  renewGenerationLease(token: string, leaseMs: number, at = new Date()): boolean {
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 3_600_000) throw new Error('INVALID_GENERATION_LEASE');
    if (Number.isNaN(at.getTime())) throw new Error('INVALID_GENERATION_LEASE_DATE');
    const result = this.db.prepare('UPDATE generation_leases SET expires_at=? WHERE token=? AND expires_at>?')
      .run(new Date(at.getTime() + leaseMs).toISOString(), token, at.toISOString());
    return Number(result.changes) === 1;
  }

  releaseGenerationLease(token: string): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.db.prepare('DELETE FROM generation_leases WHERE token=?').run(token);
      if (Number(result.changes) === 1) this.writeAuditEvent('generation.slot_released', 'generation-slot', token, undefined, {});
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch { /* Preserve the original error. */ }
      throw error;
    }
  }

  getGenerationSlotUsage(maxConcurrent: number, at = new Date()) {
    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) throw new Error('INVALID_GENERATION_SLOT_LIMIT');
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM generation_leases WHERE expires_at>?')
      .get(at.toISOString()) as { count?: number };
    const active = Number(row.count ?? 0);
    return { active, limit: maxConcurrent, available: Math.max(0, maxConcurrent - active) };
  }

  listAuditEvents(limit = 50): Array<{
    id: string; eventType: string; entityType: string; entityId: string;
    provider: string | null; detailsJson: string; createdAt: string;
  }> {
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), 200);
    const rows = this.db.prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?')
      .all(bounded) as Array<Record<string, unknown>>;
    return rows.map(row => ({
      id: String(row.id), eventType: String(row.event_type),
      entityType: String(row.entity_type), entityId: String(row.entity_id),
      provider: row.provider == null ? null : String(row.provider),
      detailsJson: String(row.details_json), createdAt: String(row.created_at),
    }));
  }

  private writeAuditEvent(
    eventType: string, entityType: string, entityId: string, provider: string | undefined,
    details: Record<string, unknown>, createdAt = new Date().toISOString(),
  ): void {
    // This trail intentionally excludes prompts, credentials, workflow graphs and local paths.
    this.db.prepare('INSERT INTO audit_events(id,event_type,entity_type,entity_id,provider,details_json,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(randomUUID(), eventType, entityType, entityId, provider ?? null, JSON.stringify(details) ?? '{}', createdAt);
  }

  close(): void {
    this.db.close();
  }

  private mapJob(row: Record<string, unknown>): JobRecord {
    return {
      id: String(row.id),
      kind: row.kind as JobKind,
      state: row.state as JobState,
      provider: String(row.provider),
      prompt: String(row.prompt),
      optimizedPrompt: String(row.optimized_prompt),
      inputJson: String(row.input_json),
      outputJson: row.output_json == null ? null : String(row.output_json),
      errorCode: row.error_code == null ? null : String(row.error_code),
      errorMessage: row.error_message == null ? null : String(row.error_message),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapAsset(row: Record<string, unknown>): AssetRecord {
    return {
      id: String(row.id),
      jobId: String(row.job_id),
      filename: String(row.filename),
      mimeType: String(row.mime_type),
      sizeBytes: Number(row.size_bytes),
      sha256: String(row.sha256),
      path: String(row.path),
      metadataJson: String(row.metadata_json),
      createdAt: String(row.created_at),
    };
  }
}
