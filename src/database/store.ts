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
    if (currentVersion > 1) {
      this.db.close();
      throw new Error(`DATABASE_SCHEMA_TOO_NEW: database version ${currentVersion} is newer than supported version 1.`);
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
      PRAGMA user_version=1;
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
    this.db.prepare(
      'INSERT INTO jobs(id,kind,state,provider,prompt,optimized_prompt,input_json,output_json,error_code,error_message,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      row.id, row.kind, row.state, row.provider, row.prompt, row.optimizedPrompt,
      row.inputJson, row.outputJson, row.errorCode, row.errorMessage, row.createdAt, row.updatedAt,
    );
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
    this.db.prepare(
      'INSERT INTO assets(id,job_id,filename,mime_type,size_bytes,sha256,path,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    ).run(
      row.id, row.jobId, row.filename, row.mimeType, row.sizeBytes,
      row.sha256, row.path, row.metadataJson, row.createdAt,
    );
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
