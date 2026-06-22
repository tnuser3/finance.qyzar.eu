import type { CacheMeta } from "@/lib/cache-types";
import { getCachedWs } from "@/lib/client-cache";
import { wsClient } from "@/lib/ws-client";

export interface MarketTickerQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  logo: string | null;
}

interface ViewMarketTickerItem {
  ticker?: string;
  name?: string;
  price?: number | null;
  change?: number | null;
  changePercent?: number | null;
  logo?: string | null;
}

interface ViewMarketTickerResponse extends Record<string, unknown> {
  ok?: boolean;
  items?: ViewMarketTickerItem[];
  cache?: CacheMeta;
  error?: string;
}

function normalizeMarketTickerItem(
  item: ViewMarketTickerItem
): MarketTickerQuote | null {
  const symbol = String(item.ticker ?? "").trim().toUpperCase();
  const price = item.price;

  if (!symbol || typeof price !== "number" || !Number.isFinite(price)) {
    return null;
  }

  return {
    symbol,
    name: String(item.name ?? symbol),
    price,
    change: typeof item.change === "number" ? item.change : 0,
    changePercent:
      typeof item.changePercent === "number" ? item.changePercent : 0,
    logo: item.logo ?? null,
  };
}

export async function fetchMarketTickerQuotes(
  limit = 50,
  options: { bypassCache?: boolean } = {}
): Promise<MarketTickerQuote[]> {
  const { data } = await getCachedWs({
    tier: "warm",
    namespace: "viewMarketTicker",
    keyParts: { limit },
    bypassCache: options.bypassCache,
    fetch: async (requestOptions) => {
      const response = await wsClient.request<ViewMarketTickerResponse>(
        "viewMarketTicker",
        { limit },
        requestOptions
      );

      const items = response.items ?? [];
      if (items.length === 0) {
        throw new Error(response.error ?? "market ticker returned no items");
      }

      const data = items
        .map((item) => normalizeMarketTickerItem(item))
        .filter((item): item is MarketTickerQuote => item !== null);

      return { data, meta: response.cache };
    },
  });

  return data;
}

export interface CryptoTickerQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  icon: string | null;
}

interface ViewCryptoMarketTickerItem {
  symbol?: string;
  name?: string;
  price?: number;
  change?: number;
  changePercent?: number;
  icon?: string | null;
}

interface ViewCryptoMarketTickerResponse extends Record<string, unknown> {
  ok?: boolean;
  items?: ViewCryptoMarketTickerItem[];
  cache?: CacheMeta;
  error?: string;
}

function normalizeCryptoTickerItem(
  item: ViewCryptoMarketTickerItem
): CryptoTickerQuote | null {
  const symbol = String(item.symbol ?? "").trim().toUpperCase();
  const price = item.price;

  if (!symbol || typeof price !== "number" || !Number.isFinite(price)) {
    return null;
  }

  return {
    symbol,
    name: String(item.name ?? symbol),
    price,
    change: typeof item.change === "number" ? item.change : 0,
    changePercent:
      typeof item.changePercent === "number" ? item.changePercent : 0,
    icon: item.icon ?? null,
  };
}

export async function fetchCryptoMarketTickerQuotes(
  limit = 15,
  options: { bypassCache?: boolean } = {}
): Promise<CryptoTickerQuote[]> {
  const { data } = await getCachedWs({
    tier: "hot",
    namespace: "viewCryptoMarketTicker",
    keyParts: { limit },
    bypassCache: options.bypassCache,
    fetch: async (requestOptions) => {
      const response = await wsClient.request<ViewCryptoMarketTickerResponse>(
        "viewCryptoMarketTicker",
        { limit },
        requestOptions
      );

      const items = response.items ?? [];
      if (items.length === 0) {
        throw new Error(response.error ?? "crypto market ticker returned no items");
      }

      const data = items
        .map((item) => normalizeCryptoTickerItem(item))
        .filter((item): item is CryptoTickerQuote => item !== null);

      return { data, meta: response.cache };
    },
  });

  return data;
}
