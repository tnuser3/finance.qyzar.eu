import { randomUUID } from 'crypto';
import { query } from '../../infra/db/pool';
import { historicalPrices as fmpHistoricalPrices } from '../../providers/market/fmp';
import { dailySeries as avDailySeries } from '../../providers/market/alphavantage';
import type {
  EvidenceItem,
  EvidenceWidget,
  MarketCorrelationCandidate,
  MarketCorrelationRecord,
} from '../../agents/definitions/types';
import * as timeline from '../timeline/timeline';
import { logError } from '../../infra/db/error-log';

export interface PriceBar {
  date: string;
  close: number;
}

export interface AnchorPriceResult {
  ticker: string;
  priceAtStart: number;
  priceAtEnd: number;
  pctChange: number;
  startAt: string;
  endAt: string;
  series: PriceBar[];
}

let initialized = false;

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseFmpBars(data: unknown): PriceBar[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const date = String(r.date ?? '');
      const close = Number(r.close ?? r.adjClose ?? r.price);
      if (!date || !Number.isFinite(close)) return null;
      return { date, close };
    })
    .filter((b): b is PriceBar => b !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseAvBars(data: unknown): PriceBar[] {
  if (!data || typeof data !== 'object') return [];

  const record = data as Record<string, unknown>;
  const series = record['Time Series (Daily)'] as Record<string, Record<string, string>> | undefined;
  if (!series) return [];

  return Object.entries(series)
    .map(([date, values]) => ({
      date,
      close: Number(values['4. close'] ?? values.close),
    }))
    .filter((b) => Number.isFinite(b.close))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchPriceBars(
  ticker: string,
  from: Date,
  to: Date,
  options: { bypassCache?: boolean } = {}
): Promise<PriceBar[]> {
  const padDays = 7;
  const fromPad = new Date(from);
  fromPad.setDate(fromPad.getDate() - padDays);
  const toPad = new Date(to);
  toPad.setDate(toPad.getDate() + padDays);

  const fromStr = formatDate(fromPad);
  const toStr = formatDate(toPad);

  try {
    const fmp = await fmpHistoricalPrices(ticker, {
      from: fromStr,
      to: toStr,
      bypassCache: options.bypassCache,
    });
    const bars = parseFmpBars(fmp);
    if (bars.length > 0) return bars;
  } catch (error) {
      logError(error, { source: 'util/correlation.ts - fetchPriceBars' });

  }

  try {
    const av = await avDailySeries(ticker, {
      outputsize: 'compact',
      bypassCache: options.bypassCache,
    });
    const bars = parseAvBars(av);
    return bars.filter((b) => b.date >= fromStr && b.date <= toStr);
  } catch (error) {
      logError(error, { source: 'util/correlation.ts - fetchPriceBars' });
    return [];
  }
}

function nearestBarAtOrBefore(bars: PriceBar[], iso: string): PriceBar | null {
  const target = iso.slice(0, 10);
  let best: PriceBar | null = null;

  for (const bar of bars) {
    if (bar.date <= target) best = bar;
    else break;
  }

  return best ?? bars[0] ?? null;
}

function nearestBarAtOrAfter(bars: PriceBar[], iso: string): PriceBar | null {
  const target = iso.slice(0, 10);

  for (const bar of bars) {
    if (bar.date >= target) return bar;
  }

  return bars[bars.length - 1] ?? null;
}

export async function anchorPriceMove(
  ticker: string,
  startAt: string,
  endAt: string
): Promise<AnchorPriceResult | null> {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol || symbol === 'N/A') return null;

  const start = new Date(startAt);
  const end = new Date(endAt);
  const bars = await fetchPriceBars(symbol, start, end);

  if (bars.length < 2) return null;

  const startBar = nearestBarAtOrBefore(bars, startAt);
  const endBar = nearestBarAtOrAfter(bars, endAt);

  if (!startBar || !endBar) return null;

  const pctChange =
    startBar.close !== 0
      ? ((endBar.close - startBar.close) / startBar.close) * 100
      : 0;

  const windowBars = bars.filter(
    (b) => b.date >= startBar.date && b.date <= endBar.date
  );

  return {
    ticker: symbol,
    priceAtStart: startBar.close,
    priceAtEnd: endBar.close,
    pctChange: Math.round(pctChange * 100) / 100,
    startAt: startBar.date,
    endAt: endBar.date,
    series: windowBars.length > 0 ? windowBars : [startBar, endBar],
  };
}

export function buildCorrelationChartWidget(
  anchor: AnchorPriceResult,
  newsEvents: MarketCorrelationCandidate['newsEvents'],
  title: string
): EvidenceWidget {
  return {
    id: `correlation-chart-${anchor.ticker.toLowerCase()}`,
    type: 'correlation_chart',
    title,
    subtitle: `${anchor.ticker} price vs news`,
    source: 'fmp',
    priority: 1,
    data: {
      labels: anchor.series.map((b) => b.date),
      values: anchor.series.map((b) => b.close),
      markers: newsEvents.map((e) => ({
        at: e.at,
        label: e.title,
        severity: 'medium',
        source: e.source,
      })),
      windowStart: anchor.startAt,
      windowEnd: anchor.endAt,
      pctChange: anchor.pctChange,
    },
  };
}

export function buildCorrelationWidgets(
  candidate: MarketCorrelationCandidate,
  anchor: AnchorPriceResult | null
): EvidenceWidget[] {
  const widgets: EvidenceWidget[] = [];

  if (anchor) {
    widgets.push(
      buildCorrelationChartWidget(anchor, candidate.newsEvents, candidate.title)
    );
  }

  if (candidate.newsEvents.length > 0) {
    widgets.push({
      id: 'correlation-news-timeline',
      type: 'timeline',
      title: 'News Events',
      priority: 2,
      data: {
        events: candidate.newsEvents.map((e) => ({
          at: e.at,
          title: e.title,
          description: e.url,
          source: e.source,
          severity: 'medium',
        })),
      },
    });
  }

  if (candidate.evidence.length > 0) {
    widgets.push({
      id: 'correlation-evidence-list',
      type: 'list',
      title: 'Supporting Evidence',
      priority: 3,
      data: {
        items: candidate.evidence.map((e) => ({
          label: e.agent,
          detail: e.finding,
        })),
      },
    });
  }

  const metrics: Array<{
    label: string;
    value: string | number;
    delta?: string;
    trend?: 'up' | 'down' | 'flat';
    unit?: string;
  }> = [
    {
      label: 'Correlation Strength',
      value: candidate.confidence ?? 50,
      unit: '%',
    },
  ];

  if (anchor) {
    metrics.push({
      label: 'Price Change',
      value: anchor.pctChange,
      unit: '%',
      delta: `${anchor.pctChange >= 0 ? '+' : ''}${anchor.pctChange}%`,
      trend: anchor.pctChange > 0 ? 'up' : anchor.pctChange < 0 ? 'down' : 'flat',
    });
    metrics.push({
      label: 'Start Price',
      value: anchor.priceAtStart,
    });
    metrics.push({
      label: 'End Price',
      value: anchor.priceAtEnd,
    });
  }

  widgets.push({
    id: 'correlation-metrics',
    type: 'metric_grid',
    title: 'Market Move',
    priority: 4,
    data: { metrics },
  });

  if (candidate.companies.length > 0) {
    widgets.push({
      id: 'correlation-companies',
      type: 'list',
      title: 'Companies Involved',
      priority: 5,
      data: {
        items: candidate.companies.map((c) => ({
          label: c.ticker,
          value: c.name,
        })),
      },
    });
  }

  return widgets;
}

export async function init(): Promise<void> {
  if (initialized) return;

  await query(`
    CREATE TABLE IF NOT EXISTS market_correlations (
      id UUID PRIMARY KEY,
      run_id UUID NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      window_end TIMESTAMPTZ NOT NULL,
      primary_ticker TEXT NOT NULL,
      companies JSONB NOT NULL DEFAULT '[]',
      evidence JSONB NOT NULL DEFAULT '[]',
      news_events JSONB NOT NULL DEFAULT '[]',
      price_move JSONB NOT NULL,
      widgets JSONB NOT NULL DEFAULT '[]',
      confidence INTEGER NOT NULL DEFAULT 50,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_correlations_window ON market_correlations (window_start DESC);
    CREATE INDEX IF NOT EXISTS idx_correlations_ticker ON market_correlations (primary_ticker);
    CREATE INDEX IF NOT EXISTS idx_correlations_run ON market_correlations (run_id);
  `);

  initialized = true;
}

function mapRow(row: {
  id: string;
  run_id: string;
  title: string;
  description: string;
  window_start: Date;
  window_end: Date;
  primary_ticker: string;
  companies: unknown;
  evidence: unknown;
  news_events: unknown;
  price_move: unknown;
  widgets: unknown;
  confidence: number;
  created_at: Date;
}): MarketCorrelationRecord {
  return {
    id: row.id,
    runId: row.run_id,
    title: row.title,
    description: row.description,
    windowStart: row.window_start.toISOString(),
    windowEnd: row.window_end.toISOString(),
    primaryTicker: row.primary_ticker,
    companies: (row.companies as MarketCorrelationRecord['companies']) ?? [],
    evidence: (row.evidence as EvidenceItem[]) ?? [],
    newsEvents: (row.news_events as MarketCorrelationRecord['newsEvents']) ?? [],
    priceMove: row.price_move as MarketCorrelationRecord['priceMove'],
    widgets: (row.widgets as EvidenceWidget[]) ?? [],
    confidence: row.confidence,
    createdAt: row.created_at.toISOString(),
  };
}

export async function saveCorrelations(
  runId: string,
  records: Omit<MarketCorrelationRecord, 'id' | 'runId' | 'createdAt'>[]
): Promise<MarketCorrelationRecord[]> {
  await init();

  const saved: MarketCorrelationRecord[] = [];

  for (const record of records) {
    const id = randomUUID();

    await query(
      `INSERT INTO market_correlations (
        id, run_id, title, description, window_start, window_end,
        primary_ticker, companies, evidence, news_events, price_move, widgets, confidence
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id,
        runId,
        record.title,
        record.description,
        record.windowStart,
        record.windowEnd,
        record.primaryTicker,
        record.companies,
        record.evidence,
        record.newsEvents,
        record.priceMove,
        record.widgets,
        record.confidence,
      ]
    );

    const result = await query<Parameters<typeof mapRow>[0]>(
      `SELECT * FROM market_correlations WHERE id = $1`,
      [id]
    );

    const mapped = mapRow(result.rows[0]!);
    saved.push(mapped);
  }

  return saved;
}

export async function listCorrelations(options?: {
  from?: string;
  to?: string;
  ticker?: string;
  limit?: number;
}): Promise<MarketCorrelationRecord[]> {
  await init();

  const limit = options?.limit ?? 50;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (options?.from) {
    conditions.push(`window_end >= $${idx++}`);
    params.push(options.from);
  }

  if (options?.to) {
    conditions.push(`window_start <= $${idx++}`);
    params.push(options.to);
  }

  if (options?.ticker) {
    conditions.push(`primary_ticker = $${idx++}`);
    params.push(options.ticker.trim().toUpperCase());
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit);

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM market_correlations ${where}
     ORDER BY created_at DESC LIMIT $${idx}`,
    params
  );

  return result.rows.map(mapRow);
}

export async function getById(id: string): Promise<MarketCorrelationRecord | null> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM market_correlations WHERE id = $1`,
    [id]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function processCandidate(
  runId: string,
  candidate: MarketCorrelationCandidate
): Promise<MarketCorrelationRecord | null> {
  const anchor = await anchorPriceMove(
    candidate.primaryTicker,
    candidate.windowStart,
    candidate.windowEnd
  );

  if (!anchor) {
    return null;
  }

  const widgets = buildCorrelationWidgets(candidate, anchor);

  const saved = await saveCorrelations(runId, [
    {
      title: candidate.title,
      description: candidate.description,
      windowStart: candidate.windowStart,
      windowEnd: candidate.windowEnd,
      primaryTicker: candidate.primaryTicker,
      companies: candidate.companies,
      evidence: candidate.evidence,
      newsEvents: candidate.newsEvents,
      priceMove: {
        ticker: anchor.ticker,
        priceAtStart: anchor.priceAtStart,
        priceAtEnd: anchor.priceAtEnd,
        pctChange: anchor.pctChange,
        startAt: anchor.startAt,
        endAt: anchor.endAt,
      },
      widgets,
      confidence: candidate.confidence ?? 50,
    },
  ]);

  const record = saved[0];
  if (record) {
    try {
      await timeline.syncCorrelationToTimeline(record, anchor.series);
    } catch (error) {
      logError(error, { source: 'util/correlation.ts - processCandidate' });
      console.warn(
        `[correlation] timeline sync failed for ${record.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return record ?? null;
}
