import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';

const API_BASE = 'https://api.census.gov/data';

export interface CensusDataParams {
  year: string | number;
  dataset: string;
  get: string;
  for?: string;
  in?: string;
  [key: string]: string | number | undefined;
}

export type CensusOptions = CacheOptions;

function getApiKey(): string | undefined {
  return process.env.CENSUS_API_KEY ?? process.env.census_api_key;
}

function buildSearchParams(
  params: Record<string, string | number | undefined>
): URLSearchParams {
  const search = new URLSearchParams();
  const apiKey = getApiKey();

  if (apiKey) {
    search.set('key', apiKey);
  }

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && key !== 'year' && key !== 'dataset') {
      search.set(key, String(value));
    }
  }

  return search;
}

function buildCacheKey(path: string, search: URLSearchParams): string {
  const cacheParams = new URLSearchParams(search);
  cacheParams.delete('key');
  return `census:${path}:${cacheParams.toString()}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiFetch('census', url);

  if (!res.ok) {
    throw new Error(`Census API request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export async function query(
  params: CensusDataParams & CensusOptions
): Promise<unknown> {
  const { bypassCache, year, dataset, ...queryParams } = params;

  if (!year || !dataset) {
    throw new Error('year and dataset are required');
  }

  if (!queryParams.get) {
    throw new Error('get is required (comma-separated variables)');
  }

  const path = `${year}/${dataset}`;
  const search = buildSearchParams(queryParams);
  const url = `${API_BASE}/${path}?${search}`;
  const key = buildCacheKey(path, search);

  return cached(key, () => fetchJson(url), { bypassCache });
}

export async function acs5(
  year: string | number,
  variables: string,
  geography: string,
  options: CensusOptions = {}
): Promise<unknown> {
  return query({
    year,
    dataset: 'acs/acs5',
    get: variables,
    for: geography,
    ...options,
  });
}

export async function timeseries(
  dataset: string,
  variables: string,
  options: CensusOptions & { for?: string } = {}
): Promise<unknown> {
  return query({
    year: 'timeseries',
    dataset,
    get: variables,
    for: options.for,
    bypassCache: options.bypassCache,
  });
}
