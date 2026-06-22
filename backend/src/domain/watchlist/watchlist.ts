import { randomUUID } from 'crypto';
import { query } from '../../infra/db/pool';

export type WatchPriority = 1 | 2 | 3;
export type CompanyStatus = 'active' | 'paused' | 'removed' | 'emerging';

export interface WatchlistCompany {
  id: string;
  ticker: string;
  name: string;
  industry: string;
  confidence: number;
  watchPriority: WatchPriority;
  status: CompanyStatus;
  discoveredBy: string;
  lastReviewed: string | null;
  nextScanAt: string | null;
  createdAt: string;
}

export interface UpsertCompanyInput {
  ticker: string;
  name: string;
  industry?: string;
  confidence?: number;
  discoveredBy?: string;
  status?: CompanyStatus;
}

export function slugifyCompanyName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 12);
}

export function generateEmergingTicker(name: string, existing?: Set<string>): string {
  const base = slugifyCompanyName(name) || 'UNKNOWN';
  let ticker = `EMRG-${base}`;
  let suffix = 1;

  while (existing?.has(ticker)) {
    ticker = `EMRG-${base.slice(0, 8)}${suffix}`;
    suffix += 1;
  }

  return ticker.slice(0, 20);
}

const P1_INTERVAL = Number(process.env.WATCHLIST_P1_INTERVAL_MS) || 3_600_000;
const P2_INTERVAL = Number(process.env.WATCHLIST_P2_INTERVAL_MS) || 21_600_000;
const P3_INTERVAL = Number(process.env.WATCHLIST_P3_INTERVAL_MS) || 86_400_000;

let initialized = false;

export function priorityInterval(priority: WatchPriority): number {
  if (priority === 1) return P1_INTERVAL;
  if (priority === 2) return P2_INTERVAL;
  return P3_INTERVAL;
}

export function computePriority(rank: number): WatchPriority {
  if (rank <= 100) return 1;
  if (rank <= 500) return 2;
  return 3;
}

function mapRow(row: {
  id: string;
  ticker: string;
  name: string;
  industry: string;
  confidence: number;
  watch_priority: number;
  status: string;
  discovered_by: string;
  last_reviewed: Date | null;
  next_scan_at: Date | null;
  created_at: Date;
}): WatchlistCompany {
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name,
    industry: row.industry,
    confidence: row.confidence,
    watchPriority: row.watch_priority as WatchPriority,
    status: row.status as CompanyStatus,
    discoveredBy: row.discovered_by,
    lastReviewed: row.last_reviewed?.toISOString() ?? null,
    nextScanAt: row.next_scan_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function init(): Promise<void> {
  if (initialized) return;

  await query(`
    CREATE TABLE IF NOT EXISTS companies (
      id UUID PRIMARY KEY,
      ticker TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      industry TEXT NOT NULL DEFAULT 'Unknown',
      confidence INTEGER NOT NULL DEFAULT 50,
      watch_priority INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL DEFAULT 'active',
      discovered_by TEXT NOT NULL DEFAULT 'discovery',
      last_reviewed TIMESTAMPTZ,
      next_scan_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_companies_status ON companies (status);
    CREATE INDEX IF NOT EXISTS idx_companies_priority ON companies (watch_priority);
    CREATE INDEX IF NOT EXISTS idx_companies_next_scan ON companies (next_scan_at);
    CREATE INDEX IF NOT EXISTS idx_companies_confidence ON companies (confidence DESC);
  `);

  initialized = true;
}

export async function upsertCompany(input: UpsertCompanyInput): Promise<WatchlistCompany> {
  await init();

  const ticker = input.ticker.trim().toUpperCase();
  const id = randomUUID();

  await query(
    `INSERT INTO companies (id, ticker, name, industry, confidence, discovered_by, status, next_scan_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (ticker) DO UPDATE SET
       name = EXCLUDED.name,
       industry = COALESCE(NULLIF(EXCLUDED.industry,''), companies.industry),
       confidence = GREATEST(companies.confidence, EXCLUDED.confidence),
       discovered_by = EXCLUDED.discovered_by,
       status = CASE
         WHEN EXCLUDED.status = 'emerging' THEN 'emerging'
         WHEN companies.status = 'emerging' THEN companies.status
         ELSE EXCLUDED.status
       END
     RETURNING id`,
    [
      id,
      ticker,
      input.name,
      input.industry ?? 'Unknown',
      input.confidence ?? 50,
      input.discoveredBy ?? 'discovery',
      input.status ?? 'active',
    ]
  );

  await rerankPriorities();
  const company = await getByTicker(ticker);
  if (!company) throw new Error(`Failed to upsert company ${ticker}`);
  return company;
}

export async function upsertMany(
  companies: UpsertCompanyInput[]
): Promise<WatchlistCompany[]> {
  const results: WatchlistCompany[] = [];

  for (const input of companies) {
    if (!input.ticker?.trim()) continue;
    results.push(await upsertCompany(input));
  }

  return results;
}

export async function upsertManyBulk(
  companies: UpsertCompanyInput[],
  options?: { discoveredBy?: string }
): Promise<number> {
  await init();

  const rows = companies
    .map((input) => ({
      ticker: input.ticker?.trim().toUpperCase() ?? '',
      name: input.name?.trim() ?? '',
      industry: input.industry?.trim() || 'Unknown',
      confidence: input.confidence ?? 50,
      discoveredBy: input.discoveredBy ?? options?.discoveredBy ?? 'discovery',
    }))
    .filter((row) => row.ticker && row.name);

  if (rows.length === 0) {
    return 0;
  }

  const tickers: string[] = [];
  const names: string[] = [];
  const industries: string[] = [];
  const confidences: number[] = [];
  const discoveredBy: string[] = [];
  const ids: string[] = [];

  for (const row of rows) {
    ids.push(randomUUID());
    tickers.push(row.ticker);
    names.push(row.name);
    industries.push(row.industry);
    confidences.push(row.confidence);
    discoveredBy.push(row.discoveredBy);
  }

  await query(
    `INSERT INTO companies (id, ticker, name, industry, confidence, discovered_by, next_scan_at)
     SELECT
       seed.id,
       seed.ticker,
       seed.name,
       seed.industry,
       seed.confidence,
       seed.discovered_by,
       NOW()
     FROM UNNEST(
       $1::uuid[],
       $2::text[],
       $3::text[],
       $4::text[],
       $5::int[],
       $6::text[]
     ) AS seed(id, ticker, name, industry, confidence, discovered_by)
     ON CONFLICT (ticker) DO UPDATE SET
       name = EXCLUDED.name,
       industry = COALESCE(NULLIF(EXCLUDED.industry, 'Unknown'), companies.industry),
       confidence = GREATEST(companies.confidence, EXCLUDED.confidence),
       discovered_by = EXCLUDED.discovered_by`,
    [ids, tickers, names, industries, confidences, discoveredBy]
  );

  await rerankPriorities();
  return rows.length;
}

export async function rerankPriorities(): Promise<void> {
  await init();

  await query(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY confidence DESC, created_at ASC) AS rank
      FROM companies WHERE status = 'active'
    )
    UPDATE companies c SET watch_priority = CASE
      WHEN r.rank <= 100 THEN 1
      WHEN r.rank <= 500 THEN 2
      ELSE 3
    END
    FROM ranked r WHERE c.id = r.id
  `);
}

export async function getByTicker(ticker: string): Promise<WatchlistCompany | null> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM companies WHERE ticker = $1`,
    [ticker.trim().toUpperCase()]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function getById(id: string): Promise<WatchlistCompany | null> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM companies WHERE id = $1`,
    [id]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function listByIndustry(industry: string, limit = 20): Promise<WatchlistCompany[]> {
  await init();

  const needle = industry.trim().toLowerCase();
  if (!needle) return [];

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM companies
     WHERE status = 'active'
       AND (
         LOWER(industry) LIKE $1
         OR $2 LIKE '%' || LOWER(industry) || '%'
       )
     ORDER BY confidence DESC, watch_priority ASC
     LIMIT $3`,
    [`%${needle}%`, needle, limit]
  );

  return result.rows.map(mapRow);
}

export async function listActive(limit = 500): Promise<WatchlistCompany[]> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM companies WHERE status = 'active'
     ORDER BY watch_priority ASC, confidence DESC LIMIT $1`,
    [limit]
  );

  return result.rows.map(mapRow);
}

export async function countActive(): Promise<number> {
  await init();

  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM companies WHERE status = 'active'`
  );

  return Number(result.rows[0]?.count ?? 0);
}

export async function getDueForScan(
  priority: WatchPriority,
  batchSize = Number(process.env.MONITOR_BATCH_SIZE) || 20
): Promise<WatchlistCompany[]> {
  await init();

  const result = await query<Parameters<typeof mapRow>[0]>(
    `SELECT * FROM companies
     WHERE status = 'active'
       AND watch_priority = $1
       AND (next_scan_at IS NULL OR next_scan_at <= NOW())
     ORDER BY next_scan_at ASC NULLS FIRST, confidence DESC
     LIMIT $2`,
    [priority, batchSize]
  );

  return result.rows.map(mapRow);
}

export async function markReviewed(
  companyId: string,
  confidence?: number
): Promise<void> {
  await init();

  const company = await getById(companyId);
  if (!company) return;

  const interval = priorityInterval(company.watchPriority);

  await query(
    `UPDATE companies SET
       last_reviewed = NOW(),
       next_scan_at = NOW() + ($2 || ' milliseconds')::INTERVAL,
       confidence = COALESCE($3, confidence)
     WHERE id = $1`,
    [companyId, interval, confidence ?? null]
  );

  await rerankPriorities();
}

export async function deferScan(companyId: string, delayMs: number): Promise<void> {
  await init();

  await query(
    `UPDATE companies SET next_scan_at = NOW() + ($2 || ' milliseconds')::INTERVAL WHERE id = $1`,
    [companyId, delayMs]
  );
}

export async function seedFromReports(
  reports: Array<{
    ticker: string;
    company: string;
    industry: string;
    confidence: number;
  }>,
  discoveredBy = 'pipeline'
): Promise<number> {
  let count = 0;

  for (const report of reports) {
    if (!report.ticker || report.ticker === 'N/A') continue;

    await upsertCompany({
      ticker: report.ticker,
      name: report.company,
      industry: report.industry,
      confidence: report.confidence,
      discoveredBy,
    });

    count++;
  }

  return count;
}
