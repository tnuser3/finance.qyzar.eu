import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';

const API_BASE = 'https://api.usaspending.gov/api/v2';

export interface UsaSpendingAwardSearchParams {
  keywords?: string[];
  time_period?: Array<{ start_date: string; end_date: string }>;
  award_type_codes?: string[];
  agencies?: Array<{ type: string; tier: string; name: string }>;
  fields?: string[];
  limit?: number;
  page?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface UsaSpendingGeographyParams {
  scope?: 'place_of_performance' | 'recipient_location';
  geo_layer?: 'state' | 'county' | 'district' | 'country';
  filters?: Record<string, unknown>;
}

export type UsaSpendingOptions = CacheOptions;

function buildCacheKey(path: string, body: unknown): string {
  return `usaspending:${path}:${JSON.stringify(body)}`;
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await apiFetch('usaspending', `${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`USAspending API request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch('usaspending', `${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`USAspending API request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export async function searchSpendingByAward(
  params: UsaSpendingAwardSearchParams & UsaSpendingOptions = {}
): Promise<Record<string, unknown>> {
  const {
    bypassCache,
    keywords,
    time_period,
    award_type_codes,
    agencies,
    fields,
    limit,
    page,
    sort,
    order,
  } = params;

  const body: Record<string, unknown> = {
    filters: {
      ...(keywords?.length ? { keywords } : {}),
      ...(time_period?.length ? { time_period } : {}),
      ...(award_type_codes?.length ? { award_type_codes } : {}),
      ...(agencies?.length ? { agencies } : {}),
    },
    fields: fields ?? [
      'Award ID',
      'Recipient Name',
      'Award Amount',
      'Awarding Agency',
      'Start Date',
      'Description',
    ],
    limit: limit ?? 25,
    page: page ?? 1,
    sort: sort ?? 'Award Amount',
    order: order ?? 'desc',
  };

  if (!keywords?.length && !time_period?.length && !agencies?.length) {
    body.filters = { keywords: ['federal'] };
  }

  const key = buildCacheKey('/search/spending_by_award/', body);

  return cached(key, () => postJson('/search/spending_by_award/', body), {
    bypassCache,
  });
}

export async function searchSpendingByGeography(
  params: UsaSpendingGeographyParams & UsaSpendingOptions = {}
): Promise<Record<string, unknown>> {
  const { bypassCache, scope, geo_layer, filters } = params;

  const body = {
    scope: scope ?? 'place_of_performance',
    geo_layer: geo_layer ?? 'state',
    filters: filters ?? { time_period: [{ start_date: '2024-10-01', end_date: '2025-09-30' }] },
  };

  const key = buildCacheKey('/search/spending_by_geography/', body);

  return cached(key, () => postJson('/search/spending_by_geography/', body), {
    bypassCache,
  });
}

export async function autocompleteRecipient(
  searchText: string,
  options: UsaSpendingOptions = {}
): Promise<Record<string, unknown>> {
  const query = searchText.trim();

  if (!query) {
    throw new Error('searchText is required');
  }

  const path = `/autocomplete/recipient/?search_text=${encodeURIComponent(query)}`;
  const key = `usaspending:autocomplete:recipient:${query}`;

  return cached(key, () => getJson(path), options);
}

export async function listAgencies(
  options: UsaSpendingOptions = {}
): Promise<Record<string, unknown>> {
  const key = 'usaspending:references/toptier_agencies/';

  return cached(key, () => getJson('/references/toptier_agencies/'), options);
}
