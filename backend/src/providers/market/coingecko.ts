import { cachedStaleWhileRevalidate, retrieve, store, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';

const PUBLIC_API_BASE =
  process.env.COINGECKO_API_BASE ??
  process.env.coingecko_api_base ??
  'https://api.coingecko.com/api/v3';

const PRO_API_BASE =
  process.env.COINGECKO_PRO_API_BASE ??
  process.env.coingecko_pro_api_base ??
  'https://pro-api.coingecko.com/api/v3';

export type CoinGeckoOptions = CacheOptions & {
  staleMaxMs?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;


export const COINGECKO_DEFAULT_TTL_MS =
  Number(process.env.COINGECKO_CACHE_TTL_MS) || 5 * 60 * 1000;


export const COINGECKO_STALE_MAX_MS =
  Number(process.env.COINGECKO_STALE_MAX_MS) || 7 * DAY_MS;

export const CRYPTO_TICKER_CACHE_TTL_MS =
  Number(process.env.CRYPTO_TICKER_CACHE_TTL_MS) || COINGECKO_DEFAULT_TTL_MS;

export const COINGECKO_SEARCH_TTL_MS =
  Number(process.env.COINGECKO_SEARCH_TTL_MS) || 30 * DAY_MS;

export const COINGECKO_SEARCH_STALE_MS =
  Number(process.env.COINGECKO_SEARCH_STALE_MS) || 90 * DAY_MS;

export const COINGECKO_CHART_TTL_MS =
  Number(process.env.COINGECKO_CHART_CACHE_TTL_MS) || 15 * 60 * 1000;

export const COINGECKO_CHART_STALE_MS =
  Number(process.env.COINGECKO_CHART_STALE_MS) || DAY_MS;

export const COINGECKO_COIN_TTL_MS =
  Number(process.env.COINGECKO_COIN_TTL_MS) || DAY_MS;

export const COINGECKO_TRENDING_TTL_MS =
  Number(process.env.COINGECKO_TRENDING_TTL_MS) || 15 * 60 * 1000;

const SYMBOL_ID_TTL_MS =
  Number(process.env.COINGECKO_SYMBOL_ID_TTL_MS) || 90 * DAY_MS;

function cachePolicyForPath(path: string): { ttlMs: number; staleMaxMs: number } {
  const normalized = path.startsWith('/') ? path : `/${path}`;

  if (normalized === '/search/trending') {
    return { ttlMs: COINGECKO_TRENDING_TTL_MS, staleMaxMs: COINGECKO_CHART_STALE_MS };
  }

  if (normalized === '/search') {
    return { ttlMs: COINGECKO_SEARCH_TTL_MS, staleMaxMs: COINGECKO_SEARCH_STALE_MS };
  }

  if (normalized === '/coins/markets') {
    return { ttlMs: CRYPTO_TICKER_CACHE_TTL_MS, staleMaxMs: COINGECKO_STALE_MAX_MS };
  }

  if (normalized === '/simple/price') {
    return { ttlMs: COINGECKO_DEFAULT_TTL_MS, staleMaxMs: COINGECKO_STALE_MAX_MS };
  }

  if (normalized.includes('/market_chart')) {
    return { ttlMs: COINGECKO_CHART_TTL_MS, staleMaxMs: COINGECKO_CHART_STALE_MS };
  }

  if (normalized.startsWith('/coins/')) {
    return { ttlMs: COINGECKO_COIN_TTL_MS, staleMaxMs: COINGECKO_STALE_MAX_MS };
  }

  return { ttlMs: COINGECKO_DEFAULT_TTL_MS, staleMaxMs: COINGECKO_STALE_MAX_MS };
}

export interface CoinGeckoQueryParams {
  [key: string]: string | number | boolean | undefined;
}

const SYMBOL_TO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  USDC: 'usd-coin',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  TRX: 'tron',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  LINK: 'chainlink',
  MATIC: 'matic-network',
  POL: 'matic-network',
  SHIB: 'shiba-inu',
  LTC: 'litecoin',
  BCH: 'bitcoin-cash',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  XLM: 'stellar',
  NEAR: 'near',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  SUI: 'sui',
  PEPE: 'pepe',
  WIF: 'dogwifcoin',
};

function getApiKey(): string | undefined {
  const key = process.env.COINGECKO_API_KEY ?? process.env.coingecko_api_key;
  return typeof key === 'string' && key.trim().length > 0 ? key.trim() : undefined;
}

function isProTier(): boolean {
  const tier = (process.env.COINGECKO_API_TIER ?? process.env.coingecko_api_tier ?? '')
    .trim()
    .toLowerCase();

  if (tier === 'pro') {
    return true;
  }

  return envTruthy('COINGECKO_PRO', 'coingecko_pro');
}

function envTruthy(...keys: string[]): boolean {
  return keys.some((key) => {
    const value = (process.env[key] ?? '').trim().toLowerCase();
    return value === '1' || value === 'true' || value === 'yes';
  });
}

function getApiBase(): string {
  if (isProTier() && getApiKey()) {
    return PRO_API_BASE;
  }

  return PUBLIC_API_BASE;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const apiKey = getApiKey();

  if (apiKey) {
    headers[isProTier() ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key'] = apiKey;
  }

  return headers;
}

function buildSearchParams(params: CoinGeckoQueryParams): URLSearchParams {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      search.set(key, String(value));
    }
  }

  return search;
}

function buildCacheKey(path: string, search: URLSearchParams): string {
  return `coingecko:${path}:${search.toString()}`;
}

async function fetchJson(path: string, search: URLSearchParams): Promise<unknown> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const query = search.toString();
  const url = `${getApiBase()}${normalizedPath}${query ? `?${query}` : ''}`;
  const res = await apiFetch('coingecko', url, { headers: buildHeaders() });

  if (!res.ok) {
    throw new Error(`CoinGecko request failed (${res.status})`);
  }

  return res.json();
}

async function request<T = unknown>(
  path: string,
  params: CoinGeckoQueryParams = {},
  options: CoinGeckoOptions = {}
): Promise<T> {
  const search = buildSearchParams(params);
  const key = buildCacheKey(path, search);
  const policy = cachePolicyForPath(path);

  return cachedStaleWhileRevalidate(
    key,
    () => fetchJson(path, search),
    {
      bypassCache: options.bypassCache,
      ttlMs: options.ttlMs ?? policy.ttlMs,
      staleMaxMs: options.staleMaxMs ?? policy.staleMaxMs,
    }
  ) as Promise<T>;
}

function looksLikeCoinId(value: string): boolean {
  const trimmed = value.trim();

  return trimmed.includes('-') || trimmed === trimmed.toLowerCase();
}

export async function searchCoins(
  query: string,
  options: CoinGeckoOptions = {}
): Promise<Record<string, unknown>> {
  const trimmed = query.trim();

  if (!trimmed) {
    throw new Error('query is required');
  }

  return request('/search', { query: trimmed }, options);
}

export async function resolveCoinId(
  input: string,
  options: CoinGeckoOptions = {}
): Promise<string> {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error('id or symbol is required');
  }

  if (looksLikeCoinId(trimmed)) {
    return trimmed.toLowerCase();
  }

  const upper = trimmed.toUpperCase();

  if (SYMBOL_TO_ID[upper]) {
    return SYMBOL_TO_ID[upper];
  }

  const cachedId = await retrieve<string>(`coingecko:symbol-id:${upper}`);
  if (typeof cachedId === 'string' && cachedId.length > 0) {
    return cachedId;
  }

  const search = (await searchCoins(trimmed, options)) as {
    coins?: Array<{ id: string; symbol: string; name: string }>;
  };

  const coins = search.coins ?? [];

  if (coins.length === 0) {
    throw new Error(`No CoinGecko coin found for "${input}"`);
  }

  const exact = coins.find((coin) => coin.symbol.toUpperCase() === upper);
  const coinId = (exact ?? coins[0]).id;
  await store(`coingecko:symbol-id:${upper}`, coinId, SYMBOL_ID_TTL_MS);
  return coinId;
}

async function resolveCoinIds(
  values: string[],
  options: CoinGeckoOptions = {}
): Promise<string[]> {
  const ids = await Promise.all(values.map((value) => resolveCoinId(value, options)));
  return [...new Set(ids)];
}

export async function get<T = unknown>(
  path: string,
  params: CoinGeckoQueryParams = {},
  options: CoinGeckoOptions = {}
): Promise<T> {
  return request<T>(path, params, options);
}

export async function price(
  input: {
    id?: string;
    symbol?: string;
    ids?: string[];
    vs_currency?: string;
    include_24hr_change?: boolean;
    include_market_cap?: boolean;
    include_24hr_vol?: boolean;
  },
  options: CoinGeckoOptions = {}
): Promise<Record<string, unknown>> {
  const vsCurrency = (input.vs_currency ?? 'usd').toLowerCase();
  let coinIds: string[] = [];

  if (input.ids?.length) {
    coinIds = await resolveCoinIds(input.ids, options);
  } else if (input.id) {
    coinIds = [await resolveCoinId(input.id, options)];
  } else if (input.symbol) {
    coinIds = [await resolveCoinId(input.symbol, options)];
  } else {
    throw new Error('Provide id, symbol, or ids');
  }

  const raw = (await request<Record<string, Record<string, number>>>(
    '/simple/price',
    {
      ids: coinIds.join(','),
      vs_currencies: vsCurrency,
      include_24hr_change: input.include_24hr_change ?? true,
      include_market_cap: input.include_market_cap ?? true,
      include_24hr_vol: input.include_24hr_vol ?? true,
    },
    options
  )) as Record<string, Record<string, unknown>>;

  return {
    vs_currency: vsCurrency,
    coins: coinIds.map((coinId) => ({
      id: coinId,
      ...(raw[coinId] ?? {}),
    })),
  };
}

export async function coin(
  input: { id?: string; symbol?: string },
  options: CoinGeckoOptions = {}
): Promise<Record<string, unknown>> {
  const coinId = await resolveCoinId(input.id ?? input.symbol ?? '', options);
  return request(`/coins/${coinId}`, {}, options);
}

export async function markets(
  input: {
    vs_currency?: string;
    order?: string;
    per_page?: number;
    page?: number;
    sparkline?: boolean;
    price_change_percentage?: string;
  } = {},
  options: CoinGeckoOptions = {}
): Promise<unknown> {
  return request(
    '/coins/markets',
    {
      vs_currency: (input.vs_currency ?? 'usd').toLowerCase(),
      order: input.order ?? 'market_cap_desc',
      per_page: input.per_page ?? 50,
      page: input.page ?? 1,
      sparkline: input.sparkline ?? false,
      price_change_percentage: input.price_change_percentage ?? '24h',
    },
    options
  );
}

export async function marketChart(
  input: {
    id?: string;
    symbol?: string;
    days?: number | string;
    vs_currency?: string;
    interval?: string;
  },
  options: CoinGeckoOptions = {}
): Promise<Record<string, unknown>> {
  const coinId = await resolveCoinId(input.id ?? input.symbol ?? '', options);
  const days = input.days ?? 30;

  return request(`/coins/${coinId}/market_chart`, {
    vs_currency: (input.vs_currency ?? 'usd').toLowerCase(),
    days,
    ...(input.interval ? { interval: input.interval } : {}),
  }, options);
}

export async function trending(options: CoinGeckoOptions = {}): Promise<unknown> {
  return request('/search/trending', {}, options);
}

export interface CryptoTickerQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  icon: string | null;
}

interface CoinGeckoMarketRow {
  symbol?: string;
  name?: string;
  image?: string;
  current_price?: number;
  price_change_24h?: number;
  price_change_percentage_24h?: number;
}

function mapMarketRow(row: CoinGeckoMarketRow): CryptoTickerQuote | null {
  const symbol = String(row.symbol ?? '').trim().toUpperCase();
  const price = row.current_price;

  if (!symbol || typeof price !== 'number' || !Number.isFinite(price)) {
    return null;
  }

  return {
    symbol,
    name: String(row.name ?? symbol),
    price,
    change: typeof row.price_change_24h === 'number' ? row.price_change_24h : 0,
    changePercent:
      typeof row.price_change_percentage_24h === 'number'
        ? row.price_change_percentage_24h
        : 0,
    icon: typeof row.image === 'string' && row.image.length > 0 ? row.image : null,
  };
}

export async function getCryptoMarketTicker(
  count = 15,
  options: CoinGeckoOptions = {}
): Promise<CryptoTickerQuote[]> {
  const limit = Math.min(Math.max(count, 1), 50);

  const rows = (await markets(
    {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: limit,
      page: 1,
      sparkline: false,
      price_change_percentage: '24h',
    },
    {
      ...options,
      ttlMs: options.ttlMs ?? CRYPTO_TICKER_CACHE_TTL_MS,
      staleMaxMs: options.staleMaxMs ?? COINGECKO_STALE_MAX_MS,
    }
  )) as CoinGeckoMarketRow[];

  return rows
    .map((row) => mapMarketRow(row))
    .filter((item): item is CryptoTickerQuote => item !== null);
}

export interface CryptoPriceBar {
  date: string;
  close: number;
}

function barsFromMarketChartPayload(
  raw: Record<string, unknown>,
  maxPoints = 120
): CryptoPriceBar[] {
  const prices = raw.prices;
  if (!Array.isArray(prices)) {
    return [];
  }

  const bars: CryptoPriceBar[] = [];

  for (const entry of prices) {
    if (!Array.isArray(entry) || entry.length < 2) continue;

    const [ts, price] = entry;
    if (typeof ts !== "number" || typeof price !== "number" || !Number.isFinite(price)) {
      continue;
    }

    bars.push({
      date: new Date(ts).toISOString(),
      close: price,
    });
  }

  if (bars.length <= maxPoints) {
    return bars;
  }

  const step = Math.ceil(bars.length / maxPoints);
  return bars.filter((_, index) => index % step === 0 || index === bars.length - 1);
}

export async function getCryptoChartBars(
  symbol: string,
  days = 7,
  options: CoinGeckoOptions & { interval?: string } = {}
): Promise<CryptoPriceBar[]> {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) {
    throw new Error("symbol is required");
  }

  const boundedDays = Math.min(Math.max(days, 1), 90);
  const raw = (await marketChart(
    {
      symbol: normalized,
      days: boundedDays,
      ...(options.interval ? { interval: options.interval } : {}),
    },
    {
      ...options,
      ttlMs: options.ttlMs ?? COINGECKO_CHART_TTL_MS,
      staleMaxMs: options.staleMaxMs ?? COINGECKO_CHART_STALE_MS,
    }
  )) as Record<string, unknown>;

  const bars = barsFromMarketChartPayload(raw);
  if (bars.length === 0) {
    throw new Error(`no chart data for ${normalized}`);
  }

  return bars;
}

const DEFAULT_CHART_SYMBOLS = [
  'BTC',
  'ETH',
  'SOL',
  'XRP',
  'BNB',
  'ADA',
  'DOGE',
  'AVAX',
  'DOT',
  'LINK',
  'MATIC',
  'UNI',
  'LTC',
  'ATOM',
  'NEAR',
];

function parseChartSymbols(): string[] {
  const raw = process.env.COINGECKO_REFRESH_CHART_SYMBOLS?.trim();
  if (!raw) {
    return DEFAULT_CHART_SYMBOLS;
  }

  return raw
    .split(/[,\s]+/)
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

export async function refreshCoinGeckoCache(): Promise<{
  tickerCount: number;
  chartsAttempted: number;
  chartsSucceeded: number;
}> {
  const limit = Math.min(
    Math.max(Number(process.env.COINGECKO_REFRESH_TICKER_LIMIT) || 15, 1),
    50
  );
  const chartDays = Math.min(
    Math.max(Number(process.env.COINGECKO_REFRESH_CHART_DAYS) || 7, 1),
    90
  );
  const symbols = parseChartSymbols();

  const ticker = await getCryptoMarketTicker(limit);
  const chartResults = await Promise.allSettled(
    symbols.map((symbol) => getCryptoChartBars(symbol, chartDays))
  );

  return {
    tickerCount: ticker.length,
    chartsAttempted: symbols.length,
    chartsSucceeded: chartResults.filter((result) => result.status === 'fulfilled').length,
  };
}
