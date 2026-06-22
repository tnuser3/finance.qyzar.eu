import * as watchlist from './watchlist';
import * as snapshots from './snapshots';
import { isProviderAvailable } from '../../providers/command-availability';
import { symbolSearch as avSymbolSearch, companyOverview } from '../../providers/market/alphavantage';
import { symbolSearch as finnhubSymbolSearch, companyProfile as finnhubCompanyProfile } from '../../providers/market/finnhub';
import {
  profile,
  quote,
  searchName,
  searchSymbol,
  stockPeers,
} from '../../providers/market/fmp';
import { tickerSearch as massiveTickerSearch } from '../../providers/market/massive';
import { logError } from '../../infra/db/error-log';

export type SearchProvider = 'fmp' | 'finnhub' | 'alphavantage' | 'massive';

export interface CompanySearchMatch {
  ticker: string;
  name: string;
  industry: string;
  sector: string | null;
  exchange: string | null;
  provider: SearchProvider;
}

export interface CompanySuggestion {
  ticker: string;
  name: string;
  exchange: string | null;
  provider: SearchProvider;
}

export interface CompanyRival {
  ticker: string;
  name: string;
  industry: string;
  source: 'fmp_peers';
  recommendation: string | null;
  riskScore: number | null;
  sentimentScore: number | null;
  growthScore: number | null;
  market: {
    price: number | null;
    change: number | null;
    changePercent: number | null;
  };
}

export interface CompanyAutofillResult {
  query: string;
  suggestions: CompanySuggestion[];
}

export interface CompanySearchResult {
  query: string;
  company: CompanySearchMatch | null;
  
  match: CompanySearchMatch | null;
  rivals: CompanyRival[];
  addedToWatchlist: boolean;
  message: string | null;
}

interface RawCandidate {
  ticker: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  provider: SearchProvider;
  providerScore: number;
}

const TICKER_ALIASES: Record<string, string> = {
  APPL: 'AAPL',
};

const US_EXCHANGE_HINTS = ['NASDAQ', 'NYSE', 'AMEX', 'NYSE ARCA', 'BATS', 'CBOE', 'US'];

function hasFmpKey(): boolean {
  return Boolean(
    process.env.FMP_API_KEY ??
      process.env.fmp_api_key ??
      process.env.FPM_API_KEY ??
      process.env.fpm_api_key
  );
}

function canUseFmp(): boolean {
  return hasFmpKey() && isProviderAvailable('fmp');
}

function hasFinnhubKey(): boolean {
  return Boolean(process.env.FINNHUB_API_KEY ?? process.env.finnhub_api_key);
}

function hasAlphaVantageKey(): boolean {
  return Boolean(
    process.env.ALPHA_VANTAGE_API_KEY ??
      process.env.alphavantage_api_key ??
      process.env.ALPHAVANTAGE_KEY
  );
}

function hasMassiveKey(): boolean {
  return Boolean(
    process.env.MASSIVE_API_KEY ??
      process.env.massive_api_key ??
      process.env.POLYGON_API_KEY ??
      process.env.polygon_api_key
  );
}

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

function extractProfileFields(profileData: unknown): {
  industry: string;
  sector: string | null;
  name: string;
} {
  const row = Array.isArray(profileData) ? profileData[0] : profileData;
  if (!row || typeof row !== 'object') {
    return { industry: 'Unknown', sector: null, name: '' };
  }

  const record = row as Record<string, unknown>;
  return {
    industry: String(record.industry ?? record.sector ?? record.finnhubIndustry ?? 'Unknown'),
    sector: typeof record.sector === 'string' ? record.sector : null,
    name: String(record.companyName ?? record.name ?? ''),
  };
}

function parsePeers(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];

  const record = data as Record<string, unknown>;
  if (typeof record.peersList === 'string') {
    return record.peersList
      .split(',')
      .map((t) => normalizeTicker(t))
      .filter(Boolean);
  }

  if (Array.isArray(record.peers)) {
    return record.peers.map((t) => normalizeTicker(String(t))).filter(Boolean);
  }

  return [];
}

function parseQuote(data: unknown): CompanyRival['market'] {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    return { price: null, change: null, changePercent: null };
  }

  const record = row as Record<string, unknown>;
  return {
    price: Number(record.price ?? record.previousClose ?? record.c) || null,
    change: Number(record.change ?? record.d) || null,
    changePercent:
      Number(record.changesPercentage ?? record.changePercentage ?? record.dp) || null,
  };
}

function scoreCandidate(candidate: RawCandidate, query: string): number {
  const symbol = candidate.ticker;
  const exchange = String(candidate.exchange ?? '').toUpperCase();
  const upperQuery = query.trim().toUpperCase();

  let score = candidate.providerScore;

  if (symbol === upperQuery) score += 200;
  if (candidate.name.toLowerCase() === query.trim().toLowerCase()) score += 150;
  if (candidate.name.toLowerCase().includes(query.trim().toLowerCase())) score += 40;
  if (candidate.currency === 'USD' || !candidate.currency) score += 30;
  if (!symbol.includes('.')) score += 20;
  if (US_EXCHANGE_HINTS.some((hint) => exchange.includes(hint))) score += 80;
  if (symbol.length <= 5) score += 10;

  return score;
}

function mergeCandidates(candidates: RawCandidate[], query: string): RawCandidate[] {
  const merged = new Map<string, RawCandidate & { score: number; providers: Set<SearchProvider> }>();

  for (const candidate of candidates) {
    const ticker = normalizeTicker(candidate.ticker);
    if (!ticker) continue;

    const score = scoreCandidate({ ...candidate, ticker }, query);
    const existing = merged.get(ticker);

    if (!existing) {
      merged.set(ticker, {
        ...candidate,
        ticker,
        score,
        providers: new Set([candidate.provider]),
      });
      continue;
    }

    existing.providers.add(candidate.provider);
    existing.score = Math.max(existing.score, score) + 15 * (existing.providers.size - 1);

    if (!existing.name && candidate.name) existing.name = candidate.name;
    if (!existing.exchange && candidate.exchange) existing.exchange = candidate.exchange;
  }

  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .map(({ providers: _providers, score: _score, ...candidate }) => candidate);
}

async function searchFmpCandidates(query: string): Promise<RawCandidate[]> {
  if (!canUseFmp()) return [];

  const alias = TICKER_ALIASES[query.trim().toUpperCase()];
  const searchTerms = alias ? [query, alias] : [query];
  const rows: RawCandidate[] = [];

  for (const term of searchTerms) {
    const [byName, bySymbol] = await Promise.all([
      searchName(term).catch((error) => {
        logError(error, { source: 'company-search.ts - searchFmpCandidates' });
        return [];
      }),
      searchSymbol(term).catch((error) => {
        logError(error, { source: 'company-search.ts - searchFmpCandidates' });
        return [];
      }),
    ]);

    for (const row of [...parseFmpRows(byName), ...parseFmpRows(bySymbol)]) {
      if (!row.symbol) continue;
      rows.push({
        ticker: normalizeTicker(row.symbol),
        name: row.name ?? row.symbol,
        exchange: row.stockExchange ?? row.exchangeShortName ?? null,
        currency: row.currency ?? null,
        provider: 'fmp',
        providerScore: 25,
      });
    }
  }

  return rows;
}

function parseFmpRows(data: unknown): Array<{
  symbol?: string;
  name?: string;
  currency?: string;
  stockExchange?: string;
  exchangeShortName?: string;
}> {
  if (!Array.isArray(data)) return [];
  return data.filter((row) => row && typeof row === 'object') as Array<{
    symbol?: string;
    name?: string;
    currency?: string;
    stockExchange?: string;
    exchangeShortName?: string;
  }>;
}

async function searchFinnhubCandidates(query: string): Promise<RawCandidate[]> {
  if (!hasFinnhubKey()) return [];

  const data = (await finnhubSymbolSearch(query, { exchange: 'US' }).catch((error) => {
    logError(error, { source: 'company-search.ts - searchFinnhubCandidates' });
    return null;
  })) as
    | { result?: Array<{ symbol?: string; description?: string; displaySymbol?: string; type?: string }> }
    | null;

  const results = data?.result ?? [];

  return results
    .filter((row) => row.symbol && (!row.type || row.type.includes('Common Stock')))
    .map((row) => ({
      ticker: normalizeTicker(String(row.symbol)),
      name: String(row.description ?? row.displaySymbol ?? row.symbol),
      exchange: 'US',
      currency: 'USD',
      provider: 'finnhub' as const,
      providerScore: 20,
    }));
}

async function searchAlphaVantageCandidates(query: string): Promise<RawCandidate[]> {
  if (!hasAlphaVantageKey()) return [];

  const data = (await avSymbolSearch(query).catch((error) => {
    logError(error, { source: 'company-search.ts - searchAlphaVantageCandidates' });
    return null;
  })) as
    | { bestMatches?: Array<Record<string, string>> }
    | null;

  const matches = data?.bestMatches ?? [];

  return matches
    .filter((row) => {
      const region = row['4. region'] ?? '';
      const currency = row['8. currency'] ?? '';
      return region === 'United States' || currency === 'USD';
    })
    .map((row) => ({
      ticker: normalizeTicker(row['1. symbol'] ?? ''),
      name: row['2. name'] ?? row['1. symbol'] ?? '',
      exchange: row['4. region'] ?? null,
      currency: row['8. currency'] ?? null,
      provider: 'alphavantage' as const,
      providerScore: Number(row['9. matchScore'] ?? 0),
    }))
    .filter((row) => row.ticker);
}

async function searchMassiveCandidates(query: string, limit = 10): Promise<RawCandidate[]> {
  if (!hasMassiveKey()) return [];

  const data = (await massiveTickerSearch(query, { limit }).catch((error) => {
    logError(error, { source: 'company-search.ts - searchMassiveCandidates' });
    return null;
  })) as
    | { results?: Array<{ ticker?: string; name?: string; primary_exchange?: string; currency_name?: string }> }
    | null;

  return (data?.results ?? [])
    .filter((row) => row.ticker)
    .map((row) => ({
      ticker: normalizeTicker(String(row.ticker)),
      name: String(row.name ?? row.ticker),
      exchange: row.primary_exchange ?? null,
      currency: row.currency_name ?? null,
      provider: 'massive' as const,
      providerScore: 18,
    }));
}

async function collectCandidates(query: string, massiveLimit = 10): Promise<RawCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const [fmp, finnhub, alphavantage, massive] = await Promise.all([
    searchFmpCandidates(trimmed),
    searchFinnhubCandidates(trimmed),
    searchAlphaVantageCandidates(trimmed),
    searchMassiveCandidates(trimmed, massiveLimit),
  ]);

  return mergeCandidates([...fmp, ...finnhub, ...alphavantage, ...massive], trimmed);
}

export async function autofillCompanies(
  query: string,
  limit = 8
): Promise<CompanyAutofillResult> {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return { query: trimmed, suggestions: [] };
  }

  const candidates = await collectCandidates(trimmed, Math.max(limit, 8));
  const suggestions = candidates.slice(0, limit).map((candidate) => ({
    ticker: candidate.ticker,
    name: candidate.name,
    exchange: candidate.exchange,
    provider: candidate.provider,
  }));

  return { query: trimmed, suggestions };
}

async function enrichCompany(
  ticker: string,
  seed: RawCandidate
): Promise<CompanySearchMatch> {
  let industry = 'Unknown';
  let sector: string | null = null;
  let name = seed.name || ticker;
  let exchange = seed.exchange;
  let provider = seed.provider;

  if (canUseFmp()) {
    try {
      const profileData = await profile(ticker);
      const fields = extractProfileFields(profileData);
      if (fields.industry !== 'Unknown') industry = fields.industry;
      sector = fields.sector;
      if (fields.name) name = fields.name;
    } catch (error) {
      logError(error, { source: 'company-search.ts - enrichCompany' });
    }
  }

  if (industry === 'Unknown' && hasFinnhubKey()) {
    try {
      const profileData = (await finnhubCompanyProfile(ticker)) as Record<string, unknown>;
      if (profileData.name) name = String(profileData.name);
      if (profileData.finnhubIndustry) industry = String(profileData.finnhubIndustry);
      if (profileData.exchange) exchange = String(profileData.exchange);
      provider = 'finnhub';
    } catch (error) {
      logError(error, { source: 'company-search.ts - enrichCompany' });
    }
  }

  if (industry === 'Unknown' && hasAlphaVantageKey()) {
    try {
      const overview = await companyOverview(ticker);
      if (overview.Name) name = String(overview.Name);
      if (overview.Industry) industry = String(overview.Industry);
      if (overview.Sector) sector = String(overview.Sector);
      if (overview.Exchange) exchange = String(overview.Exchange);
      provider = 'alphavantage';
    } catch (error) {
      logError(error, { source: 'company-search.ts - enrichCompany' });
    }
  }

  return {
    ticker,
    name,
    industry,
    sector,
    exchange,
    provider,
  };
}

async function buildPeerRival(ticker: string, excludeTicker: string): Promise<CompanyRival | null> {
  if (!ticker || ticker === excludeTicker) return null;

  const watchEntry = await watchlist.getByTicker(ticker);
  const quoteData = await quote(ticker).catch(async (error) => {
    logError(error, { source: 'company-search.ts - buildPeerRival' });
    return null;
  });

  let name = watchEntry?.name ?? ticker;
  let industry = watchEntry?.industry ?? 'Unknown';

  if (industry === 'Unknown' || name === ticker) {
    try {
      const profileData = await profile(ticker);
      const fields = extractProfileFields(profileData);
      if (fields.name) name = fields.name;
      if (fields.industry !== 'Unknown') industry = fields.industry;
    } catch (error) {
      logError(error, { source: 'company-search.ts - buildPeerRival' });
    }
  }

  let recommendation: string | null = null;
  let riskScore: number | null = null;
  let sentimentScore: number | null = null;
  let growthScore: number | null = null;

  if (watchEntry) {
    const delta = await snapshots.getSnapshotDelta(watchEntry.id);
    const snap = delta.today;
    recommendation = snap?.recommendation ?? null;
    riskScore = snap?.riskScore ?? null;
    sentimentScore = snap?.sentimentScore ?? null;
    growthScore = snap?.growthScore ?? null;
  }

  return {
    ticker,
    name,
    industry,
    source: 'fmp_peers',
    recommendation,
    riskScore,
    sentimentScore,
    growthScore,
    market: parseQuote(quoteData),
  };
}

export async function searchCompany(
  query: string,
  options: { addToWatchlist?: boolean; ticker?: string } = {}
): Promise<CompanySearchResult> {
  const trimmed = query.trim();
  const addToWatchlist = options.addToWatchlist !== false;
  const explicitTicker = options.ticker ? normalizeTicker(options.ticker) : '';

  if (!trimmed && !explicitTicker) {
    return {
      query: trimmed,
      company: null,
      match: null,
      rivals: [],
      addedToWatchlist: false,
      message: 'Enter a company name or ticker.',
    };
  }

  let selected: RawCandidate | null = null;

  if (explicitTicker) {
    selected = {
      ticker: explicitTicker,
      name: trimmed || explicitTicker,
      exchange: null,
      currency: 'USD',
      provider: 'fmp',
      providerScore: 200,
    };
  } else {
    const candidates = await collectCandidates(trimmed, 12);
    selected = candidates[0] ?? null;
  }

  if (!selected) {
    return {
      query: trimmed,
      company: null,
      match: null,
      rivals: [],
      addedToWatchlist: false,
      message: 'No public company matched that search.',
    };
  }

  const company = await enrichCompany(selected.ticker, selected);
  let addedToWatchlist = false;

  if (addToWatchlist) {
    const existing = await watchlist.getByTicker(company.ticker);
    if (!existing) {
      await watchlist.upsertCompany({
        ticker: company.ticker,
        name: company.name,
        industry: company.industry,
        confidence: 55,
        discoveredBy: 'search',
      });
      addedToWatchlist = true;
    }
  }

  const rivalMap = new Map<string, CompanyRival>();

  if (canUseFmp()) {
    try {
      const peersData = await stockPeers(company.ticker);
      const peerTickers = parsePeers(peersData).slice(0, 8);
      for (const peerTicker of peerTickers) {
        const rival = await buildPeerRival(peerTicker, company.ticker);
        if (rival) rivalMap.set(rival.ticker, rival);
      }
    } catch (error) {
      logError(error, { source: 'company-search.ts - searchCompany' });
    }
  }

  const rivals = Array.from(rivalMap.values()).slice(0, 12);
  const message = addedToWatchlist
    ? `${company.name} was added to your watchlist.`
    : rivals.length > 0
      ? `Showing ${company.name} and related peer markets.`
      : null;

  return {
    query: trimmed || company.ticker,
    company,
    match: company,
    rivals,
    addedToWatchlist,
    message,
  };
}
