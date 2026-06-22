import { cached, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';

const DATA_BASE = 'https://data.sec.gov';
const EFTS_BASE = 'https://efts.sec.gov/LATEST/search-index';
const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';

export type EdgarOptions = CacheOptions;

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

function getUserAgent(): string {
  const agent = process.env.SEC_USER_AGENT ?? process.env.sec_user_agent;

  if (!agent?.trim()) {
    throw new Error(
      'SEC_USER_AGENT (or sec_user_agent) is required — format: "AppName email@example.com"'
    );
  }

  return agent.trim();
}

function buildHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'User-Agent': getUserAgent(),
  };
}

function padCik(cik: string | number): string {
  return String(cik).replace(/\D/g, '').padStart(10, '0');
}

function buildCacheKey(endpoint: string, id: string): string {
  return `edgar:${endpoint}:${id}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await apiFetch('edgar', url, { headers: buildHeaders() });

  if (!res.ok) {
    throw new Error(`SEC EDGAR request failed (${res.status}): ${url}`);
  }

  return res.json() as Promise<T>;
}

export async function companyTickers(
  options: EdgarOptions = {}
): Promise<Record<string, TickerEntry>> {
  return cached(
    'edgar:company_tickers',
    () => fetchJson<Record<string, TickerEntry>>(TICKERS_URL),
    options
  );
}

export async function lookupTicker(
  ticker: string,
  options: EdgarOptions = {}
): Promise<{ cik: string; ticker: string; title: string } | null> {
  const symbol = ticker.trim().toUpperCase();
  const map = await companyTickers(options);

  for (const entry of Object.values(map)) {
    if (entry.ticker.toUpperCase() === symbol) {
      return {
        cik: padCik(entry.cik_str),
        ticker: entry.ticker,
        title: entry.title,
      };
    }
  }

  return null;
}

export async function resolveCik(
  tickerOrCik: string,
  options: EdgarOptions = {}
): Promise<string> {
  const input = tickerOrCik.trim();

  if (/^\d+$/.test(input)) {
    return padCik(input);
  }

  const match = await lookupTicker(input, options);

  if (!match) {
    throw new Error(`No SEC CIK found for ticker: ${input}`);
  }

  return match.cik;
}

export async function submissions(
  tickerOrCik: string,
  options: EdgarOptions = {}
): Promise<Record<string, unknown>> {
  const cik = await resolveCik(tickerOrCik, options);
  const url = `${DATA_BASE}/submissions/CIK${cik}.json`;
  const key = buildCacheKey('submissions', cik);

  return cached(key, () => fetchJson(url), options);
}

export async function companyFacts(
  tickerOrCik: string,
  options: EdgarOptions = {}
): Promise<Record<string, unknown>> {
  const cik = await resolveCik(tickerOrCik, options);
  const url = `${DATA_BASE}/api/xbrl/companyfacts/CIK${cik}.json`;
  const key = buildCacheKey('companyfacts', cik);

  return cached(key, () => fetchJson(url), options);
}

export async function companyConcept(
  tickerOrCik: string,
  taxonomy: string,
  concept: string,
  options: EdgarOptions = {}
): Promise<Record<string, unknown>> {
  const cik = await resolveCik(tickerOrCik, options);
  const tax = taxonomy.trim();
  const tag = concept.trim();
  const url = `${DATA_BASE}/api/xbrl/companyconcept/CIK${cik}/${tax}/${tag}.json`;
  const key = buildCacheKey('companyconcept', `${cik}:${tax}:${tag}`);

  return cached(key, () => fetchJson(url), options);
}

export interface EdgarSearchParams {
  query: string;
  forms?: string;
  startDate?: string;
  endDate?: string;
  from?: number;
  size?: number;
}

export async function searchFilings(
  params: EdgarSearchParams & EdgarOptions
): Promise<Record<string, unknown>> {
  const { bypassCache, query, forms, startDate, endDate, from, size } = params;

  if (!query.trim()) {
    throw new Error('query is required');
  }

  const search = new URLSearchParams({
    q: query,
    dateRange: 'custom',
    startdt: startDate ?? '2020-01-01',
    enddt: endDate ?? new Date().toISOString().slice(0, 10),
    from: String(from ?? 0),
    size: String(size ?? 25),
  });

  if (forms) {
    search.set('forms', forms);
  }

  const url = `${EFTS_BASE}?${search}`;
  const key = `edgar:search:${search.toString()}`;

  return cached(key, () => fetchJson(url), { bypassCache });
}
