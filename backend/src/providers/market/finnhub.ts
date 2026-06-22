import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';
import { logError } from '../../infra/db/error-log';

const API_BASE =
  process.env.FINNHUB_API_BASE ??
  process.env.finnhub_api_base ??
  'https://finnhub.io/api/v1';

export type FinnhubResolution = '1' | '5' | '15' | '30' | '60' | 'D' | 'W' | 'M';
export type FinnhubNewsCategory = 'general' | 'forex' | 'crypto' | 'merger';
export type FinnhubOutputSize = 'compact' | 'full';

export interface FinnhubQueryParams {
  symbol?: string;
  q?: string;
  query?: string;
  exchange?: string;
  resolution?: FinnhubResolution;
  from?: number | string;
  to?: number | string;
  category?: FinnhubNewsCategory;
  minId?: number;
  metric?: string;
  [key: string]: string | number | undefined;
}

export type FinnhubOptions = CacheOptions;

function getApiKey(): string {
  const apiKey = process.env.FINNHUB_API_KEY ?? process.env.finnhub_api_key;

  if (!apiKey) {
    throw new Error('FINNHUB_API_KEY (or finnhub_api_key) is not set in environment');
  }

  return apiKey;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultNewsRange(outputsize: FinnhubOutputSize = 'compact'): {
  from: string;
  to: string;
} {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (outputsize === 'full' ? 365 : 30));

  return { from: formatDate(from), to: formatDate(to) };
}

function defaultCandleRange(outputsize: FinnhubOutputSize = 'compact'): {
  from: number;
  to: number;
} {
  const to = Math.floor(Date.now() / 1000);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - (outputsize === 'full' ? 365 * 5 : 140));

  return { from: Math.floor(fromDate.getTime() / 1000), to };
}

function buildSearchParams(params: FinnhubQueryParams): URLSearchParams {
  const search = new URLSearchParams();
  search.set('token', getApiKey());

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  return search;
}

function buildCacheKey(path: string, search: URLSearchParams): string {
  const cacheParams = new URLSearchParams(search);
  cacheParams.delete('token');
  return `finnhub:${path}:${cacheParams.toString()}`;
}

async function fetchJson(path: string, search: URLSearchParams): Promise<unknown> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE}${normalizedPath}?${search}`;
  const res = await apiFetch('finnhub', url);

  if (!res.ok) {
    throw new Error(`Finnhub request failed (${res.status})`);
  }

  return res.json();
}

async function request<T = unknown>(
  path: string,
  params: FinnhubQueryParams = {},
  options: FinnhubOptions = {}
): Promise<T> {
  const search = buildSearchParams(params);
  const key = buildCacheKey(path, search);

  return cached(key, () => fetchJson(path, search), options) as Promise<T>;
}

function withSymbol(symbol: string, params: FinnhubQueryParams = {}): FinnhubQueryParams {
  return {
    ...params,
    symbol: symbol.toUpperCase(),
  };
}

export async function get<T = unknown>(
  path: string,
  params: FinnhubQueryParams = {},
  options: FinnhubOptions = {}
): Promise<T> {
  return request<T>(path, params, options);
}

export async function quote(symbol: string, options: FinnhubOptions = {}): Promise<unknown> {
  return request('/quote', withSymbol(symbol), options);
}

export async function companyProfile(
  symbol: string,
  options: FinnhubOptions = {}
): Promise<unknown> {
  return request('/stock/profile2', withSymbol(symbol), options);
}

const LOGO_CACHE_TTL_MS =
  Number(process.env.FINNHUB_LOGO_CACHE_TTL_MS) || 7 * 24 * 60 * 60 * 1000;

export async function companyLogo(
  symbol: string,
  options: FinnhubOptions = {}
): Promise<string | null> {
  try {
    const profile = (await companyProfile(symbol, {
      ...options,
      ttlMs: options.ttlMs ?? LOGO_CACHE_TTL_MS,
    })) as { logo?: string };

    return typeof profile.logo === 'string' && profile.logo.length > 0
      ? profile.logo
      : null;
  } catch (error) {
      logError(error, { source: 'util/finnhub.ts - companyLogo' });
    return null;
  }
}

export async function companyLogos(
  symbols: string[],
  options: FinnhubOptions = {}
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      const ticker = symbol.trim().toUpperCase();
      if (!ticker) return null;

      const logo = await companyLogo(ticker, options);
      return logo ? ([ticker, logo] as const) : null;
    })
  );

  const logos: Record<string, string> = {};

  for (const entry of entries) {
    if (entry) {
      logos[entry[0]] = entry[1];
    }
  }

  return logos;
}

export async function stockSymbols(
  exchange: string,
  params: {
    mic?: string;
    securityType?: string;
    bypassCache?: boolean;
  } = {}
): Promise<unknown> {
  const { bypassCache, mic, securityType } = params;

  return request(
    '/stock/symbol',
    {
      exchange,
      ...(mic ? { mic } : {}),
      ...(securityType ? { securityType } : {}),
    },
    {
      bypassCache,
      ttlMs: 7 * 24 * 60 * 60 * 1000,
    }
  );
}

export async function symbolSearch(
  query: string,
  params: { exchange?: string; bypassCache?: boolean } = {}
): Promise<unknown> {
  const { bypassCache, exchange } = params;

  return request(
    '/search',
    {
      q: query,
      ...(exchange ? { exchange } : {}),
    },
    { bypassCache }
  );
}

export async function candles(
  symbol: string,
  params: {
    resolution?: FinnhubResolution;
    from?: number;
    to?: number;
    outputsize?: FinnhubOutputSize;
    bypassCache?: boolean;
  } = {}
): Promise<unknown> {
  const { bypassCache, outputsize = 'compact', resolution = 'D' } = params;
  const range = defaultCandleRange(outputsize);

  return request(
    '/stock/candle',
    {
      ...withSymbol(symbol),
      resolution,
      from: params.from ?? range.from,
      to: params.to ?? range.to,
    },
    { bypassCache }
  );
}

export async function companyNews(
  symbol: string,
  params: {
    from?: string;
    to?: string;
    outputsize?: FinnhubOutputSize;
    bypassCache?: boolean;
  } = {}
): Promise<unknown> {
  const { bypassCache, outputsize = 'compact' } = params;
  const range = defaultNewsRange(outputsize);

  return request(
    '/company-news',
    {
      ...withSymbol(symbol),
      from: params.from ?? range.from,
      to: params.to ?? range.to,
    },
    { bypassCache }
  );
}

export async function marketNews(
  params: {
    category?: FinnhubNewsCategory;
    minId?: number;
    bypassCache?: boolean;
  } = {}
): Promise<unknown> {
  const { bypassCache, category = 'general', minId } = params;

  return request(
    '/news',
    {
      category,
      ...(minId !== undefined ? { minId } : {}),
    },
    { bypassCache }
  );
}

export async function earnings(symbol: string, options: FinnhubOptions = {}): Promise<unknown> {
  return request('/stock/earnings', withSymbol(symbol), options);
}

export async function basicFinancials(
  symbol: string,
  params: { metric?: string; bypassCache?: boolean } = {}
): Promise<unknown> {
  const { bypassCache, metric = 'all' } = params;

  return request('/stock/metric', { ...withSymbol(symbol), metric }, { bypassCache });
}

export async function recommendations(
  symbol: string,
  options: FinnhubOptions = {}
): Promise<unknown> {
  return request('/stock/recommendation', withSymbol(symbol), options);
}

export async function peers(symbol: string, options: FinnhubOptions = {}): Promise<unknown> {
  return request('/stock/peers', withSymbol(symbol), options);
}

export async function insiderTransactions(
  symbol: string,
  options: FinnhubOptions = {}
): Promise<unknown> {
  return request('/stock/insider-transactions', withSymbol(symbol), options);
}

export async function priceTarget(symbol: string, options: FinnhubOptions = {}): Promise<unknown> {
  return request('/stock/price-target', withSymbol(symbol), options);
}

export async function socialSentiment(
  symbol: string,
  params: {
    from?: string;
    to?: string;
    outputsize?: FinnhubOutputSize;
    bypassCache?: boolean;
  } = {}
): Promise<unknown> {
  const { bypassCache, outputsize = 'compact' } = params;
  const range = defaultNewsRange(outputsize);

  return request(
    '/stock/social-sentiment',
    {
      ...withSymbol(symbol),
      from: params.from ?? range.from,
      to: params.to ?? range.to,
    },
    { bypassCache }
  );
}
