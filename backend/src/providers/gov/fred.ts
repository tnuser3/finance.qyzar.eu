import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';

const API_BASE = 'https://api.stlouisfed.org/fred';

export type FredFileType = 'json' | 'xml' | 'csv' | 'xlsx';

export interface FredSeriesSearchParams {
  search_text: string;
  limit?: number;
  order_by?: string;
  sort_order?: 'asc' | 'desc';
  file_type?: FredFileType;
}

export interface FredObservationsParams {
  series_id: string;
  observation_start?: string;
  observation_end?: string;
  limit?: number;
  sort_order?: 'asc' | 'desc';
  units?: string;
  frequency?: string;
  file_type?: FredFileType;
}

export interface FredSeriesInfoParams {
  series_id: string;
  file_type?: FredFileType;
}

export type FredOptions = CacheOptions;

function getApiKey(): string {
  const apiKey = process.env.FRED_API_KEY ?? process.env.fred_api_key;

  if (!apiKey) {
    throw new Error('FRED_API_KEY (or fred_api_key) is not set in environment');
  }

  return apiKey;
}

function buildSearchParams(
  params: Record<string, string | number | undefined>
): URLSearchParams {
  const search = new URLSearchParams();
  search.set('api_key', getApiKey());
  search.set('file_type', 'json');

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  return search;
}

function buildCacheKey(path: string, search: URLSearchParams): string {
  const cacheParams = new URLSearchParams(search);
  cacheParams.delete('api_key');
  return `fred:${path}:${cacheParams.toString()}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiFetch('fred', url);

  if (!res.ok) {
    throw new Error(`FRED API request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

async function request<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  options: FredOptions = {}
): Promise<T> {
  const search = buildSearchParams(params);
  const url = `${API_BASE}/${path}?${search}`;
  const key = buildCacheKey(path, search);

  return cached(key, () => fetchJson<T>(url), options);
}

export async function searchSeries(
  params: FredSeriesSearchParams & FredOptions
): Promise<Record<string, unknown>> {
  const { bypassCache, search_text, ...query } = params;

  if (!search_text.trim()) {
    throw new Error('search_text is required');
  }

  return request(
    'series/search',
    {
      search_text,
      limit: query.limit ?? 25,
      order_by: query.order_by ?? 'search_rank',
      sort_order: query.sort_order ?? 'desc',
      file_type: query.file_type ?? 'json',
    },
    { bypassCache }
  );
}

export async function seriesObservations(
  params: FredObservationsParams & FredOptions
): Promise<Record<string, unknown>> {
  const { bypassCache, series_id, ...query } = params;

  if (!series_id.trim()) {
    throw new Error('series_id is required');
  }

  return request(
    'series/observations',
    {
      series_id,
      limit: query.limit ?? 100,
      sort_order: query.sort_order ?? 'desc',
      ...(query.observation_start ? { observation_start: query.observation_start } : {}),
      ...(query.observation_end ? { observation_end: query.observation_end } : {}),
      ...(query.units ? { units: query.units } : {}),
      ...(query.frequency ? { frequency: query.frequency } : {}),
      file_type: query.file_type ?? 'json',
    },
    { bypassCache }
  );
}

export async function seriesInfo(
  params: FredSeriesInfoParams & FredOptions
): Promise<Record<string, unknown>> {
  const { bypassCache, series_id, file_type } = params;

  if (!series_id.trim()) {
    throw new Error('series_id is required');
  }

  return request(
    'series',
    { series_id, file_type: file_type ?? 'json' },
    { bypassCache }
  );
}
