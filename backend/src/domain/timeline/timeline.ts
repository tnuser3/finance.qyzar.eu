import { randomUUID } from 'crypto';
import { query } from '../../infra/db/pool';
import type {
  EvidenceItem,
  EvidenceWidget,
  MarketCorrelationRecord,
  TimelineEvent,
  TimelineEventType,
} from '../../agents/definitions/types';

let initialized = false;

function mapRow(row: {
  id: string;
  occurred_at: Date;
  event_type: string;
  ticker: string | null;
  title: string;
  description: string | null;
  correlation_id: string | null;
  run_id: string | null;
  companies: unknown;
  evidence: unknown;
  widgets: unknown;
  payload: unknown;
  created_at: Date;
}): TimelineEvent {
  return {
    id: row.id,
    occurredAt: row.occurred_at.toISOString(),
    eventType: row.event_type as TimelineEventType,
    ticker: row.ticker,
    title: row.title,
    description: row.description,
    correlationId: row.correlation_id,
    runId: row.run_id,
    companies: (row.companies as TimelineEvent['companies']) ?? [],
    evidence: (row.evidence as EvidenceItem[]) ?? [],
    widgets: (row.widgets as EvidenceWidget[]) ?? [],
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

export async function init(): Promise<void> {
  if (initialized) return;

  await query(`
    CREATE TABLE IF NOT EXISTS market_timeline (
      id UUID PRIMARY KEY,
      occurred_at TIMESTAMPTZ NOT NULL,
      event_type TEXT NOT NULL,
      ticker TEXT,
      title TEXT NOT NULL,
      description TEXT,
      correlation_id UUID,
      run_id UUID,
      companies JSONB NOT NULL DEFAULT '[]',
      evidence JSONB NOT NULL DEFAULT '[]',
      widgets JSONB NOT NULL DEFAULT '[]',
      payload JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_timeline_occurred ON market_timeline (occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_timeline_ticker ON market_timeline (ticker);
    CREATE INDEX IF NOT EXISTS idx_timeline_type ON market_timeline (event_type);
    CREATE INDEX IF NOT EXISTS idx_timeline_correlation ON market_timeline (correlation_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_run ON market_timeline (run_id);
  `);

  initialized = true;
}

export async function insertTimelineEvent(input: {
  occurredAt: string;
  eventType: TimelineEventType;
  ticker?: string | null;
  title: string;
  description?: string | null;
  correlationId?: string | null;
  runId?: string | null;
  companies?: Array<{ ticker: string; name: string }>;
  evidence?: EvidenceItem[];
  widgets?: EvidenceWidget[];
  payload?: Record<string, unknown>;
}): Promise<TimelineEvent> {
  await init();

  const id = randomUUID();

  await query(
    `INSERT INTO market_timeline (
      id, occurred_at, event_type, ticker, title, description,
      correlation_id, run_id, companies, evidence, widgets, payload
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id,
      input.occurredAt,
      input.eventType,
      input.ticker?.trim().toUpperCase() ?? null,
      input.title,
      input.description ?? null,
      input.correlationId ?? null,
      input.runId ?? null,
      input.companies ?? [],
      input.evidence ?? [],
      input.widgets ?? [],
      input.payload ?? {},
    ]
  );

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM market_timeline WHERE id = $1`,
    [id]
  );

  return mapRow(result.rows[0]!);
}

export async function syncCorrelationToTimeline(
  record: MarketCorrelationRecord,
  priceSeries?: Array<{ date: string; close: number }>
): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];

  const correlationWidget = record.widgets.find((w) => w.type === 'correlation_chart');

  events.push(
    await insertTimelineEvent({
      occurredAt: record.windowEnd,
      eventType: 'correlation',
      ticker: record.primaryTicker,
      title: record.title,
      description: record.description,
      correlationId: record.id,
      runId: record.runId,
      companies: record.companies,
      evidence: record.evidence,
      widgets: record.widgets,
      payload: {
        windowStart: record.windowStart,
        windowEnd: record.windowEnd,
        priceMove: record.priceMove,
        confidence: record.confidence,
        newsEvents: record.newsEvents,
      },
    })
  );

  for (const news of record.newsEvents) {
    events.push(
      await insertTimelineEvent({
        occurredAt: news.at,
        eventType: 'news',
        ticker: record.primaryTicker,
        title: news.title,
        description: news.url ?? null,
        correlationId: record.id,
        runId: record.runId,
        companies: record.companies,
        evidence: [{ agent: news.source, finding: news.title }],
        payload: { source: news.source, url: news.url },
      })
    );
  }

  events.push(
    await insertTimelineEvent({
      occurredAt: record.priceMove.endAt,
      eventType: 'price_move',
      ticker: record.priceMove.ticker,
      title: `${record.priceMove.ticker} ${record.priceMove.pctChange >= 0 ? '+' : ''}${record.priceMove.pctChange}%`,
      description: `Price moved from ${record.priceMove.priceAtStart} to ${record.priceMove.priceAtEnd} between ${record.priceMove.startAt} and ${record.priceMove.endAt}.`,
      correlationId: record.id,
      runId: record.runId,
      companies: record.companies,
      widgets: correlationWidget ? [correlationWidget] : [],
      payload: { priceMove: record.priceMove },
    })
  );

  if (priceSeries?.length) {
    const capped = priceSeries.slice(-60);
    for (const point of capped) {
      events.push(
        await insertTimelineEvent({
          occurredAt: `${point.date}T16:00:00.000Z`,
          eventType: 'price_point',
          ticker: record.primaryTicker,
          title: `${record.primaryTicker} close`,
          description: null,
          correlationId: record.id,
          runId: record.runId,
          payload: { date: point.date, close: point.close },
        })
      );
    }
  }

  return events;
}

export async function listTimeline(options?: {
  from?: string;
  to?: string;
  ticker?: string;
  eventType?: TimelineEventType;
  correlationId?: string;
  limit?: number;
  order?: 'asc' | 'desc';
}): Promise<TimelineEvent[]> {
  await init();

  const limit = options?.limit ?? 100;
  const order = options?.order === 'asc' ? 'ASC' : 'DESC';
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (options?.from) {
    conditions.push(`occurred_at >= $${idx++}`);
    params.push(options.from);
  }

  if (options?.to) {
    conditions.push(`occurred_at <= $${idx++}`);
    params.push(options.to);
  }

  if (options?.ticker) {
    conditions.push(`ticker = $${idx++}`);
    params.push(options.ticker.trim().toUpperCase());
  }

  if (options?.eventType) {
    conditions.push(`event_type = $${idx++}`);
    params.push(options.eventType);
  }

  if (options?.correlationId) {
    conditions.push(`correlation_id = $${idx++}`);
    params.push(options.correlationId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM market_timeline ${where}
     ORDER BY occurred_at ${order} LIMIT $${idx}`,
    params
  );

  return result.rows.map(mapRow);
}

export async function getTimelineById(id: string): Promise<TimelineEvent | null> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM market_timeline WHERE id = $1`,
    [id]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function getTimelineForCorrelation(
  correlationId: string
): Promise<TimelineEvent[]> {
  return listTimeline({
    correlationId,
    limit: 200,
    order: 'asc',
  });
}

export function buildTimelineGroups(events: TimelineEvent[]): Array<{
  date: string;
  events: TimelineEvent[];
}> {
  const groups = new Map<string, TimelineEvent[]>();

  for (const event of events) {
    const date = event.occurredAt.slice(0, 10);
    const bucket = groups.get(date) ?? [];
    bucket.push(event);
    groups.set(date, bucket);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayEvents]) => ({
      date,
      events: dayEvents.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    }));
}
