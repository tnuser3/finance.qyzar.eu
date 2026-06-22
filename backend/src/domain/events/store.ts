import { createHash, randomUUID } from 'crypto';
import { query } from '../../infra/db/pool';
import * as watchlist from '../watchlist/watchlist';
import { logError } from '../../infra/db/error-log';

export type EventType = 'regulatory' | 'news' | 'sentiment' | 'market';
export type EventSeverity = 'low' | 'medium' | 'high';
export type EventStatus = 'pending' | 'processing' | 'done' | 'skipped';

export interface CompanyEvent {
  id: string;
  companyId: string;
  ticker?: string;
  companyName?: string;
  industry?: string;
  eventType: EventType;
  source: string;
  title: string;
  url: string;
  description: string | null;
  publishedAt: string | null;
  severity: EventSeverity;
  status: EventStatus;
  aiSummary: string | null;
  relatedTickers: string[];
  metadata: Record<string, unknown>;
  detectedAt: string;
  processedAt: string | null;
}

let initialized = false;

function mapRow(row: {
  id: string;
  company_id: string;
  event_type: string;
  source: string;
  title: string;
  url: string;
  description?: string | null;
  published_at?: Date | null;
  severity: string;
  status: string;
  ai_summary?: string | null;
  related_tickers?: string[] | null;
  metadata?: Record<string, unknown> | null;
  detected_at: Date;
  processed_at: Date | null;
  ticker?: string;
  company_name?: string;
  industry?: string;
}): CompanyEvent {
  return {
    id: row.id,
    companyId: row.company_id,
    ticker: row.ticker,
    companyName: row.company_name,
    industry: row.industry,
    eventType: row.event_type as EventType,
    source: row.source,
    title: row.title,
    url: row.url,
    description: row.description ?? null,
    publishedAt: row.published_at?.toISOString() ?? null,
    severity: row.severity as EventSeverity,
    status: row.status as EventStatus,
    aiSummary: row.ai_summary ?? null,
    relatedTickers: Array.isArray(row.related_tickers) ? row.related_tickers : [],
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? row.metadata
        : {},
    detectedAt: row.detected_at.toISOString(),
    processedAt: row.processed_at?.toISOString() ?? null,
  };
}

function dedupKey(companyId: string, url: string): string {
  return createHash('sha256').update(`${companyId}:${url}`).digest('hex');
}

export async function init(): Promise<void> {
  if (initialized) return;

  await watchlist.init();

  await query(`
    CREATE TABLE IF NOT EXISTS company_events (
      id UUID PRIMARY KEY,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      dedup_key TEXT NOT NULL,
      detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMPTZ,
      UNIQUE (dedup_key)
    );

    CREATE INDEX IF NOT EXISTS idx_events_status ON company_events (status);
    CREATE INDEX IF NOT EXISTS idx_events_company ON company_events (company_id);
    CREATE INDEX IF NOT EXISTS idx_events_detected ON company_events (detected_at DESC);
  `);

  await query(`
    ALTER TABLE company_events ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE company_events ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
    ALTER TABLE company_events ADD COLUMN IF NOT EXISTS ai_summary TEXT;
    ALTER TABLE company_events ADD COLUMN IF NOT EXISTS related_tickers JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE company_events ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  initialized = true;
}

export interface InsertEventInput {
  companyId: string;
  eventType: EventType;
  source: string;
  title: string;
  url: string;
  severity?: EventSeverity;
  description?: string;
  publishedAt?: string;
  aiSummary?: string;
  relatedTickers?: string[];
  metadata?: Record<string, unknown>;
}

export async function insertEvent(input: InsertEventInput): Promise<CompanyEvent | null> {
  await init();

  const key = dedupKey(input.companyId, input.url);
  const id = randomUUID();

  try {
    await query(
      `INSERT INTO company_events (
         id, company_id, event_type, source, title, url, severity, dedup_key,
         description, published_at, ai_summary, related_tickers, metadata
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)
       ON CONFLICT (dedup_key) DO NOTHING`,
      [
        id,
        input.companyId,
        input.eventType,
        input.source,
        input.title,
        input.url,
        input.severity ?? 'medium',
        key,
        input.description ?? null,
        input.publishedAt ?? null,
        input.aiSummary ?? null,
        JSON.stringify(input.relatedTickers ?? []),
        JSON.stringify(input.metadata ?? {}),
      ]
    );

    const result = await query<Parameters<typeof mapRow>[0]>(
      `SELECT e.*, c.ticker, c.name AS company_name, c.industry
       FROM company_events e
       JOIN companies c ON c.id = e.company_id
       WHERE e.dedup_key = $1`,
      [key]
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } catch (error) {
      logError(error, { source: 'util/events.ts - insertEvent' });
    return null;
  }
}

export interface ListEventsOptions {
  limit?: number;
  offset?: number;
  status?: EventStatus;
  severity?: EventSeverity;
  eventType?: EventType;
  source?: string;
  ticker?: string;
  companyId?: string;
  from?: string;
  to?: string;
}

export async function listEvents(options: ListEventsOptions = {}): Promise<CompanyEvent[]> {
  await init();

  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let index = 1;

  if (options.status) {
    conditions.push(`e.status = $${index++}`);
    params.push(options.status);
  }

  if (options.severity) {
    conditions.push(`e.severity = $${index++}`);
    params.push(options.severity);
  }

  if (options.eventType) {
    conditions.push(`e.event_type = $${index++}`);
    params.push(options.eventType);
  }

  if (options.source) {
    conditions.push(`e.source = $${index++}`);
    params.push(options.source);
  }

  if (options.companyId) {
    conditions.push(`e.company_id = $${index++}`);
    params.push(options.companyId);
  }

  if (options.ticker) {
    conditions.push(`c.ticker = $${index++}`);
    params.push(options.ticker.trim().toUpperCase());
  }

  if (options.from) {
    conditions.push(`e.detected_at >= $${index++}`);
    params.push(options.from);
  }

  if (options.to) {
    conditions.push(`e.detected_at <= $${index++}`);
    params.push(options.to);
  }

  params.push(limit, offset);

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT e.*, c.ticker, c.name AS company_name, c.industry
     FROM company_events e
     JOIN companies c ON c.id = e.company_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY e.detected_at DESC
     LIMIT $${index++} OFFSET $${index}`,
    params
  );

  return result.rows.map(mapRow);
}

export async function countEvents(options: Omit<ListEventsOptions, 'limit' | 'offset'> = {}): Promise<number> {
  await init();

  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let index = 1;

  if (options.status) {
    conditions.push(`e.status = $${index++}`);
    params.push(options.status);
  }

  if (options.severity) {
    conditions.push(`e.severity = $${index++}`);
    params.push(options.severity);
  }

  if (options.eventType) {
    conditions.push(`e.event_type = $${index++}`);
    params.push(options.eventType);
  }

  if (options.source) {
    conditions.push(`e.source = $${index++}`);
    params.push(options.source);
  }

  if (options.companyId) {
    conditions.push(`e.company_id = $${index++}`);
    params.push(options.companyId);
  }

  if (options.ticker) {
    conditions.push(`c.ticker = $${index++}`);
    params.push(options.ticker.trim().toUpperCase());
  }

  if (options.from) {
    conditions.push(`e.detected_at >= $${index++}`);
    params.push(options.from);
  }

  if (options.to) {
    conditions.push(`e.detected_at <= $${index++}`);
    params.push(options.to);
  }

  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM company_events e
     JOIN companies c ON c.id = e.company_id
     WHERE ${conditions.join(' AND ')}`,
    params
  );

  return Number(result.rows[0]?.count ?? 0);
}

export async function getPendingEvents(limit = 10): Promise<CompanyEvent[]> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT e.*, c.ticker, c.name AS company_name, c.industry
     FROM company_events e
     JOIN companies c ON c.id = e.company_id
     WHERE e.status = 'pending'
     ORDER BY
       CASE e.severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       e.detected_at ASC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map(mapRow);
}

export async function markProcessing(id: string): Promise<void> {
  await init();
  await query(`UPDATE company_events SET status = 'processing' WHERE id = $1`, [id]);
}

export async function markDone(id: string): Promise<void> {
  await init();
  await query(
    `UPDATE company_events SET status = 'done', processed_at = NOW() WHERE id = $1`,
    [id]
  );
}

export async function markSkipped(id: string): Promise<void> {
  await init();
  await query(
    `UPDATE company_events SET status = 'skipped', processed_at = NOW() WHERE id = $1`,
    [id]
  );
}

export async function getById(id: string): Promise<CompanyEvent | null> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT e.*, c.ticker, c.name AS company_name, c.industry
     FROM company_events e
     JOIN companies c ON c.id = e.company_id
     WHERE e.id = $1`,
    [id]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}
