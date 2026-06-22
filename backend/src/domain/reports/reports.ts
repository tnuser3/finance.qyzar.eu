import { randomUUID } from 'crypto';
import { query, toJsonb } from '../../infra/db/pool';
import type { InvestmentReport, EvidenceWidget } from '../../agents/definitions/types';

export interface SavedReport extends InvestmentReport {
  id: string;
  accountId: string;
  runId: string;
  createdAt: string;
}

let initialized = false;

export async function init(): Promise<void> {
  if (initialized) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS research_reports (
      id UUID PRIMARY KEY,
      account_id UUID NOT NULL,
      run_id UUID NOT NULL,
      company TEXT NOT NULL,
      ticker TEXT NOT NULL,
      industry TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      risk_score INTEGER NOT NULL,
      agents JSONB NOT NULL DEFAULT '[]',
      evidence JSONB NOT NULL DEFAULT '[]',
      widgets JSONB NOT NULL DEFAULT '[]',
      statistics JSONB NOT NULL DEFAULT '{}',
      time_horizon TEXT NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL,
      approved BOOLEAN NOT NULL DEFAULT true,
      restriction_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_research_reports_account_id
      ON research_reports (account_id);

    CREATE INDEX IF NOT EXISTS idx_research_reports_run_id
      ON research_reports (run_id);

    CREATE INDEX IF NOT EXISTS idx_research_reports_company
      ON research_reports (company);

    CREATE INDEX IF NOT EXISTS idx_research_reports_ticker
      ON research_reports (ticker);
  `);

  await query(`
    ALTER TABLE research_reports
    ADD COLUMN IF NOT EXISTS widgets JSONB NOT NULL DEFAULT '[]'
  `);

  initialized = true;
}

export async function saveReports(
  accountId: string,
  runId: string,
  reports: InvestmentReport[]
): Promise<number> {
  await init();

  let saved = 0;

  for (const report of reports) {
    await query(
      `INSERT INTO research_reports (
        id, account_id, run_id, company, ticker, industry, recommendation,
        confidence, risk_score, agents, evidence, widgets, statistics, time_horizon,
        generated_at, approved, restriction_reason
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16,$17)`,
      [
        randomUUID(),
        accountId,
        runId,
        report.company,
        report.ticker,
        report.industry,
        report.recommendation,
        report.confidence,
        report.risk_score,
        toJsonb(report.agents),
        toJsonb(report.evidence),
        toJsonb(report.widgets ?? []),
        toJsonb(report.statistics),
        report.time_horizon,
        report.generated_at,
        report.approved ?? true,
        report.restriction_reason ?? null,
      ]
    );

    saved++;
  }

  return saved;
}


export const saveFindings = saveReports;

function mapRow(row: {
  id: string;
  account_id: string;
  run_id: string;
  company: string;
  ticker: string;
  industry: string;
  recommendation: string;
  confidence: number;
  risk_score: number;
  agents: unknown;
  evidence: unknown;
  widgets: unknown;
  statistics: unknown;
  time_horizon: string;
  generated_at: Date;
  approved: boolean;
  restriction_reason: string | null;
  created_at: Date;
}): SavedReport {
  return {
    id: row.id,
    accountId: row.account_id,
    runId: row.run_id,
    company: row.company,
    ticker: row.ticker,
    industry: row.industry,
    recommendation: row.recommendation as InvestmentReport['recommendation'],
    confidence: row.confidence,
    risk_score: row.risk_score,
    agents: Array.isArray(row.agents) ? (row.agents as string[]) : [],
    evidence: Array.isArray(row.evidence)
      ? (row.evidence as InvestmentReport['evidence'])
      : [],
    widgets: Array.isArray(row.widgets)
      ? (row.widgets as EvidenceWidget[])
      : [],
    statistics: (row.statistics as Record<string, unknown>) ?? {},
    time_horizon: row.time_horizon,
    generated_at: row.generated_at.toISOString(),
    approved: row.approved,
    restriction_reason: row.restriction_reason ?? undefined,
    createdAt: row.created_at.toISOString(),
  };
}

export async function getByRunId(runId: string): Promise<SavedReport[]> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM research_reports WHERE run_id = $1 ORDER BY created_at ASC`,
    [runId]
  );

  return result.rows.map(mapRow);
}

export async function getByAccountId(
  accountId: string,
  limit = 50
): Promise<SavedReport[]> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM research_reports
     WHERE account_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [accountId, limit]
  );

  return result.rows.map(mapRow);
}

export async function getByTicker(
  ticker: string,
  limit = 20
): Promise<SavedReport[]> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM research_reports
     WHERE ticker = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [ticker.trim().toUpperCase(), limit]
  );

  return result.rows.map(mapRow);
}

export async function listRecent(limit = 50): Promise<SavedReport[]> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM research_reports ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );

  return result.rows.map(mapRow);
}

export async function listForAccounts(
  accountIds: string[],
  limit = 50
): Promise<SavedReport[]> {
  await init();

  if (accountIds.length === 0) return [];

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM research_reports
     WHERE account_id = ANY($1::uuid[])
     ORDER BY created_at DESC
     LIMIT $2`,
    [accountIds, limit]
  );

  return result.rows.map(mapRow);
}
