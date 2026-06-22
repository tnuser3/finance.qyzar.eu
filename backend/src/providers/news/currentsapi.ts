import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';

const API_BASE = 'https://api.currentsapi.services/v1';

export interface CurrentsArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  author: string;
  image: string;
  language: string;
  category: string[];
  published: string;
}

export interface CurrentsNewsResponse {
  status: string;
  news: CurrentsArticle[];
}

export interface CurrentsSearchParams {
  keywords?: string;
  language?: string;
  country?: string;
  category?: string;
  start_date?: string;
  end_date?: string;
}

export interface CurrentsLatestParams {
  language?: string;
}

export type CurrentsOptions = CacheOptions;

function getApiKey(): string {
  const apiKey =
    process.env.CURRENTSAPI_API_KEY ??
    process.env.currentsapi_api_key ??
    process.env.currents_api_key;

  if (!apiKey) {
    throw new Error(
      'CURRENTSAPI_API_KEY (or currentsapi_api_key) is not set in environment'
    );
  }

  return apiKey;
}

function buildCacheKey(endpoint: string, search: URLSearchParams): string {
  return `currentsapi:${endpoint}:${search.toString()}`;
}

function buildSearchParams(
  params: Record<string, string | undefined>
): URLSearchParams {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, value);
    }
  }

  return search;
}

function assertValidResponse(data: Record<string, unknown>): void {
  if (data.status === 'error') {
    throw new Error(
      typeof data.message === 'string' ? data.message : 'Currents API error'
    );
  }
}

async function fetchJson<T extends Record<string, unknown>>(
  path: string,
  search: URLSearchParams = new URLSearchParams()
): Promise<T> {
  const url =
    search.size > 0 ? `${API_BASE}${path}?${search}` : `${API_BASE}${path}`;

  const res = await apiFetch('currentsapi', url, {
    headers: {
      Authorization: getApiKey(),
    },
  });

  if (res.status === 401) {
    throw new Error('Currents API unauthorized — check currentsapi_api_key');
  }

  if (res.status === 429) {
    throw new Error('Currents API rate limit reached');
  }

  if (!res.ok) {
    throw new Error(`Currents API request failed (${res.status})`);
  }

  const data = (await res.json()) as T;
  assertValidResponse(data);
  return data;
}

async function request<T extends Record<string, unknown>>(
  endpoint: string,
  path: string,
  params: Record<string, string | undefined> = {},
  options: CurrentsOptions = {}
): Promise<T> {
  const search = buildSearchParams(params);
  const key = buildCacheKey(endpoint, search);

  return cached(key, () => fetchJson<T>(path, search), options);
}

export async function latestNews(
  params: CurrentsLatestParams & CurrentsOptions = {}
): Promise<CurrentsNewsResponse> {
  const { bypassCache, language = 'en' } = params;

  return request<CurrentsNewsResponse>(
    'latest-news',
    '/latest-news',
    { language },
    { bypassCache }
  );
}

export async function searchNews(
  params: CurrentsSearchParams & CurrentsOptions = {}
): Promise<CurrentsNewsResponse> {
  const {
    bypassCache,
    keywords,
    language,
    country,
    category,
    start_date,
    end_date,
  } = params;

  if (!keywords?.trim()) {
    throw new Error('keywords is required');
  }

  return request<CurrentsNewsResponse>(
    'search',
    '/search',
    {
      keywords: keywords.trim(),
      ...(language ? { language } : {}),
      ...(country ? { country } : {}),
      ...(category ? { category } : {}),
      ...(start_date ? { start_date } : {}),
      ...(end_date ? { end_date } : {}),
    },
    { bypassCache }
  );
}

export async function availableCategories(
  options: CurrentsOptions = {}
): Promise<Record<string, unknown>> {
  return request('categories', '/available/categories', {}, options);
}

export async function availableLanguages(
  options: CurrentsOptions = {}
): Promise<Record<string, unknown>> {
  return request('languages', '/available/languages', {}, options);
}

export async function availableRegions(
  options: CurrentsOptions = {}
): Promise<Record<string, unknown>> {
  return request('regions', '/available/regions', {}, options);
}
