import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';

const API_BASE =
  process.env.FMP_API_BASE ??
  process.env.fmp_api_base ??
  'https://financialmodelingprep.com/stable';

const DEFAULT_FMP_CACHE_TTL_MS =
  Number(process.env.FMP_CACHE_TTL_MS) || 4 * 60 * 60 * 1000;

export type FmpPeriod = 'annual' | 'quarter';
export type FmpOutputSize = 'compact' | 'full';

export interface FmpQueryParams {
  symbol?: string;
  query?: string;
  symbols?: string;
  period?: FmpPeriod;
  limit?: number;
  page?: number;
  periodLength?: number;
  timeframe?: string;
  [key: string]: string | number | undefined;
}

export type FmpOptions = CacheOptions;

function getApiKey(): string {
  const apiKey =
    process.env.FMP_API_KEY ??
    process.env.fmp_api_key ??
    process.env.FPM_API_KEY ??
    process.env.fpm_api_key;

  if (!apiKey) {
    throw new Error('FMP_API_KEY (or fmp_api_key) is not set in environment');
  }

  return apiKey;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultHistoricalRange(outputsize: FmpOutputSize = 'compact'): {
  from: string;
  to: string;
} {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (outputsize === 'full' ? 365 * 5 : 140));

  return { from: formatDate(from), to: formatDate(to) };
}

function buildSearchParams(params: FmpQueryParams): URLSearchParams {
  const search = new URLSearchParams();
  search.set('apikey', getApiKey());

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  return search;
}

function buildCacheKey(path: string, search: URLSearchParams): string {
  const cacheParams = new URLSearchParams(search);
  cacheParams.delete('apikey');
  return `fmp:${path}:${cacheParams.toString()}`;
}

async function fetchJson(path: string, search: URLSearchParams): Promise<unknown> {
  const url = `${API_BASE}/${path.replace(/^\//, '')}?${search}`;
  const res = await apiFetch('fmp', url);

  if (!res.ok) {
    throw new Error(`FMP request failed (${res.status})`);
  }

  return res.json();
}

async function request<T = unknown>(
  path: string,
  params: FmpQueryParams = {},
  options: FmpOptions = {}
): Promise<T> {
  const search = buildSearchParams(params);
  const key = buildCacheKey(path, search);

  return cached(key, () => fetchJson(path, search), {
    ttlMs: DEFAULT_FMP_CACHE_TTL_MS,
    ...options,
  }) as Promise<T>;
}

function withSymbol(symbol: string, params: FmpQueryParams = {}): FmpQueryParams {
  return {
    ...params,
    symbol: symbol.toUpperCase(),
  };
}

export async function get<T = unknown>(
  path: string,
  params: FmpQueryParams = {},
  options: FmpOptions = {}
): Promise<T> {
  return request<T>(path, params, options);
}

export async function quote(
  symbol: string,
  options: FmpOptions = {}
): Promise<unknown> {
  return request('/quote', withSymbol(symbol), options);
}

export async function profile(
  symbol: string,
  options: FmpOptions = {}
): Promise<unknown> {
  return request('/profile', withSymbol(symbol), options);
}

export async function searchSymbol(
  query: string,
  options: FmpOptions = {}
): Promise<unknown> {
  return request('/search-symbol', { query }, options);
}

export async function searchName(
  query: string,
  options: FmpOptions = {}
): Promise<unknown> {
  return request('/search-name', { query }, options);
}

export async function incomeStatement(
  symbol: string,
  params: { period?: FmpPeriod; bypassCache?: boolean } = {}
): Promise<unknown> {
  const { bypassCache, period = 'quarter' } = params;

  return request('/income-statement', { ...withSymbol(symbol), period }, { bypassCache });
}

export async function balanceSheet(
  symbol: string,
  params: { period?: FmpPeriod; bypassCache?: boolean } = {}
): Promise<unknown> {
  const { bypassCache, period = 'quarter' } = params;

  return request(
    '/balance-sheet-statement',
    { ...withSymbol(symbol), period },
    { bypassCache }
  );
}

export async function cashFlow(
  symbol: string,
  params: { period?: FmpPeriod; bypassCache?: boolean } = {}
): Promise<unknown> {
  const { bypassCache, period = 'quarter' } = params;

  return request(
    '/cash-flow-statement',
    { ...withSymbol(symbol), period },
    { bypassCache }
  );
}

export async function earnings(
  symbol: string,
  options: FmpOptions = {}
): Promise<unknown> {
  return request('/earnings', withSymbol(symbol), options);
}

export async function historicalPrices(
  symbol: string,
  params: {
    from?: string;
    to?: string;
    outputsize?: FmpOutputSize;
    bypassCache?: boolean;
  } = {}
): Promise<unknown> {
  const { bypassCache, outputsize = 'compact' } = params;
  const range = defaultHistoricalRange(outputsize);

  return request(
    '/historical-price-eod/full',
    {
      ...withSymbol(symbol),
      from: params.from ?? range.from,
      to: params.to ?? range.to,
    },
    { bypassCache }
  );
}

export async function stockNews(
  symbol: string,
  params: { limit?: number; page?: number; bypassCache?: boolean } = {}
): Promise<unknown> {
  const { bypassCache, limit = 20, page } = params;

  return request(
    '/news/stock',
    {
      symbols: symbol.toUpperCase(),
      limit,
      ...(page !== undefined ? { page } : {}),
    },
    { bypassCache }
  );
}

export async function rsi(
  symbol: string,
  params: {
    periodLength?: number;
    timeframe?: string;
    bypassCache?: boolean;
  } = {}
): Promise<unknown> {
  const { bypassCache, periodLength = 14, timeframe = '1day' } = params;

  return request(
    '/technical-indicators/rsi',
    {
      ...withSymbol(symbol),
      periodLength,
      timeframe,
    },
    { bypassCache }
  );
}

export async function sma(
  symbol: string,
  params: {
    periodLength?: number;
    timeframe?: string;
    bypassCache?: boolean;
  } = {}
): Promise<unknown> {
  const { bypassCache, periodLength = 20, timeframe = '1day' } = params;

  return request(
    '/technical-indicators/sma',
    {
      ...withSymbol(symbol),
      periodLength,
      timeframe,
    },
    { bypassCache }
  );
}

export async function stockPeers(
  symbol: string,
  options: FmpOptions = {}
): Promise<unknown> {
  return request('/stock-peers', withSymbol(symbol), options);
}

export async function keyMetrics(
  symbol: string,
  params: { period?: FmpPeriod; bypassCache?: boolean } = {}
): Promise<unknown> {
  const { bypassCache, period = 'quarter' } = params;

  return request('/key-metrics', { ...withSymbol(symbol), period }, { bypassCache });
}
