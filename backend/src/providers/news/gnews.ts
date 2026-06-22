import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';

const API_BASE = 'https://gnews.io/api/v4';

export type GNewsCategory =
  | 'general'
  | 'world'
  | 'nation'
  | 'business'
  | 'technology'
  | 'entertainment'
  | 'sports'
  | 'science'
  | 'health';

export interface GNewsSearchParams {
  q: string;
  lang?: string;
  country?: string;
  max?: number;
  page?: number;
  from?: string;
  to?: string;
  sortby?: 'publishedAt' | 'relevance';
  in?: string;
}

export interface GNewsTopHeadlinesParams {
  category?: GNewsCategory;
  q?: string;
  lang?: string;
  country?: string;
  max?: number;
  page?: number;
  from?: string;
  to?: string;
}

export type GNewsOptions = CacheOptions;

function getApiKey(): string {
  const apiKey = process.env.GNEWS_API_KEY ?? process.env.gnews_api_key;

  if (!apiKey) {
    throw new Error('GNEWS_API_KEY (or gnews_api_key) is not set in environment');
  }

  return apiKey;
}

function buildSearchParams(
  params: Record<string, string | number | undefined>
): URLSearchParams {
  const search = new URLSearchParams();
  search.set('apikey', getApiKey());

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  return search;
}

function buildCacheKey(endpoint: string, search: URLSearchParams): string {
  const cacheParams = new URLSearchParams(search);
  cacheParams.delete('apikey');
  return `gnews:${endpoint}:${cacheParams.toString()}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiFetch('gnews', url);

  if (!res.ok) {
    throw new Error(`GNews API request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

async function request<T>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
  options: GNewsOptions = {}
): Promise<T> {
  const search = buildSearchParams(params);
  const url = `${API_BASE}/${endpoint}?${search}`;
  const key = buildCacheKey(endpoint, search);

  return cached(key, () => fetchJson<T>(url), options);
}

export async function search(
  params: GNewsSearchParams & GNewsOptions
): Promise<Record<string, unknown>> {
  const { bypassCache, q, ...query } = params;

  if (!q.trim()) {
    throw new Error('q is required');
  }

  return request(
    'search',
    {
      q,
      max: query.max ?? 10,
      page: query.page ?? 1,
      sortby: query.sortby ?? 'publishedAt',
      ...(query.lang ? { lang: query.lang } : {}),
      ...(query.country ? { country: query.country } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      ...(query.in ? { in: query.in } : {}),
    },
    { bypassCache }
  );
}

export async function topHeadlines(
  params: GNewsTopHeadlinesParams & GNewsOptions = {}
): Promise<Record<string, unknown>> {
  const { bypassCache, ...query } = params;

  return request(
    'top-headlines',
    {
      category: query.category ?? 'business',
      max: query.max ?? 10,
      page: query.page ?? 1,
      ...(query.q ? { q: query.q } : {}),
      ...(query.lang ? { lang: query.lang } : {}),
      ...(query.country ? { country: query.country } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
    },
    { bypassCache }
  );
}

export async function listSources(
  params: { lang?: string; country?: string } & GNewsOptions = {}
): Promise<Record<string, unknown>> {
  const { bypassCache, lang, country } = params;

  return request(
    'sources',
    {
      ...(lang ? { lang } : {}),
      ...(country ? { country } : {}),
    },
    { bypassCache }
  );
}
