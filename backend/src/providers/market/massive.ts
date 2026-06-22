import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';
import { logError } from '../../infra/db/error-log';

const API_BASE =
  process.env.MASSIVE_API_BASE ??
  process.env.massive_api_base ??
  process.env.POLYGON_API_BASE ??
  process.env.polygon_api_base ??
  'https://api.massive.com';

export type MassiveTimespan = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
export type MassiveOutputSize = 'compact' | 'full';

export interface MassiveQueryParams {
  ticker?: string;
  search?: string;
  limit?: number;
  order?: string;
  sort?: string;
  adjusted?: boolean;
  [key: string]: string | number | boolean | undefined;
}

export type MassiveOptions = CacheOptions;

interface MassiveResponse {
  status?: string;
  error?: string;
  message?: string;
}

function getApiKey(): string {
  const apiKey =
    process.env.MASSIVE_API_KEY ??
    process.env.massive_api_key ??
    process.env.POLYGON_API_KEY ??
    process.env.polygon_api_key;

  if (!apiKey) {
    throw new Error(
      'MASSIVE_API_KEY (or POLYGON_API_KEY / massive_api_key / polygon_api_key) is not set in environment'
    );
  }

  return apiKey;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultDateRange(outputsize: MassiveOutputSize = 'compact'): {
  from: string;
  to: string;
} {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (outputsize === 'full' ? 365 * 5 : 140));

  return { from: formatDate(from), to: formatDate(to) };
}

function buildSearchParams(params: MassiveQueryParams): URLSearchParams {
  const search = new URLSearchParams();
  search.set('apiKey', getApiKey());

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  return search;
}

function buildCacheKey(path: string, search: URLSearchParams): string {
  const cacheParams = new URLSearchParams(search);
  cacheParams.delete('apiKey');
  return `massive:${path}:${cacheParams.toString()}`;
}

function assertValidResponse(data: MassiveResponse): void {
  if (data.status && data.status !== 'OK' && data.status !== 'DELAYED') {
    throw new Error(data.error ?? data.message ?? `Massive API status: ${data.status}`);
  }
}

async function fetchJson(path: string, search: URLSearchParams): Promise<unknown> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE}${normalizedPath}?${search}`;
  const res = await apiFetch('massive', url);

  if (!res.ok) {
    let message = `Massive request failed (${res.status})`;

    try {
      const body = (await res.json()) as MassiveResponse;

      if (body.error ?? body.message) {
        message = String(body.error ?? body.message);
      }
    } catch (error) {
      logError(error, { source: 'util/massive.ts - fetchJson' });

    }

    throw new Error(message);
  }

  const data = (await res.json()) as MassiveResponse;
  assertValidResponse(data);
  return data;
}

async function request<T = unknown>(
  path: string,
  params: MassiveQueryParams = {},
  options: MassiveOptions = {}
): Promise<T> {
  const search = buildSearchParams(params);
  const key = buildCacheKey(path, search);

  return cached(key, () => fetchJson(path, search), options) as Promise<T>;
}

export async function get<T = unknown>(
  path: string,
  params: MassiveQueryParams = {},
  options: MassiveOptions = {}
): Promise<T> {
  return request<T>(path, params, options);
}

export async function snapshot(
  symbol: string,
  options: MassiveOptions = {}
): Promise<unknown> {
  return request(
    `/v2/snapshot/locale/us/markets/stocks/tickers/${symbol.toUpperCase()}`,
    {},
    options
  );
}

export async function previousClose(
  symbol: string,
  options: MassiveOptions = {}
): Promise<unknown> {
  return request(
    `/v2/aggs/ticker/${symbol.toUpperCase()}/prev`,
    {},
    options
  );
}

export async function aggregates(
  symbol: string,
  params: {
    multiplier?: number;
    timespan?: MassiveTimespan;
    from?: string;
    to?: string;
    outputsize?: MassiveOutputSize;
    limit?: number;
    adjusted?: boolean;
    bypassCache?: boolean;
  } = {}
): Promise<unknown> {
  const {
    bypassCache,
    multiplier = 1,
    timespan = 'day',
    outputsize = 'compact',
    limit = 5000,
    adjusted = true,
  } = params;
  const range = defaultDateRange(outputsize);
  const ticker = symbol.toUpperCase();

  return request(
    `/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${params.from ?? range.from}/${params.to ?? range.to}`,
    {
      adjusted,
      limit,
      sort: 'asc',
    },
    { bypassCache }
  );
}

export async function listExchangeTickers(
  params: {
    exchange?: string;
    limit?: number;
    sort?: string;
    order?: 'asc' | 'desc';
    bypassCache?: boolean;
  } = {}
): Promise<unknown> {
  const {
    bypassCache,
    exchange = 'XNAS',
    limit = 500,
    sort,
    order = 'asc',
  } = params;

  return request(
    '/v3/reference/tickers',
    {
      exchange,
      active: true,
      ...(sort ? { sort, order } : {}),
      limit,
    },
    {
      bypassCache,
      ttlMs: 7 * 24 * 60 * 60 * 1000,
    }
  );
}

export async function tickerSearch(
  query: string,
  params: { limit?: number; bypassCache?: boolean } = {}
): Promise<unknown> {
  const { bypassCache, limit = 10 } = params;

  return request(
    '/v3/reference/tickers',
    {
      search: query,
      active: true,
      limit,
    },
    { bypassCache }
  );
}

export async function tickerDetails(
  symbol: string,
  options: MassiveOptions = {}
): Promise<unknown> {
  return request(`/v3/reference/tickers/${symbol.toUpperCase()}`, {}, options);
}

export async function news(
  symbol: string,
  params: { limit?: number; bypassCache?: boolean } = {}
): Promise<unknown> {
  const { bypassCache, limit = 20 } = params;

  return request(
    '/v2/reference/news',
    {
      ticker: symbol.toUpperCase(),
      limit,
      sort: 'published_utc',
      order: 'desc',
    },
    { bypassCache }
  );
}

export async function financials(
  symbol: string,
  params: { limit?: number; bypassCache?: boolean } = {}
): Promise<unknown> {
  const { bypassCache, limit = 10 } = params;

  return request(
    '/vX/reference/financials',
    {
      ticker: symbol.toUpperCase(),
      limit,
    },
    { bypassCache }
  );
}
