import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';

const API_BASE = 'https://lda.gov/api/v1';

export interface LdaListParams {
  page?: number;
  page_size?: number;
  filing_year?: number;
  client_name?: string;
  registrant_name?: string;
  lobbying_activity_general_issue_area?: string;
}

export type LdaOptions = CacheOptions;

function getApiKey(): string | undefined {
  return process.env.LDA_API_KEY ?? process.env.lda_api_key;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const apiKey = getApiKey();

  if (apiKey) {
    headers.Authorization = `Token ${apiKey}`;
  }

  return headers;
}

function buildSearchParams(
  params: Record<string, string | number | undefined>
): URLSearchParams {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  return search;
}

function buildCacheKey(path: string, search: URLSearchParams): string {
  return `lda:${path}:${search.toString()}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiFetch('lda', url, { headers: buildHeaders() });

  if (!res.ok) {
    throw new Error(`LDA API request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

async function request<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  options: LdaOptions = {}
): Promise<T> {
  const search = buildSearchParams(params);
  const suffix = search.toString() ? `?${search}` : '';
  const url = `${API_BASE}/${path}${suffix}`;
  const key = buildCacheKey(path, search);

  return cached(key, () => fetchJson<T>(url), options);
}

export async function listFilings(
  params: LdaListParams & LdaOptions = {}
): Promise<Record<string, unknown>> {
  const { bypassCache, page, page_size, ...filters } = params;

  return request(
    'filings/',
    {
      page: page ?? 1,
      page_size: page_size ?? 25,
      ...filters,
    },
    { bypassCache }
  );
}

export async function getFiling(
  filingUuid: string,
  options: LdaOptions = {}
): Promise<Record<string, unknown>> {
  const id = filingUuid.trim();

  if (!id) {
    throw new Error('filingUuid is required');
  }

  return request(`filings/${id}/`, {}, options);
}

export async function listRegistrants(
  params: LdaListParams & LdaOptions = {}
): Promise<Record<string, unknown>> {
  const { bypassCache, page, page_size, registrant_name } = params;

  return request(
    'registrants/',
    {
      page: page ?? 1,
      page_size: page_size ?? 25,
      ...(registrant_name ? { registrant_name } : {}),
    },
    { bypassCache }
  );
}

export async function listContributions(
  params: LdaListParams & LdaOptions = {}
): Promise<Record<string, unknown>> {
  const { bypassCache, page, page_size, filing_year } = params;

  return request(
    'contributions/',
    {
      page: page ?? 1,
      page_size: page_size ?? 25,
      ...(filing_year ? { filing_year } : {}),
    },
    { bypassCache }
  );
}

export async function listConstants(
  constantType: string,
  options: LdaOptions = {}
): Promise<Record<string, unknown>> {
  const type = constantType.trim();

  if (!type) {
    throw new Error('constantType is required');
  }

  return request(`constants/${type}/`, {}, options);
}
