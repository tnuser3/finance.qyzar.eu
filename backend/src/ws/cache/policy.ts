export const CHART_DAILY_CACHE_TTL_MS =
  Number(process.env.CHART_DAILY_CACHE_TTL_MS) || 6 * 60 * 60 * 1000;


export const CHART_INTRADAY_CACHE_TTL_MS =
  Number(process.env.CHART_INTRADAY_CACHE_TTL_MS) || 5 * 60 * 1000;

const INTRADAY_INTERVALS = new Set([
  'minute',
  '1m',
  '2m',
  '5m',
  '15m',
  '30m',
  'hour',
  'hourly',
  '1h',
  '60',
  'h',
]);

export function isIntradayChartInterval(interval: string | undefined): boolean {
  if (!interval) {
    return false;
  }

  return INTRADAY_INTERVALS.has(interval.trim().toLowerCase());
}

export function stockChartCacheTtl(interval?: string): number {
  return isIntradayChartInterval(interval)
    ? CHART_INTRADAY_CACHE_TTL_MS
    : CHART_DAILY_CACHE_TTL_MS;
}


export function cryptoChartCacheTtl(days: number, interval?: string): number {
  if (isIntradayChartInterval(interval)) {
    return CHART_INTRADAY_CACHE_TTL_MS;
  }

  if (interval?.trim().toLowerCase() === 'daily') {
    return CHART_DAILY_CACHE_TTL_MS;
  }

  return days > 90 ? CHART_DAILY_CACHE_TTL_MS : CHART_INTRADAY_CACHE_TTL_MS;
}

export function viewStockChartCacheKey(
  ticker: string,
  days: number,
  interval?: string
): string {
  const normalizedInterval = interval?.trim().toLowerCase() || 'daily';
  return `viewStockChart:${ticker}:${days}:${normalizedInterval}`;
}

export function viewCryptoChartCacheKey(
  symbol: string,
  days: number,
  interval?: string
): string {
  const normalizedInterval = interval?.trim().toLowerCase() || 'auto';
  return `viewCryptoChart:${symbol}:${days}:${normalizedInterval}`;
}

import type { CacheTier } from './types';

export const CACHE_DEFAULT_TTL_MS =
  Number(process.env.CACHE_DEFAULT_TTL_MS) || 60 * 60 * 1000;

export const CACHE_HOT_TTL_MS =
  Number(process.env.CACHE_HOT_TTL_MS) ||
  Number(process.env.CRYPTO_TICKER_CACHE_TTL_MS) ||
  60_000;

export const CACHE_WARM_TTL_MS =
  Number(process.env.CACHE_WARM_TTL_MS) ||
  Number(process.env.PUBLIC_STOCK_CACHE_TTL_MS) ||
  15 * 60 * 1000;

export const CACHE_MEDIUM_TTL_MS =
  Number(process.env.CACHE_MEDIUM_TTL_MS) ||
  Number(process.env.FMP_CACHE_TTL_MS) ||
  4 * 60 * 60 * 1000;

export const CACHE_COLD_TTL_MS =
  Number(process.env.CACHE_COLD_TTL_MS) ||
  Number(process.env.CHART_DAILY_CACHE_TTL_MS) ||
  6 * 60 * 60 * 1000;

export const CACHE_STATIC_TTL_MS =
  Number(process.env.CACHE_STATIC_TTL_MS) || 7 * 24 * 60 * 60 * 1000;

export const CACHE_INTRADAY_TTL_MS =
  Number(process.env.CHART_INTRADAY_CACHE_TTL_MS) || 5 * 60 * 1000;

export const CACHE_STALE_MAX_MS =
  Number(process.env.CACHE_STALE_MAX_MS) ||
  Number(process.env.COINGECKO_STALE_MAX_MS) ||
  7 * 24 * 60 * 60 * 1000;

const TIER_TTL: Record<CacheTier, number> = {
  hot: CACHE_HOT_TTL_MS,
  warm: CACHE_WARM_TTL_MS,
  medium: CACHE_MEDIUM_TTL_MS,
  cold: CACHE_COLD_TTL_MS,
  static: CACHE_STATIC_TTL_MS,
};

export interface WsPolicyContext {
  event: string;
  days?: number;
  interval?: string;
  limit?: number;
  ticker?: string;
  symbol?: string;
  query?: string;
}

export interface ResolvedPolicy {
  tier: CacheTier;
  ttlMs: number;
  staleMaxMs: number;
}

export function tierTtl(tier: CacheTier): number {
  return TIER_TTL[tier];
}

export function resolveWsPolicy(context: WsPolicyContext): ResolvedPolicy {
  const { event } = context;

  switch (event) {
    case 'viewCryptoMarketTicker':
      return { tier: 'hot', ttlMs: CACHE_HOT_TTL_MS, staleMaxMs: CACHE_STALE_MAX_MS };

    case 'viewMarketTicker':
    case 'getCompanyStock':
      return { tier: 'warm', ttlMs: CACHE_WARM_TTL_MS, staleMaxMs: CACHE_STALE_MAX_MS };

    case 'viewStockChart': {
      const interval = context.interval;
      const ttlMs = stockChartCacheTtl(interval);
      return {
        tier: isIntradayChartInterval(interval) ? 'hot' : 'cold',
        ttlMs,
        staleMaxMs: CACHE_STALE_MAX_MS,
      };
    }

    case 'viewCryptoChart': {
      const days = context.days ?? 7;
      const interval = context.interval;
      const ttlMs = cryptoChartCacheTtl(days, interval);
      const intraday =
        isIntradayChartInterval(interval) ||
        (interval?.trim().toLowerCase() !== 'daily' && days <= 90);
      return {
        tier: intraday ? 'hot' : 'cold',
        ttlMs,
        staleMaxMs: CACHE_STALE_MAX_MS,
      };
    }

    case 'viewCompany':
      return { tier: 'medium', ttlMs: CACHE_MEDIUM_TTL_MS, staleMaxMs: CACHE_STALE_MAX_MS };

    case 'searchCompany':
    case 'companyAutofill':
      return { tier: 'medium', ttlMs: CACHE_MEDIUM_TTL_MS, staleMaxMs: CACHE_STALE_MAX_MS };

    case 'viewApiStatus':
      return { tier: 'warm', ttlMs: CACHE_WARM_TTL_MS, staleMaxMs: CACHE_STALE_MAX_MS };

    default:
      return {
        tier: 'medium',
        ttlMs: CACHE_DEFAULT_TTL_MS,
        staleMaxMs: CACHE_STALE_MAX_MS,
      };
  }
}
