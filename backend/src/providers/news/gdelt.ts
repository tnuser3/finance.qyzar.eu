import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';
import { RateLimitError } from '../../infra/http/ratelimit';
import { logError } from '../../infra/db/error-log';

const DOC_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GEO_BASE = 'https://api.gdeltproject.org/api/v2/geo/geo';

export type GdeltDocMode =
  | 'ArtList'
  | 'TimelineVol'
  | 'TimelineVolRaw'
  | 'TimelineTone'
  | 'TimelineLang'
  | 'ToneChart'
  | 'WordCloudEnglish';

export type GdeltGeoMode =
  | 'PointData'
  | 'Country'
  | 'ADM1'
  | 'ToneChart'
  | 'WordCloudEnglish';

export interface GdeltDocParams {
  query: string;
  mode?: GdeltDocMode;
  format?: 'json' | 'csv';
  timespan?: string;
  startdatetime?: string;
  enddatetime?: string;
  maxrecords?: number;
  sort?: 'datedesc' | 'dateasc' | 'hybrid';
}

export interface GdeltGeoParams {
  query: string;
  mode?: GdeltGeoMode;
  format?: 'json' | 'geojson';
  timespan?: string;
  startdatetime?: string;
  enddatetime?: string;
}

export interface GdeltArticle {
  url: string;
  url_mobile?: string;
  title: string;
  seendate: string;
  socialimage?: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

export interface GdeltArtListResponse {
  articles?: GdeltArticle[];
}

export type GdeltOptions = CacheOptions;

function buildCacheKey(endpoint: string, search: URLSearchParams): string {
  return `gdelt:${endpoint}:${search.toString()}`;
}

function toDocSearchParams(params: GdeltDocParams): URLSearchParams {
  const search = new URLSearchParams();

  search.set('query', params.query);
  search.set('mode', params.mode ?? 'ArtList');
  search.set('format', params.format ?? 'json');

  if (params.timespan) {
    search.set('timespan', params.timespan);
  }

  if (params.startdatetime) {
    search.set('STARTDATETIME', params.startdatetime);
  }

  if (params.enddatetime) {
    search.set('ENDDATETIME', params.enddatetime);
  }

  if (params.maxrecords !== undefined) {
    search.set('maxrecords', String(params.maxrecords));
  }

  if (params.sort) {
    search.set('sort', params.sort);
  }

  return search;
}

function toGeoSearchParams(params: GdeltGeoParams): URLSearchParams {
  const search = new URLSearchParams();

  search.set('query', params.query);
  search.set('mode', params.mode ?? 'PointData');
  search.set('format', params.format ?? 'json');

  if (params.timespan) {
    search.set('timespan', params.timespan);
  }

  if (params.startdatetime) {
    search.set('STARTDATETIME', params.startdatetime);
  }

  if (params.enddatetime) {
    search.set('ENDDATETIME', params.enddatetime);
  }

  return search;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiFetch('gdelt', url);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`GDELT request failed (${res.status}): ${url}`);
  }

  const lower = text.trim().toLowerCase();

  if (lower.includes('limit requests to one every') || lower.includes('please limit requests')) {
    throw new RateLimitError('gdelt', 5_500);
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
      logError(error, { source: 'util/gdelt.ts - toGeoSearchParams' });
    throw new Error(`GDELT returned non-JSON response: ${text.slice(0, 200)}`);
  }
}

async function request<T>(
  endpoint: 'doc' | 'geo',
  baseUrl: string,
  search: URLSearchParams,
  options: GdeltOptions = {}
): Promise<T> {
  const url = `${baseUrl}?${search}`;
  const key = buildCacheKey(endpoint, search);

  return cached(key, () => fetchJson<T>(url), options);
}

export async function doc<T = unknown>(
  params: GdeltDocParams,
  options: GdeltOptions = {}
): Promise<T> {
  return request<T>('doc', DOC_BASE, toDocSearchParams(params), options);
}

export async function geo<T = unknown>(
  params: GdeltGeoParams,
  options: GdeltOptions = {}
): Promise<T> {
  return request<T>('geo', GEO_BASE, toGeoSearchParams(params), options);
}

export async function articles(
  query: string,
  params: Omit<GdeltDocParams, 'query' | 'mode'> & GdeltOptions = {}
): Promise<GdeltArticle[]> {
  const { bypassCache, ...docParams } = params;

  const response = await doc<GdeltArtListResponse>(
    {
      query,
      mode: 'ArtList',
      timespan: '24h',
      sort: 'datedesc',
      maxrecords: 50,
      ...docParams,
    },
    { bypassCache }
  );

  return response.articles ?? [];
}
