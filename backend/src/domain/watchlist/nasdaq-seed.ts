import { isProviderAvailable } from '../../providers/command-availability';
import { stockSymbols as finnhubStockSymbols } from '../../providers/market/finnhub';
import { retrieve, store } from '../../infra/db/cache';
import * as watchlist from './watchlist';
import { apiFetch } from '../../infra/http/fetch';
import { logError } from '../../infra/db/error-log';

const SEED_CACHE_KEY = 'watchlist:nasdaq-top500-seeded';
const DEFAULT_LIMIT = Number(process.env.WATCHLIST_NASDAQ_SEED_LIMIT) || 500;
const REFRESH_MS =
  Number(process.env.WATCHLIST_NASDAQ_SEED_REFRESH_MS) || 7 * 24 * 60 * 60 * 1000;

const YAHOO_QUERY2 = 'https://query2.finance.yahoo.com';
const YAHOO_USER_AGENT =
  process.env.YAHOO_USER_AGENT ??
  'Mozilla/5.0 (compatible; finance3/1.0; +https://localhost)';

const NASDAQ_EXCHANGES = new Set(['NMS', 'NGM', 'NCM', 'NASDAQ']);

export interface NasdaqSeedResult {
  ok: boolean;
  skipped: boolean;
  source: string | null;
  upserted: number;
  limit: number;
  error?: string;
}

interface NasdaqCompany {
  ticker: string;
  name: string;
  industry: string;
  confidence: number;
}

function seedEnabled(): boolean {
  return process.env.WATCHLIST_NASDAQ_SEED !== 'false';
}

function confidenceForRank(rank: number, limit: number): number {
  const normalized = rank / Math.max(limit - 1, 1);
  return Math.max(35, Math.round(100 - normalized * 45));
}

function normalizeTicker(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/^\^/, '');
}

function isCommonTicker(ticker: string): boolean {
  if (!ticker || ticker.length > 6) return false;
  if (!/^[A-Z][A-Z0-9.-]*$/.test(ticker)) return false;
  if (ticker.endsWith('-W') || ticker.endsWith('-U') || ticker.endsWith('-P')) return false;
  return true;
}

async function recentSeedTimestamp(): Promise<number | null> {
  const envelope = await retrieve<{ seededAt: string; count: number; source: string }>(
    SEED_CACHE_KEY
  );

  if (!envelope?.seededAt) {
    return null;
  }

  const seededAt = Date.parse(envelope.seededAt);
  return Number.isFinite(seededAt) ? seededAt : null;
}

async function shouldRunSeed(force = false): Promise<boolean> {
  if (!seedEnabled()) {
    return false;
  }

  if (force || process.env.WATCHLIST_NASDAQ_SEED_FORCE === 'true') {
    return true;
  }

  const seededAt = await recentSeedTimestamp();

  if (!seededAt) {
    return true;
  }

  return Date.now() - seededAt >= REFRESH_MS;
}

async function yahooFetch(url: string): Promise<Response> {
  return apiFetch('yahoo', url, {
    headers: {
      'User-Agent': YAHOO_USER_AGENT,
      Accept: 'application/json',
    },
  });
}

function isNasdaqYahooQuote(row: Record<string, unknown>): boolean {
  const exchange = String(row.exchange ?? row.fullExchangeName ?? '').toUpperCase();
  return NASDAQ_EXCHANGES.has(exchange) || exchange.includes('NASDAQ');
}

async function fetchFromYahoo(limit: number): Promise<NasdaqCompany[]> {
  const companies: NasdaqCompany[] = [];
  const seen = new Set<string>();

  for (let start = 0; start <= 10_000 && companies.length < limit; start += 250) {
    const url =
      `${YAHOO_QUERY2}/v1/finance/screener/predefined/saved` +
      `?scrIds=largest_market_cap&count=250&start=${start}` +
      '&region=US&lang=en-US&formatted=false';

    const res = await yahooFetch(url);

    if (!res.ok) {
      throw new Error(`Yahoo screener request failed (${res.status})`);
    }

    const payload = (await res.json()) as {
      finance?: { result?: Array<{ quotes?: Array<Record<string, unknown>> }> };
    };

    const quotes = payload.finance?.result?.[0]?.quotes ?? [];

    if (quotes.length === 0) {
      break;
    }

    for (const row of quotes) {
      if (!isNasdaqYahooQuote(row)) {
        continue;
      }

      const ticker = normalizeTicker(row.symbol);

      if (!isCommonTicker(ticker) || seen.has(ticker)) {
        continue;
      }

      seen.add(ticker);
      companies.push({
        ticker,
        name: String(row.shortName ?? row.longName ?? ticker).trim() || ticker,
        industry: String(row.sector ?? row.industry ?? 'Unknown').trim() || 'Unknown',
        confidence: confidenceForRank(companies.length, limit),
      });

      if (companies.length >= limit) {
        return companies;
      }
    }
  }

  return companies;
}

async function fetchFromFinnhub(limit: number): Promise<NasdaqCompany[]> {
  if (!isProviderAvailable('finnhub')) {
    return [];
  }

  const payload = (await finnhubStockSymbols('US', {
    mic: 'XNAS',
    securityType: 'Common Stock',
  })) as Array<{
    symbol?: string;
    description?: string;
    type?: string;
  }>;

  const companies: NasdaqCompany[] = [];

  for (const [index, row] of payload.entries()) {
    const ticker = normalizeTicker(row.symbol);

    if (!isCommonTicker(ticker)) {
      continue;
    }

    companies.push({
      ticker,
      name: String(row.description ?? ticker).trim() || ticker,
      industry: 'Unknown',
      confidence: confidenceForRank(index, limit),
    });

    if (companies.length >= limit) {
      break;
    }
  }

  return companies;
}

async function fetchNasdaqCompanies(limit: number): Promise<{  companies: NasdaqCompany[];
  source: string;
}> {
  const merged = new Map<string, NasdaqCompany>();

  const yahoo = await fetchFromYahoo(limit).catch((error) => {
    logError(error, { source: 'util/nasdaq-watchlist-seed.ts - fetchNasdaqCompanies' });
    return [];
  });

  for (const company of yahoo) {
    merged.set(company.ticker, company);
  }

  if (merged.size < limit) {
    const finnhub = await fetchFromFinnhub(Math.max(limit * 2, 1_000)).catch((error) => {
      logError(error, { source: 'util/nasdaq-watchlist-seed.ts - fetchNasdaqCompanies' });
      return [];
    });

    for (const company of finnhub) {
      if (merged.has(company.ticker)) {
        continue;
      }

      merged.set(company.ticker, {
        ...company,
        confidence: confidenceForRank(merged.size, limit),
      });

      if (merged.size >= limit) {
        break;
      }
    }
  }

  const companies = Array.from(merged.values()).slice(0, limit);

  if (companies.length === 0) {
    throw new Error('Unable to load NASDAQ symbols from Yahoo or Finnhub');
  }

  const source =
    yahoo.length >= limit
      ? 'yahoo'
      : yahoo.length > 0
        ? 'yahoo+finnhub'
        : 'finnhub';

  return { companies, source };
}

export async function seedNasdaqWatchlistIfNeeded(options?: {
  force?: boolean;
  limit?: number;
}): Promise<NasdaqSeedResult> {
  const limit = options?.limit ?? DEFAULT_LIMIT;

  if (!(await shouldRunSeed(options?.force))) {
    return {
      ok: true,
      skipped: true,
      source: null,
      upserted: 0,
      limit,
    };
  }

  try {
    const { companies, source } = await fetchNasdaqCompanies(limit);

    if (companies.length === 0) {
      throw new Error('NASDAQ symbol list was empty');
    }

    const upserted = await watchlist.upsertManyBulk(
      companies.map((company) => ({
        ticker: company.ticker,
        name: company.name,
        industry: company.industry,
        confidence: company.confidence,
        discoveredBy: 'nasdaq_top500',
      })),
      { discoveredBy: 'nasdaq_top500' }
    );

    await store(
      SEED_CACHE_KEY,
      {
        seededAt: new Date().toISOString(),
        count: upserted,
        source,
      },
      REFRESH_MS
    );

    return {
      ok: true,
      skipped: false,
      source,
      upserted,
      limit,
    };
  } catch (error) {
      logError(error, { source: 'util/nasdaq-watchlist-seed.ts - seedNasdaqWatchlistIfNeeded' });
    const message = error instanceof Error ? error.message : String(error);

    return {
      ok: false,
      skipped: false,
      source: null,
      upserted: 0,
      limit,
      error: message,
    };
  }
}
