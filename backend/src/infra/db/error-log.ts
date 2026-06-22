import { randomUUID } from 'crypto';
import { query, toJsonb } from './pool';

export interface ErrorLogEntry {
  id: string;
  at: string;
  source: string;
  message: string;
  stack: string | null;
  data: Record<string, unknown>;
}

export interface LogErrorContext {
  source: string;
  data?: Record<string, unknown>;
}

interface PersistErrorInput {
  id: string;
  at: string;
  source: string;
  message: string;
  stack: string | null;
  data: Record<string, unknown>;
}

let initPromise: Promise<void> | null = null;

function normalizeError(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack ?? null };
  }

  return { message: String(error), stack: null };
}

function mapRow(row: {
  id: string;
  at: Date;
  source: string;
  message: string;
  stack: string | null;
  data: Record<string, unknown> | null;
}): ErrorLogEntry {
  return {
    id: row.id,
    at: row.at.toISOString(),
    source: row.source,
    message: row.message,
    stack: row.stack,
    data: row.data ?? {},
  };
}

function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = query(`
      CREATE TABLE IF NOT EXISTS error_log (
        id UUID PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        stack TEXT,
        data JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE INDEX IF NOT EXISTS idx_error_log_at
        ON error_log (at DESC);

      CREATE INDEX IF NOT EXISTS idx_error_log_source
        ON error_log (source);
    `).then(() => undefined);
  }

  return initPromise;
}

async function persistError(input: PersistErrorInput): Promise<void> {
  await ensureInit();

  await query(
    `INSERT INTO error_log (id, at, source, message, stack, data)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [input.id, input.at, input.source, input.message, input.stack, toJsonb(input.data)]
  );
}

export function logError(error: unknown, context: LogErrorContext): void {
  const { message, stack } = normalizeError(error);
  const id = randomUUID();
  const at = new Date().toISOString();
  const data = context.data ?? {};

  console.error(`[error-log] ${context.source}: ${message}`);

  void persistError({
    id,
    at,
    source: context.source,
    message,
    stack,
    data,
  }).catch((persistFailure) => {
    console.error(
      '[error-log] failed to persist:',
      persistFailure instanceof Error ? persistFailure.message : persistFailure
    );
  });
}

export async function getRecentErrors(options?: {
  limit?: number;
  source?: string;
}): Promise<ErrorLogEntry[]> {
  await ensureInit();

  const limit = options?.limit ?? 50;
  const params: unknown[] = [limit];
  let sql = `
    SELECT id, at, source, message, stack, data
    FROM error_log
  `;

  if (options?.source) {
    params.push(options.source);
    sql += ` WHERE source = $2`;
  }

  sql += ` ORDER BY at DESC LIMIT $1`;

  const result = await query<{
    id: string;
    at: Date;
    source: string;
    message: string;
    stack: string | null;
    data: Record<string, unknown> | null;
  }>(sql, params);

  return result.rows.map(mapRow);
}
