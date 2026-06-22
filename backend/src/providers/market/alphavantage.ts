import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';

const API_BASE = 'https://www.alphavantage.co/query';

export type AlphaVantageOutputSize = 'compact' | 'full';
export type AlphaVantageDataType = 'json' | 'csv';

export interface AlphaVantageQueryParams {
  function: string;
  symbol?: string;
  keywords?: string;
  tickers?: string;
  topics?: string;
  interval?: string;
  outputsize?: AlphaVantageOutputSize;
  datatype?: AlphaVantageDataType;
  [key: string]: string | undefined;
}

export interface GlobalQuote {
  symbol: string;
  open: string;
  high: string;
  low: string;
  price: string;
  volume: string;
  latestTradingDay: string;
  previousClose: string;
  change: string;
  changePercent: string;
}

export type AlphaVantageOptions = CacheOptions;

function getApiKey(): string {
  const apiKey =
    process.env.ALPHA_VANTAGE_API_KEY ??
    process.env.alphavantage_api_key ??
    process.env.alphacvantage_api_key;

  if (!apiKey) {
    throw new Error(
      'ALPHA_VANTAGE_API_KEY (or alphavantage_api_key) is not set in environment'
    );
  }

  return apiKey;
}

function buildSearchParams(params: AlphaVantageQueryParams): URLSearchParams {
  const search = new URLSearchParams();
  search.set('apikey', getApiKey());

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, value);
    }
  }

  return search;
}

function buildCacheKey(search: URLSearchParams): string {
  const cacheParams = new URLSearchParams(search);
  cacheParams.delete('apikey');
  return `alphavantage:${cacheParams.toString()}`;
}

function parseGlobalQuote(data: Record<string, unknown>): GlobalQuote {
  const quote = data['Global Quote'] as Record<string, string> | undefined;

  if (!quote) {
    throw new Error('Global Quote not found in Alpha Vantage response');
  }

  return {
    symbol: quote['01. symbol'] ?? '',
    open: quote['02. open'] ?? '',
    high: quote['03. high'] ?? '',
    low: quote['04. low'] ?? '',
    price: quote['05. price'] ?? '',
    volume: quote['06. volume'] ?? '',
    latestTradingDay: quote['07. latest trading day'] ?? '',
    previousClose: quote['08. previous close'] ?? '',
    change: quote['09. change'] ?? '',
    changePercent: quote['10. change percent'] ?? '',
  };
}

function assertValidResponse(data: Record<string, unknown>): void {
  const note = data.Note ?? data.Information ?? data['Error Message'];

  if (typeof note === 'string') {
    throw new Error(note);
  }
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await apiFetch('alphavantage', url);

  if (!res.ok) {
    throw new Error(`Alpha Vantage request failed (${res.status})`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  assertValidResponse(data);
  return data;
}

async function request<T = Record<string, unknown>>(
  params: AlphaVantageQueryParams,
  options: AlphaVantageOptions = {}
): Promise<T> {
  const search = buildSearchParams(params);
  const url = `${API_BASE}?${search}`;
  const key = buildCacheKey(search);

  return cached(key, () => fetchJson(url), options) as Promise<T>;
}

export async function query<T = Record<string, unknown>>(
  params: AlphaVantageQueryParams,
  options: AlphaVantageOptions = {}
): Promise<T> {
  return request<T>(params, options);
}

export async function globalQuote(
  symbol: string,
  options: AlphaVantageOptions = {}
): Promise<GlobalQuote> {
  const data = await request(
    {
      function: 'GLOBAL_QUOTE',
      symbol: symbol.toUpperCase(),
    },
    options
  );

  return parseGlobalQuote(data);
}

export async function dailySeries(
  symbol: string,
  params: {
    outputsize?: AlphaVantageOutputSize;
    bypassCache?: boolean;
  } = {}
): Promise<Record<string, unknown>> {
  const { bypassCache, outputsize = 'compact' } = params;

  return request(
    {
      function: 'TIME_SERIES_DAILY',
      symbol: symbol.toUpperCase(),
      outputsize,
    },
    { bypassCache }
  );
}

export async function symbolSearch(
  keywords: string,
  options: AlphaVantageOptions = {}
): Promise<Record<string, unknown>> {
  return request(
    {
      function: 'SYMBOL_SEARCH',
      keywords,
    },
    options
  );
}

export async function companyOverview(
  symbol: string,
  options: AlphaVantageOptions = {}
): Promise<Record<string, unknown>> {
  return request(
    {
      function: 'OVERVIEW',
      symbol: symbol.toUpperCase(),
    },
    options
  );
}

export async function newsSentiment(
  params: {
    tickers?: string;
    topics?: string;
    limit?: number;
    bypassCache?: boolean;
  } = {}
): Promise<Record<string, unknown>> {
  const { bypassCache, tickers, topics, limit } = params;

  return request(
    {
      function: 'NEWS_SENTIMENT',
      ...(tickers ? { tickers } : {}),
      ...(topics ? { topics } : {}),
      ...(limit ? { limit: String(limit) } : {}),
    },
    { bypassCache }
  );
}

export async function earnings(
  symbol: string,
  options: AlphaVantageOptions = {}
): Promise<Record<string, unknown>> {
  return request(
    { function: 'EARNINGS', symbol: symbol.toUpperCase() },
    options
  );
}

export async function incomeStatement(
  symbol: string,
  options: AlphaVantageOptions = {}
): Promise<Record<string, unknown>> {
  return request(
    { function: 'INCOME_STATEMENT', symbol: symbol.toUpperCase() },
    options
  );
}

export async function balanceSheet(
  symbol: string,
  options: AlphaVantageOptions = {}
): Promise<Record<string, unknown>> {
  return request(
    { function: 'BALANCE_SHEET', symbol: symbol.toUpperCase() },
    options
  );
}

export async function cashFlow(
  symbol: string,
  options: AlphaVantageOptions = {}
): Promise<Record<string, unknown>> {
  return request(
    { function: 'CASH_FLOW', symbol: symbol.toUpperCase() },
    options
  );
}

export async function rsi(
  symbol: string,
  params: { interval?: string; bypassCache?: boolean } = {}
): Promise<Record<string, unknown>> {
  const { bypassCache, interval = 'daily' } = params;

  return request(
    {
      function: 'RSI',
      symbol: symbol.toUpperCase(),
      interval,
      time_period: '14',
      series_type: 'close',
    },
    { bypassCache }
  );
}

export async function macd(
  symbol: string,
  params: { interval?: string; bypassCache?: boolean } = {}
): Promise<Record<string, unknown>> {
  const { bypassCache, interval = 'daily' } = params;

  return request(
    {
      function: 'MACD',
      symbol: symbol.toUpperCase(),
      interval,
      series_type: 'close',
    },
    { bypassCache }
  );
}

export async function bbands(
  symbol: string,
  params: { interval?: string; bypassCache?: boolean } = {}
): Promise<Record<string, unknown>> {
  const { bypassCache, interval = 'daily' } = params;

  return request(
    {
      function: 'BBANDS',
      symbol: symbol.toUpperCase(),
      interval,
      time_period: '20',
      series_type: 'close',
    },
    { bypassCache }
  );
}
