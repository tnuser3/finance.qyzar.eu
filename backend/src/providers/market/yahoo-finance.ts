import { retrieve, store, type CacheOptions } from '../../infra/db/cache';
import { apiFetch } from '../../infra/http/fetch';
import { companyLogos } from './finnhub';

const YAHOO_QUERY1 = 'https://query1.finance.yahoo.com';
const YAHOO_QUERY2 = 'https://query2.finance.yahoo.com';
const USER_AGENT =
  process.env.YAHOO_USER_AGENT ??
  'Mozilla/5.0 (compatible; finance3/1.0; +https://localhost)';

export const PUBLIC_STOCK_CACHE_TTL_MS =
  Number(process.env.PUBLIC_STOCK_CACHE_TTL_MS) || 15 * 60 * 1000;

export interface StockQuote {
  ticker: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  currency: string | null;
  marketState: string | null;
  logo: string | null;
}

export interface PublicStockCacheMeta {
  fromCache: boolean;
  cachedAt: string;
  expiresAt: string;
  ttlMs: number;
}

export interface PublicStockResponse<T> {
  data: T;
  cache: PublicStockCacheMeta;
}

interface CacheEnvelope<T> {
  data: T;
  cachedAt: string;
  expiresAt: string;
}

export type PublicStockOptions = CacheOptions;

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function mapYahooQuote(row: Record<string, unknown>): StockQuote | null {
  const ticker = normalizeTicker(String(row.symbol ?? ''));
  if (!ticker) return null;

  const price = parseNumber(row.regularMarketPrice);
  let change = parseNumber(row.regularMarketChange);
  let changePercent = parseNumber(row.regularMarketChangePercent);

  if (change === null && price !== null) {
    const previousClose = parseNumber(row.regularMarketPreviousClose ?? row.chartPreviousClose);
    if (previousClose !== null) {
      change = round(price - previousClose);
      changePercent = previousClose !== 0 ? round((change / previousClose) * 100) : null;
    }
  }

  return {
    ticker,
    name: String(row.shortName ?? row.longName ?? row.displayName ?? ticker),
    price,
    change,
    changePercent,
    currency: typeof row.currency === 'string' ? row.currency : null,
    marketState: typeof row.marketState === 'string' ? row.marketState : null,
    logo: null,
  };
}

function mapSparkMeta(meta: Record<string, unknown>): StockQuote | null {
  const ticker = normalizeTicker(String(meta.symbol ?? ''));
  if (!ticker) return null;

  const price = parseNumber(meta.regularMarketPrice);
  const previousClose = parseNumber(meta.chartPreviousClose);
  let change: number | null = null;
  let changePercent: number | null = null;

  if (price !== null && previousClose !== null) {
    change = round(price - previousClose);
    changePercent = previousClose !== 0 ? round((change / previousClose) * 100) : null;
  }

  return {
    ticker,
    name: String(meta.shortName ?? meta.longName ?? ticker),
    price,
    change,
    changePercent,
    currency: typeof meta.currency === 'string' ? meta.currency : null,
    marketState: null,
    logo: null,
  };
}

async function yahooFetch(url: string): Promise<Response> {
  return apiFetch('yahoo', url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });
}

async function fetchSparkQuote(ticker: string): Promise<StockQuote> {
  const symbol = normalizeTicker(ticker);
  const url = `${YAHOO_QUERY1}/v7/finance/spark?symbols=${encodeURIComponent(symbol)}&range=1d&interval=1d`;
  const res = await yahooFetch(url);

  if (!res.ok) {
    throw new Error(`Yahoo Finance request failed (${res.status})`);
  }

  const payload = (await res.json()) as {
    spark?: {
      result?: Array<{
        symbol?: string;
        response?: Array<{ meta?: Record<string, unknown> }>;
      }>;
    };
  };

  const meta = payload.spark?.result?.[0]?.response?.[0]?.meta;
  const quote = meta ? mapSparkMeta(meta) : null;

  if (!quote) {
    throw new Error(`No Yahoo Finance quote found for ${symbol}`);
  }

  return quote;
}

async function fetchScreenerQuotes(count: number): Promise<StockQuote[]> {
  const url =
    `${YAHOO_QUERY2}/v1/finance/screener/predefined/saved` +
    `?scrIds=largest_market_cap&count=${count}&region=US&lang=en-US&formatted=false`;

  const res = await yahooFetch(url);

  if (!res.ok) {
    throw new Error(`Yahoo Finance screener request failed (${res.status})`);
  }

  const payload = (await res.json()) as {
    finance?: { result?: Array<{ quotes?: Array<Record<string, unknown>> }> };
  };

  const quotes = payload.finance?.result?.[0]?.quotes ?? [];

  return quotes
    .map((row) => mapYahooQuote(row))
    .filter((quote): quote is StockQuote => quote !== null)
    .slice(0, count);
}

async function attachLogos(quotes: StockQuote[]): Promise<StockQuote[]> {
  if (quotes.length === 0) {
    return quotes;
  }

  const logos = await companyLogos(quotes.map((quote) => quote.ticker));

  return quotes.map((quote) => ({
    ...quote,
    logo: logos[quote.ticker] ?? null,
  }));
}

async function fetchMarketTickerQuotes(count: number): Promise<StockQuote[]> {
  const quotes = await fetchScreenerQuotes(count);
  return attachLogos(quotes);
}

async function withPublicCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: PublicStockOptions = {}
): Promise<PublicStockResponse<T>> {
  const ttlMs = options.ttlMs ?? PUBLIC_STOCK_CACHE_TTL_MS;

  if (!options.bypassCache) {
    const envelope = await retrieve<CacheEnvelope<T>>(key);
    if (envelope && new Date(envelope.expiresAt).getTime() > Date.now()) {
      return {
        data: envelope.data,
        cache: {
          fromCache: true,
          cachedAt: envelope.cachedAt,
          expiresAt: envelope.expiresAt,
          ttlMs,
        },
      };
    }
  }

  const data = await fetcher();
  const cachedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const envelope: CacheEnvelope<T> = { data, cachedAt, expiresAt };

  await store(key, envelope, ttlMs);

  return {
    data,
    cache: {
      fromCache: false,
      cachedAt,
      expiresAt,
      ttlMs,
    },
  };
}

export async function getCompanyStockQuote(
  ticker: string,
  options: PublicStockOptions = {}
): Promise<PublicStockResponse<StockQuote>> {
  const symbol = normalizeTicker(ticker);

  if (!symbol) {
    throw new Error('ticker is required');
  }

  return withPublicCache(
    `public:stock:quote:${symbol}`,
    () => fetchSparkQuote(symbol),
    options
  );
}

export async function getMarketTicker(
  count = 50,
  options: PublicStockOptions = {}
): Promise<PublicStockResponse<StockQuote[]>> {
  const limit = Math.min(Math.max(count, 1), 50);

  return withPublicCache(
    `public:stock:market-ticker:${limit}`,
    () => fetchMarketTickerQuotes(limit),
    options
  );
}

export async function getCompanyStockQuotes(
  tickers: string[],
  options: PublicStockOptions = {}
): Promise<PublicStockResponse<StockQuote[]>> {
  const symbols = [...new Set(tickers.map(normalizeTicker).filter(Boolean))];

  if (symbols.length === 0) {
    throw new Error('at least one ticker is required');
  }

  if (symbols.length === 1) {
    const single = await getCompanyStockQuote(symbols[0]!, options);
    return {
      data: [single.data],
      cache: single.cache,
    };
  }

  const cacheKey = `public:stock:quotes:${symbols.sort().join(',')}`;

  return withPublicCache(
    cacheKey,
    async () => {
      const url =
        `${YAHOO_QUERY1}/v7/finance/spark?symbols=${encodeURIComponent(symbols.join(','))}` +
        '&range=1d&interval=1d';
      const res = await yahooFetch(url);

      if (!res.ok) {
        throw new Error(`Yahoo Finance batch request failed (${res.status})`);
      }

      const payload = (await res.json()) as {
        spark?: {
          result?: Array<{
            symbol?: string;
            response?: Array<{ meta?: Record<string, unknown> }>;
          }>;
        };
      };

      const byTicker = new Map<string, StockQuote>();

      for (const item of payload.spark?.result ?? []) {
        const meta = item.response?.[0]?.meta;
        const quote = meta ? mapSparkMeta(meta) : null;
        if (quote) byTicker.set(quote.ticker, quote);
      }

      return symbols
        .map((symbol) => byTicker.get(symbol))
        .filter((quote): quote is StockQuote => quote !== null);
    },
    options
  );
}
