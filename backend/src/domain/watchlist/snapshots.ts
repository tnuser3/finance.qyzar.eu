import { randomUUID } from 'crypto';
import { query } from '../../infra/db/pool';
import * as watchlist from './watchlist';
import type { Recommendation } from '../../agents/definitions/types';

export interface CompanySnapshot {
  id: string;
  companyId: string;
  snapshotAt: string;
  marketCap: number | null;
  riskScore: number;
  sentimentScore: number | null;
  growthScore: number | null;
  confidence: number;
  recommendation: Recommendation;
  deltaRisk: number | null;
  deltaSentiment: number | null;
  runId: string | null;
  metadata: Record<string, unknown>;
}

export interface SnapshotDelta {
  yesterday: CompanySnapshot | null;
  today: CompanySnapshot | null;
  deltaRisk: number | null;
  deltaSentiment: number | null;
  deltaConfidence: number | null;
}

let initialized = false;

function mapRow(row: {
  id: string;
  company_id: string;
  snapshot_at: Date;
  market_cap: string | null;
  risk_score: number;
  sentiment_score: number | null;
  growth_score: number | null;
  confidence: number;
  recommendation: string;
  delta_risk: number | null;
  delta_sentiment: number | null;
  run_id: string | null;
  metadata: unknown;
}): CompanySnapshot {
  return {
    id: row.id,
    companyId: row.company_id,
    snapshotAt: row.snapshot_at.toISOString(),
    marketCap: row.market_cap ? Number(row.market_cap) : null,
    riskScore: row.risk_score,
    sentimentScore: row.sentiment_score,
    growthScore: row.growth_score,
    confidence: row.confidence,
    recommendation: row.recommendation as Recommendation,
    deltaRisk: row.delta_risk,
    deltaSentiment: row.delta_sentiment,
    runId: row.run_id,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

export async function init(): Promise<void> {
  if (initialized) return;

  await watchlist.init();

  await query(`
    CREATE TABLE IF NOT EXISTS company_snapshots (
      id UUID PRIMARY KEY,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      market_cap NUMERIC,
      risk_score INTEGER NOT NULL,
      sentiment_score INTEGER,
      growth_score INTEGER,
      confidence INTEGER NOT NULL,
      recommendation TEXT NOT NULL,
      delta_risk INTEGER,
      delta_sentiment INTEGER,
      run_id UUID,
      metadata JSONB NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_company_id ON company_snapshots (company_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_at ON company_snapshots (snapshot_at DESC);
  `);

  initialized = true;
}

export async function getLatestSnapshot(
  companyId: string
): Promise<CompanySnapshot | null> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM company_snapshots
     WHERE company_id = $1 ORDER BY snapshot_at DESC LIMIT 1`,
    [companyId]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function saveSnapshot(input: {
  companyId: string;
  riskScore: number;
  confidence: number;
  recommendation: Recommendation;
  sentimentScore?: number | null;
  growthScore?: number | null;
  marketCap?: number | null;
  runId?: string;
  metadata?: Record<string, unknown>;
}): Promise<CompanySnapshot> {
  await init();

  const prior = await getLatestSnapshot(input.companyId);
  const deltaRisk = prior ? input.riskScore - prior.riskScore : null;
  const deltaSentiment =
    prior && input.sentimentScore != null && prior.sentimentScore != null
      ? input.sentimentScore - prior.sentimentScore
      : null;

  const id = randomUUID();

  await query(
    `INSERT INTO company_snapshots (
      id, company_id, market_cap, risk_score, sentiment_score, growth_score,
      confidence, recommendation, delta_risk, delta_sentiment, run_id, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id,
      input.companyId,
      input.marketCap ?? null,
      input.riskScore,
      input.sentimentScore ?? null,
      input.growthScore ?? null,
      input.confidence,
      input.recommendation,
      deltaRisk,
      deltaSentiment,
      input.runId ?? null,
      input.metadata ?? {},
    ]
  );

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM company_snapshots WHERE id = $1`,
    [id]
  );

  return mapRow(result.rows[0]!);
}

export async function getHistory(
  companyId: string,
  limit = 30
): Promise<CompanySnapshot[]> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM company_snapshots
     WHERE company_id = $1 ORDER BY snapshot_at DESC LIMIT $2`,
    [companyId, limit]
  );

  return result.rows.map(mapRow);
}

export async function getSnapshotDelta(companyId: string): Promise<SnapshotDelta> {
  const history = await getHistory(companyId, 2);
  const today = history[0] ?? null;
  const yesterday = history[1] ?? null;

  return {
    today,
    yesterday,
    deltaRisk: today?.deltaRisk ?? null,
    deltaSentiment: today?.deltaSentiment ?? null,
    deltaConfidence:
      today && yesterday ? today.confidence - yesterday.confidence : null,
  };
}
