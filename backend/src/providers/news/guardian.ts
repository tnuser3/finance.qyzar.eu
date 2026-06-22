import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';

const API_BASE = 'https://content.guardianapis.com';

export type GuardianOrderBy = 'newest' | 'oldest' | 'relevance';
export type GuardianOffice = 'uk' | 'us' | 'aus';

export interface GuardianSearchParams {
  q?: string;
  section?: string;
  tag?: string;
  'from-date'?: string;
  'to-date'?: string;
  page?: number;
  'page-size'?: number;
  'order-by'?: GuardianOrderBy;
  'production-office'?: GuardianOffice;
  lang?: string;
  'show-fields'?: string;
  'show-tags'?: string;
}

export interface GuardianQueryParams {
  q?: string;
  section?: string;
  page?: number;
  'page-size'?: number;
}

export type GuardianOptions = CacheOptions;

function getApiKey(): string {
  const apiKey =
    process.env.GUARDIAN_API_KEY ??
    process.env.guardian_api_key ??
    process.env.guardian_apikey;

  if (!apiKey) {
    throw new Error(
      'GUARDIAN_API_KEY (or guardian_api_key) is not set in environment'
    );
  }

  return apiKey;
}

function buildSearchParams(
  params: Record<string, string | number | undefined>
): URLSearchParams {
  const search = new URLSearchParams();
  search.set('api-key', getApiKey());
  search.set('format', 'json');

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  return search;
}

function buildCacheKey(endpoint: string, search: URLSearchParams): string {
  const cacheParams = new URLSearchParams(search);
  cacheParams.delete('api-key');
  return `guardian:${endpoint}:${cacheParams.toString()}`;
}

function assertValidResponse(data: Record<string, unknown>): void {
  const response = data.response as Record<string, unknown> | undefined;
  const status = response?.status;

  if (status === 'error') {
    const message = response?.message;
    throw new Error(
      typeof message === 'string' ? message : 'Guardian API error'
    );
  }
}

async function fetchJson<T extends Record<string, unknown>>(
  path: string,
  search: URLSearchParams
): Promise<T> {
  const url = `${API_BASE}${path}?${search}`;
  const res = await apiFetch('guardian', url);

  if (!res.ok) {
    throw new Error(`Guardian API request failed (${res.status})`);
  }

  const data = (await res.json()) as T;
  assertValidResponse(data);
  return data;
}

async function request<T extends Record<string, unknown>>(
  endpoint: string,
  path: string,
  params: Record<string, string | number | undefined> = {},
  options: GuardianOptions = {}
): Promise<T> {
  const search = buildSearchParams(params);
  const key = buildCacheKey(endpoint, search);

  return cached(key, () => fetchJson<T>(path, search), options);
}

export async function search(
  params: GuardianSearchParams & GuardianOptions = {}
): Promise<Record<string, unknown>> {
  const { bypassCache, ...query } = params;

  return request(
    'search',
    '/search',
    {
      'order-by': 'newest',
      'page-size': 10,
      'show-fields': 'headline,trailText,thumbnail,byline',
      ...query,
    },
    { bypassCache }
  );
}

export async function sections(
  params: GuardianQueryParams & GuardianOptions = {}
): Promise<Record<string, unknown>> {
  const { bypassCache, ...query } = params;

  return request('sections', '/sections', query, { bypassCache });
}

export async function tags(
  params: GuardianQueryParams & GuardianOptions = {}
): Promise<Record<string, unknown>> {
  const { bypassCache, ...query } = params;

  return request('tags', '/tags', query, { bypassCache });
}

export async function getItem(
  id: string,
  options: GuardianOptions = {}
): Promise<Record<string, unknown>> {
  const articleId = id.trim();

  if (!articleId) {
    throw new Error('id is required');
  }

  return request(
    `item:${articleId}`,
    `/${articleId}`,
    { 'show-fields': 'all' },
    options
  );
}
